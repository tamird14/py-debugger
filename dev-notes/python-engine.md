# Python Engine

[← dev-notes](./dev-notes.md)

Python runs entirely in-browser via **Pyodide** (WebAssembly, loaded once per page session). Three Python files are loaded at startup and remain active for the session. There is no server-side Python.

---

## Part 1: General Description

### The Two Python Sides

**Builder side** defines the visual elements and how they animate:
- User writes builder code declaring `Panel`, `Rect`, `Circle`, etc., binding properties to `V("expression")` objects
- At Analyze time, builder code runs via `exec()` in Pyodide globals — this populates `VisualElem._registry` with live element objects
- The builder code is re-run at every Analyze (the registry is cleared first)

**Debugger side** traces the algorithm:
- User writes debugger code (the algorithm being visualized)
- `pythonTracer.py` runs it with `sys.settrace`, recording variables and call stack at every line
- For each traced line, `_serialize_visual_builder()` is called to capture a visual snapshot with all `V()` expressions evaluated against current variables
- The result is two parallel timelines: a visual timeline and a code timeline

### Persistent Memory: `_exec_context`

`_exec_context` is a Python dict that serves as the execution namespace for all debugger code. It persists across interactions:
- Survives between Analyze calls (variables from a previous run remain until overwritten)
- Reused as-is during debug-call sub-runs — the handler sees all prior variables and functions
- Only destroyed on page reload

This is intentional: it allows interactive mode handlers to read and mutate the algorithm's state across multiple clicks.

### Python ↔ TypeScript Bridge

All TypeScript-to-Python calls go through `src/code-builder/services/pythonExecutor.ts`. It manages Pyodide initialization, string escaping, and JSON parsing of results.

---

## Part 2: Builder Side

### Files

| File | Purpose |
|------|---------|
| `src/code-builder/services/visualBuilder.py` | `VisualElem` base class, `Panel`, `DebugCall`, `PopupException`, `_handle_click`, serialization functions |
| `src/code-builder/services/visualBuilderShapes.py` | Concrete shape subclasses with `_serialize()` |

### `VisualElem` — Base Class

Every visual element extends `VisualElem`. Key class-level state:

```python
class VisualElem:
    _registry = []        # All live element instances
    _vis_elem_id = 0      # Auto-incrementing counter
```

**`_elem_id`** — assigned at construction, stable for the lifetime of the element. This is the identity that bridges Python and TypeScript for click dispatch.

**`_vb_id`** — assigned fresh at every serialization call (e.g. `"elem-3"`). Ephemeral — use only for React keys and panel parent references within a single snapshot. See [sharp-edges.md → `_vb_id` is not stable](./sharp-edges.md).

**`_clear_registry()`** — called at the start of every Analyze. Clears `_registry` and resets the `_vis_elem_id` counter. Does **not** reset `_exec_context`.

**`_serialize_base()`** — fields every element emits:
```python
{
    "position": [row, col],   # Panel-relative if element has a panelId
    "visible": bool,
    "alpha": float,
    "_elem_id": int,
    "panelId": str or None,   # Parent panel's _vb_id (assigned just before this call)
}
```

**`__getattribute__` patch** — `pythonTracer.py` replaces `VisualElem.__getattribute__` with `get_v_attr`. Any property access on a `VisualElem` subclass automatically calls `.eval()` on `V()` objects. This is what makes `V("i+1")` bindings work during serialization.

### Shape Classes (`visualBuilderShapes.py`)

| Class | Key constructor args | Clickable |
|-------|---------------------|-----------|
| `Rect` | `panel, row, col, width, height, color` | Yes (extends BasicShape in TS) |
| `Circle` | `panel, row, col, radius, color` | Yes |
| `Arrow` | `panel, start_row, start_col, end_row, end_col` | Yes |
| `Label` | `panel, row, col, text` | No (TS does not set `_elemId`) |
| `Array` | `panel, row, col, values` | No |
| `Array2D` | `panel, row, col, values` | No |

### `Panel`

Container element. Children store positions relative to the panel's top-left corner in Python serialization. TypeScript resolves them to absolute grid coordinates in `loadVisualBuilderObjects()`. See [visual-elements.md](./visual-elements.md).

### `DebugCall` Sentinel

```python
class DebugCall:
    def __init__(self, expression: str):
        self.expression = expression
```

If `on_click` returns a `DebugCall` instance, `_handle_click` extracts its `.expression` string and returns it to TypeScript. TypeScript then initiates a debug sub-run. Returning anything else (or `None`) is a simple handler — no sub-run.

### `PopupException`

A user-facing error. Raised when `MAX_TRACE_STEPS` is exceeded or for other user-visible errors. Caught by TypeScript and displayed as a popup message.

### Serialization Functions

**`_serialize_visual_builder()`**:
1. Assigns fresh `_vb_id` to every element in `_registry`
2. Sorts panels to the front (so children can reference their parent's `_vb_id`)
3. Calls `_serialize()` on each element, assembling a JSON array

**`_serialize_handlers() → dict`** — returns a Python dict `{ elem_id: ["on_click"] }`. Used **only** inside `_visual_code_trace` where the whole result is wrapped in a single `json.dumps`.

**`_serialize_handlers_json() → str`** — returns `json.dumps(...)` of the same dict. Used by TypeScript direct calls (`executeClickHandler`). **Never embed this inside another `json.dumps`** — it would double-encode. See [sharp-edges.md](./sharp-edges.md).

**`_handle_click(elemId, row, col)`** — finds the element with matching `_elem_id`, calls its `on_click(row, col)`, returns `DebugCall.expression` string or `None`.

---

## Part 3: Debugger Side

### File

| File | Purpose |
|------|---------|
| `src/debugger-panel/pythonTracer.py` | Tracer, `_exec_context`, `V()` class, timeline building |

### `_exec_context` — The Persistent Namespace

```python
_exec_context: dict = {}
```

The execution namespace for all debugger code. Separate from Pyodide globals (which hold `Panel`, `Rect`, `V`, etc. from the builder side).

| Event | What happens to `_exec_context` |
|-------|----------------------------------|
| First Analyze | Re-created: `{'__builtins__': __builtins__}` |
| Subsequent Analyzes (same session) | Re-created — but old functions that were removed from the code may still be callable via closures. See [sharp-edges.md](./sharp-edges.md). |
| Debug-call sub-run | **Reused as-is** (`persistent=True`) — all prior variables and functions are visible |
| Back to Interactive | Unchanged — mutations from sub-run accumulate |
| Page reload | Destroyed — only full reset |

What lives here: all module-level variables and functions from debugger code, `__builtins__`, and after a debug-call sub-run: the injected `debug_call` function.

### `sys.settrace` — Line-by-Line Tracing

```python
sys.settrace(_trace_function)
exec(compiled, _exec_context)   # fires _trace_function on each line
sys.settrace(None)              # always restored in finally block
```

**`_trace_function(frame, event, arg)`** — records a step when all filter conditions pass:
1. `event == 'line'` — only line-execution events (ignores `call`, `return`, `exception`)
2. `frame.f_code.co_filename in ('<exec>', '<string>')` — only user code, not stdlib
3. `frame.f_code.co_name` does not start with `_` — skips internal helpers

**Per step, records:**
```python
{
    'variables': _capture_variables(frame),  # All visible variables, serialized
    'scope': [(funcName, lineNumber), ...]   # Call stack, innermost last; <module> → _main_
}
```

**`MAX_TRACE_STEPS = 1000`** — after 1000 steps, raises `PopupException` to prevent infinite loops from hanging the browser.

### `_capture_variables(frame)`

Collects all visible variables from a frame into `{ name: { type, value } }`.

**Scope walk (function frames):**
1. `frame.f_locals` — function locals
2. Walk `frame.f_back` chain for enclosing scopes (closures), innermost wins
3. `frame.f_globals` for module-level variables not yet captured

This ensures `V("arr[i]")` inside a nested function correctly sees `arr` from the outer module scope.

**Type serialization:**

| Python type | Serialized as |
|-------------|---------------|
| `bool` | `{ type: 'int', value: 0 or 1 }` |
| `int`, `float` | `{ type: 'int'/'float', value }` |
| `str` | `{ type: 'str', value }` |
| `list[int/float/bool]` | `{ type: 'arr[int]', value: [...] }` |
| `list[str]` | `{ type: 'arr[str]', value: [...] }` |
| `list[list[int]]` | `{ type: 'arr2d[int]', value: [[...], ...] }` |
| everything else | **not captured** (silently skipped) |

Variables starting with `_` and `__builtins__`, `__name__`, `__doc__` are excluded.

### `V()` — Lazy Expression Evaluation

```python
class V:
    params = {}    # class variable: current step's variables (see sharp-edges.md)
    scope = []

    SAFE_GLOBALS = { "len": len, "sum": sum, "min": min, "max": max,
                     "abs": abs, "round": round, "sorted": sorted }

    def __init__(self, expr: str):
        self.expr = expr     # Stored, not evaluated at construction

    def eval(self):
        params = {k: v['value'] for k, v in V.params.items()}
        return eval(self.expr, {"__builtins__": {}}, {**V.SAFE_GLOBALS, **params})
        # On any exception: returns self.expr (the expression string unchanged)
```

`V.params` is a **class variable** shared across all `V()` instances. It is set once per step before `_serialize_visual_builder()` is called. The `__getattribute__` patch on `VisualElem` triggers `.eval()` automatically whenever a property is accessed during serialization.

Example: `rect.width = V("i + 1")` → at step where `i=3`, accessing `rect.width` returns `4`.

### `_visual_code_trace(code, persistent=False)` — Main Entry Point

Called by TypeScript for both initial trace and debug-call sub-runs.

```
1. _run_with_trace(code, persistent)   → fills _trace_steps list
2. Back-fill pass (reverse):
       next_params = {}
       for step in code_trace[::-1]:
           next_params.update(step['variables'])
           step['variables'].update(next_params)
   (Makes variables visible at steps before they're first assigned)
3. Build visual timeline:
       for step in code_trace:
           V.params = step['variables']
           V.scope  = step['scope']
           snapshot = _serialize_visual_builder()
           timeline.append(json.loads(snapshot))
4. Fallback: if no traceable lines → one-step timeline with current visual state
5. Return json.dumps({ code_timeline, visual_timeline, handlers })
```

**Note on `handlers` in return:** `_serialize_handlers()` (Python dict) is embedded directly in the outer `json.dumps` — do not replace with `_serialize_handlers_json()`.

### `_prepare_and_trace_debug_call(expression, line_offset)`

Wraps a user expression as a function, shifts AST line numbers so Monaco highlights land on the correct rows in the combined editor view, then traces it.

```python
func_source = f"def debug_call():\n    {expression}"
tree = ast.parse(func_source)
ast.increment_lineno(tree, line_offset)   # line_offset = len(debuggerCode lines) + 2
exec(compile(tree, '<exec>', 'exec'), _exec_context)
return _visual_code_trace('debug_call()', True)
```

TypeScript computes the offset: `const lineOffset = debuggerCode.split('\n').length + 2`.

---

## Part 4: Python ↔ TypeScript Bridge

All calls go through `src/code-builder/services/pythonExecutor.ts`.

| TypeScript function | Python call | Returns |
|--------------------|-------------|---------|
| `executePythonCode(vbCode, dbgCode)` | `exec(vbCode)` then `_visual_code_trace(dbgCode)` | `{ code_timeline, visual_timeline, handlers }` JSON |
| `executeClickHandler(elemId, row, col)` | `_handle_click` + `_serialize_visual_builder` + `_serialize_handlers_json` | `{ snapshot, debugCall?: string }` |
| `executeDebugCall(expression, lineOffset)` | `_prepare_and_trace_debug_call(expr, offset)` | Same shape as `executePythonCode` |

### Output Capture

Python `print()` output is captured by redirecting `sys.stdout` before each execution. Output is segmented in `src/output-terminal/terminalState.ts`:
- **Builder** tab: output from `exec(visualBuilderCode)`
- **Debugger** tab: output from `_visual_code_trace(debuggerCode)`
- **Combined** tab: both together

### Key Files Summary

| File | Purpose |
|------|---------|
| `src/code-builder/services/visualBuilder.py` | VisualElem, Panel, DebugCall, serialization, click dispatch |
| `src/code-builder/services/visualBuilderShapes.py` | Concrete shape subclasses |
| `src/debugger-panel/pythonTracer.py` | Tracer, V(), _exec_context, timeline building |
| `src/code-builder/services/pythonExecutor.ts` | All TypeScript↔Pyodide calls |
| `src/output-terminal/terminalState.ts` | Output capture and tab segmentation |
