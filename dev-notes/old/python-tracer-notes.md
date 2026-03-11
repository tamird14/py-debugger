# Developer Notes — Python Tracer

**File:** `src/debugger-panel/pythonTracer.py`
**Loaded after:** `visualBuilder.py`, `visualBuilderShapes.py` (patches `VisualElem.__getattribute__`)

---

## Overview

`pythonTracer.py` does three things:

1. Runs user debugger code inside a persistent dict (`_exec_context`) with `sys.settrace` active
2. After the run, re-builds a timeline of `(variables, visual_snapshot)` pairs for every traced line
3. Provides `V()` — a lazy-evaluated expression object whose value is resolved per timeline step

---

## `_exec_context` — The Persistent Namespace

```python
_exec_context: dict = {}
```

This dict is the execution namespace for all user debugger code. It is intentionally separate
from Pyodide's module globals (which hold visual builder objects like panels and shapes).

**Lifecycle:**

| Event | What happens to `_exec_context` |
|-------|----------------------------------|
| First Analyze | Re-created: `{'__builtins__': __builtins__}` |
| Subsequent Analyzes (same session) | Re-created — stale variables from prior run remain until overwritten |
| Debug-call sub-run | **Reused as-is** (`persistent=True`) — all prior variables and functions are visible |
| Back to Interactive | Unchanged — mutations from sub-run accumulate |
| Page reload | Destroyed — only reset that clears everything |

**Why separate from Pyodide globals?**
Visual builder code (`exec(visualBuilderCode)`) runs in Pyodide globals, which contain `Panel`,
`Rect`, `V`, etc. Debugger code (user's algorithm) must not collide with these names. The
`_exec_context` dict is the sandbox.

**What lives in `_exec_context`:**
- All variables defined at module level in debugger code (`arr`, `n`, etc.)
- All functions defined in debugger code (`def temp(): ...`, etc.)
- `__builtins__` (standard Python built-ins)
- After a debug-call sub-run: `debug_call` function (injected by `_prepare_and_trace_debug_call`)

**Sharp edge:** `_clear_registry()` clears `VisualElem._registry` (visual elements) but does NOT
reset `_exec_context`. Variables from a previous Analyze are still reachable unless overwritten.
In practice this rarely matters because `exec(debuggerCode)` re-defines them; but old functions
that were removed from the code may still be callable.

---

## `sys.settrace` — Line-by-Line Tracing

```python
sys.settrace(_trace_function)
exec(compiled, _exec_context)   # fires _trace_function on each line
sys.settrace(None)              # always restored in finally block
```

### `_trace_function(frame, event, arg)`

Called by the Python interpreter for every code event. Returns itself to stay active.

**Filter — only records when ALL of these are true:**
1. `event == 'line'` — only line-execution events (ignores `call`, `return`, `exception`)
2. `frame.f_code.co_filename in ('<exec>', '<string>')` — only user code, not standard library
3. `frame.f_code.co_name` does not start with `_` — skips internal helpers

**What it records per step:**

```python
{
  'variables': _capture_variables(frame),  # All visible variables, serialized
  'scope': [(funcName, lineNumber), ...]   # Call stack, innermost last
}
```

Scope walks `frame → frame.f_back → ...` and collects `(co_name, f_lineno)` for every frame
whose file is user code, building a call stack. `<module>` is renamed to `_main_`.

**`MAX_TRACE_STEPS = 1000`**
After recording a step, if `len(_trace_steps) >= MAX_TRACE_STEPS`, raises `PopupException`
(a user-facing error class defined in `visualBuilder.py`). This propagates out through
`_run_with_trace` (the `finally` block still restores stdout and settrace), and is caught by
the TypeScript error handler, displaying a friendly message. Prevents infinite loops from
hanging the browser.

---

## `_capture_variables(frame)`

Collects all visible variables from a frame into `{ name: { type, value } }`.

**Scope walk (for function frames):**
When inside a function (`frame.f_locals is not frame.f_globals`):
1. Add `frame.f_locals` (function locals)
2. Walk `frame.f_back` chain for enclosing function scopes (closures), adding variables
   not already captured (innermost wins)
3. Add `frame.f_globals` for module-level variables not yet captured

This ensures V-expressions referencing outer scope variables (e.g., `V("arr[i]")` from a
nested function that sees `arr` from the enclosing module scope) still evaluate correctly.

**Type serialization:**

| Python type | Serialized as |
|-------------|---------------|
| `bool` | `{ type: 'int', value: 0 or 1 }` |
| `int`, `float` | `{ type: 'int'/'float', value }` |
| `str` | `{ type: 'str', value }` |
| `list[int/float/bool]` | `{ type: 'arr[int]', value: [...] }` |
| `list[str]` | `{ type: 'arr[str]', value: [...] }` |
| `list[list[int]]` | `{ type: 'arr2d[int]', value: [[...], ...] }` |
| everything else | **not captured** (skipped silently) |

Variables starting with `_` and reserved names (`__builtins__`, `__name__`, `__doc__`) are
excluded.

---

## `_visual_code_trace(code, persistent=False)` — Main Entry Point

Called by TypeScript as:
- `_visual_code_trace(debuggerCode)` — initial trace (fresh context)
- `_visual_code_trace('debug_call()', True)` — sub-run (persistent context)

**Algorithm:**

```python
_run_with_trace(code, persistent)   # 1. Execute with settrace; fills _trace_steps

# 2. Back-fill: variables defined later in the trace are made visible at earlier steps
#    (e.g. if `n` is first assigned at step 10, it's surfaced in steps 0-9 too)
next_params = {}
for step in code_trace[::-1]:       # reverse pass
    next_params.update(step['variables'])
    step['variables'].update(next_params)

# 3. Build visual timeline: one snapshot per code step
for step in code_trace:
    V.params = step['variables']    # Set global evaluation context
    V.scope = step['scope']
    snapshot = _serialize_visual_builder()  # Evaluates all V() properties
    timeline.append(json.loads(snapshot))

# 4. Fallback: if no traceable lines, return current visual state as one step
if not timeline:
    timeline = [json.loads(_serialize_visual_builder())]
    code_trace = [{'variables': {}, 'scope': []}]

return json.dumps({ code_timeline, visual_timeline, handlers })
```

**Key design — back-fill:**
The reverse pass ensures that if `temp()` is defined at step 15, it appears in the variables
panel at step 0. Without it, functions only become visible in the variable panel after they're
defined.

**`handlers` in return value:**
`_serialize_handlers()` returns a **Python dict** (not JSON string). It is embedded directly
in the outer `json.dumps` call. Do not replace this with `_serialize_handlers_json()` — that
would double-encode it.

---

## `_prepare_and_trace_debug_call(expression, line_offset)`

Injects the user's expression as a function into `_exec_context`, with line numbers shifted
to match its visual position in the combined code panel, then traces it.

```python
def _prepare_and_trace_debug_call(expression: str, line_offset: int) -> str:
    import ast as _ast
    func_source = f"def debug_call():\n    {expression}"
    tree = _ast.parse(func_source)              # Parse with line numbers starting at 1
    _ast.increment_lineno(tree, line_offset)    # Shift all AST node line numbers
    exec(compile(tree, '<exec>', 'exec'), _exec_context)
    return _visual_code_trace('debug_call()', True)
```

**Why the line offset?**
The Monaco editor shows the combined code:
```
<original debugger code — N lines>
                                    ← blank line
                                    ← blank line
def debug_call():
    <expression>
```
Without the offset, trace steps would report line 1 and 2. With `line_offset = N + 2`,
they report the correct lines so Monaco's line-highlight decoration lands on the right rows.

**TypeScript computes the offset:**
```typescript
const lineOffset = debuggerCode.split('\n').length + 2;
```

---

## V() — Lazy Expression Evaluation

```python
class V:
    params = {}    # class variable: current step's variables
    scope = []

    SAFE_GLOBALS = { "len": len, "sum": sum, "min": min, "max": max,
                     "abs": abs, "round": round, "sorted": sorted }

    def __init__(self, expr: str):
        self.expr = expr     # Stored, not evaluated

    def eval(self):
        try:
            params = {k: v['value'] for k, v in V.params.items()}
            return eval(self.expr, {"__builtins__": {}}, {**V.SAFE_GLOBALS, **params})
        except Exception:
            return self.expr  # Fallback: return expression string unchanged
```

**Auto-evaluation hook:**
```python
def get_v_attr(self, name):
    value = object.__getattribute__(self, name)
    if isinstance(value, V):
        return value.eval()
    return value

VisualElem.__getattribute__ = get_v_attr
```

Any property access on a `VisualElem` subclass automatically evaluates `V()` objects.
`_serialize_visual_builder()` accesses element properties during serialization, triggering
evaluation against the current `V.params`.

**Evaluation context:**
- `{"__builtins__": {}}` — disables all built-ins except those in `SAFE_GLOBALS`
- `{**V.SAFE_GLOBALS, **params}` — adds safe functions + current variable values

**Example:**
```python
# In visual builder code:
rect.width = V("i + 1")

# At trace step where i=3:
V.params = {'i': {'type': 'int', 'value': 3}, ...}
# Accessing rect.width → V("i + 1").eval() → eval("i + 1", ..., {'i': 3, ...}) → 4
```

**Sharp edge: `V.params` is a shared class variable.**
All V() instances see the same `V.params`. If `_serialize_visual_builder()` is ever called
outside of the step-building loop (e.g., from `executeClickHandler`), `V.params` holds
whatever was set by the last timeline build. This is usually the final trace step, which is
intentional for interactive mode (shows the final state).
