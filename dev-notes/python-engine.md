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
    "z": int,                 # Depth layer; lower z = closer = rendered on top (default 0)
    "_elem_id": int,
    "panelId": str or None,   # Parent panel's _vb_id (assigned just before this call)
}
```

**`__getattribute__` patch** — `pythonTracer.py` replaces `VisualElem.__getattribute__` with `get_v_attr`. Any property access on a `VisualElem` subclass automatically calls `.eval()` on `V()` objects. This is what makes `V("i+1")` bindings work during serialization.

### Shape Classes (`visualBuilderShapes.py`)

All shape constructors accept `z=0` as a keyword argument (see z-depth ordering below).

| Class | Key constructor args | Clickable |
|-------|---------------------|-----------|
| `Rect` | `panel, row, col, width, height, color` | Yes (extends BasicShape in TS) |
| `Circle` | `panel, row, col, radius, color` | Yes |
| `Arrow` | `panel, start_row, start_col, end_row, end_col` | Yes |
| `Line` | `start, end, color, stroke_weight, start_offset, end_offset, start_cap, end_cap` | No (implements `VisualBuilderElementBase` directly in TS) |
| `Label` | `panel, row, col, text` | No (TS does not set `_elemId`) |
| `Array` | `panel, row, col, values` | No |
| `Array2D` | `panel, row, col, values` | No |

`Line` has no `panel` argument — it specifies absolute start/end grid cells. `start_offset` and `end_offset` are `(row_frac, col_frac)` fractions within the cell (0.0–1.0). `start_cap`/`end_cap` can be `'none'` or `'arrow'`.

### `Panel`

Container element. Children store positions relative to the panel's top-left corner in Python serialization. TypeScript resolves them to absolute grid coordinates in `loadVisualBuilderObjects()`. See [visual-elements.md](./visual-elements.md).

### `DebugCall` and `RunCall` Sentinels

```python
class DebugCall:
    def __init__(self, expression: str):
        self.expression = expression

class RunCall:
    def __init__(self, expression: str):
        self.expression = expression
```

If `on_click` returns a **`DebugCall`** instance, the expression is wrapped into a function and traced as a sub-run. TypeScript enters `debug_in_event` mode with a full navigable timeline.

If `on_click` returns a **`RunCall`** instance, `_execute_run_call(expression)` is called: the expression is `exec()`-d silently in `_exec_context` (no tracing), and the resulting visual snapshot is returned for an immediate visual refresh. No mode change, no timeline — cheaper than `DebugCall` when you just want to mutate state and redraw.

Returning anything else (or `None`) is a simple handler — Python updates element state, the snapshot is re-serialized, and the grid re-renders.

### `PopupException`

A user-facing error. Raised when `MAX_TRACE_STEPS` is exceeded or for other user-visible errors. Caught by TypeScript and displayed as a popup message.

### Serialization Functions

**`_serialize_visual_builder()`**:
1. Assigns fresh `_vb_id` to every element in `_registry`
2. Sorts panels to the front (so children can reference their parent's `_vb_id`)
3. Calls `_serialize()` on each element, assembling a JSON array

**`_serialize_handlers() → dict`** — returns a Python dict `{ elem_id: ["on_click"] }`. Used **only** inside `_visual_code_trace` where the whole result is wrapped in a single `json.dumps`.

**`_serialize_handlers_json() → str`** — returns `json.dumps(...)` of the same dict. Used by TypeScript direct calls (`executeClickHandler`). **Never embed this inside another `json.dumps`** — it would double-encode. See [sharp-edges.md](./sharp-edges.md).

**`_handle_click(elemId, row, col)`** — finds the element with matching `_elem_id`, calls its `on_click(row, col)`, returns `('debug', expression)`, `('run', expression)`, or `('none', None)`.

**`_handle_click_with_output(elemId, row, col)`** — wrapper that captures stdout during the handler. Returns JSON `{ debugCall, runCall, output }`. Called by TypeScript's `executeClickHandler`.

**`_execute_run_call(expression)`** — executes expression silently in `_exec_context`, re-serializes visual state, returns JSON `{ snapshot, handlers, output }`.

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

**`_trace_function(frame, event, arg)`** — dispatches on `event` type:

**`'line'` events** — records a `_trace_steps` entry when:
1. `frame.f_code.co_filename in ('<exec>', '<string>')` — only user code, not stdlib
2. `frame.f_code.co_name` does not start with `_` — skips internal helpers

Per step records:
```python
{
    'variables': _capture_variables(frame),  # All visible variables, raw Python values
    'scope': [(funcName, lineNumber), ...]   # Call stack, innermost last; <module> → _main_
}
```

**`'call'` and `'return'` events** — records a `_function_events` entry (separate list) when:
1. `frame.f_code.co_filename in ('<exec>', '<string>')` — only user code
2. `_is_traceable_func(name)` — keeps dunder methods (`__init__` etc.) and public functions; skips single-underscore private helpers

Each entry is a tuple `(step_index, event_type, func_name, data)` where:
- `step_index = len(_trace_steps)` at the time of the event (associates the event with the *next* upcoming line step)
- `data` for `'call'`: dict of function arguments excluding `self`
- `data` for `'return'` from `__init__`: `frame.f_locals['self']` (the constructed object); for all other functions: `copy.deepcopy(arg)` (the return value)

**`MAX_TRACE_STEPS = 1000`** — after 1000 steps, raises `PopupException` to prevent infinite loops from hanging the browser.

### `_capture_variables(frame, exclude_vars, memo)`

Collects all visible variables from a frame as **raw Python values**: `{ name: raw_python_value }`.

**Scope walk (function frames):**
1. `frame.f_locals` — function locals
2. Walk `frame.f_back` chain for enclosing scopes (closures), innermost wins
3. `frame.f_globals` for module-level variables not yet captured

This ensures `V("arr[i]")` inside a nested function correctly sees `arr` from the outer module scope.

Variables starting with `_` are excluded. Callables and class objects are silently skipped.

**`memo` parameter:** an optional dict shared across all `deepcopy` calls in one step. Passing the same `memo` ensures the same original object always maps to the same copy within a step. The trace loop passes a fresh `memo` each step and exposes it as `R.registry` afterwards.

### Two-Step Variable Serialization

`TraceStep.variables` holds **raw Python objects** throughout the trace (backfill pass, V-expressions, builder `update()` call). Type conversion to JSON-safe `VariableValue` dicts happens only at the TypeScript boundary, right before `json.dumps`, via `_serialize_variables_for_ts()`.

This means V-expressions and builder code receive actual Python objects — `V("d[0]")` works on int-keyed dicts, `V("obj.attr")` works on custom objects.

**`_serialize_value_for_ts(value)`** — converts one value to `{ type, value }`:

| Python type | `type` label | `value` in JSON |
|---|---|---|
| `bool` | `'int'` | `1` or `0` |
| `int`, `float` | `'int'`, `'float'` | value |
| `str` | `'str'` | value |
| `None` | `'none'` | `null` |
| `list[int/float/bool]` | `'arr[int]'` | `[int, ...]` |
| `list[str]` | `'arr[str]'` | `[str, ...]` |
| `list[list[int]]` | `'arr2d[int]'` | `[[int, ...], ...]` |
| `tuple` | `'tuple'` | `list(value)` |
| `dict` | `'dict'` | `{str(k): json_leaf(v), ...}` (capped at 50) |
| `set` | `'set'` | sorted array |
| any other object | `type(value).__name__` | `repr(value)[:200]` |

Custom objects use the Python class name as the type label and `repr()` as the value — the class's `__repr__` controls display. `VariablePanel.tsx` displays known type labels with Python-syntax formatting; unknown type labels (class names) fall through to `String(value)`.

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
        # V.params holds raw Python values (not VariableValue wrappers)
        return eval(self.expr, {"__builtins__": {}}, {**V.SAFE_GLOBALS, **V.params})
        # On any exception: returns self.expr (the expression string unchanged)
```

`V.params` is a **class variable** shared across all `V()` instances. It is set once per step before `_serialize_visual_builder()` is called. The `__getattribute__` patch on `VisualElem` triggers `.eval()` automatically whenever a property is accessed during serialization.

Example: `rect.width = V("i + 1")` → at step where `i=3`, accessing `rect.width` returns `4`.

### `R` — Stable Object Reference Across Steps

Each `deepcopy` step creates new Python objects, so an object captured at step 3 and an object at step 5 have different `id()`s even if they represent the same logical node. `R` bridges this by storing the **original id** and re-resolving to the current step's copy on every attribute access.

```python
# Builder never constructs R directly — it receives R from params (a TrackedDict)
slow_ref = None

def update(params, scope):
    global slow_ref
    slow_r = params.get('slow')   # params is a TrackedDict; values are R objects
    if slow_r is not None:
        slow_ref = slow_r          # store once — re-resolves every step automatically

    if slow_ref is not None:
        node = slow_ref.resolve()  # current step's copy of the tracked node
        if node is not None:
            highlight.position = panels[node.val].position
```

**How it works:**

| Component | Role |
|-----------|------|
| `R.registry` | `{id(original_obj): current_step_copy}` — set per step from `deepcopy` memo |
| `R.inv_registry` | `{id(current_step_copy): id(original_obj)}` — used to wrap objects into R |
| `R._wrap(obj)` | Returns `R(orig_id)` if obj is in registry, raw value for primitives |
| `R.resolve()` | Returns `R.registry[self._orig_id]` — the copy for the current step |
| `R.__getattr__` | Resolves, then calls `R._wrap()` on the result — auto-wraps traversal |
| `TrackedDict` | Wraps the `params` dict passed to `update()`; values auto-wrapped in R |

**Attribute traversal is transparent:**
```python
val = params['root'].left.right.val   # each step: resolves root → left → right → .val
```
Primitives (`int`, `float`, `str`, `bool`, `None`) are always returned unwrapped.

**`R` vs `V`:**

| | `V("expr")` | `R` (from params) |
|---|---|---|
| Stored | expression string | `id` of original object |
| Resolved via | `eval(expr, V.params)` | `R.registry[orig_id]` |
| Good for | computed properties (`V("i+1")`) | tracking a specific object |
| Lives on element property | Yes | Yes (unwrapped at serialization) |

The `__getattribute__` patch on `VisualElem` handles both: `V` objects call `.eval()`; `R` objects call `.resolve()`.

See `src/samples/r-tracking-demo.json` for a working example.

### Builder Hooks: `update`, `function_call`, `function_exit`

Three stubs in `pythonTracer.py` can be overridden by builder code:

```python
def update(params, scope):           pass   # called on every line step
def function_call(function_name, **kwargs): pass   # called on function entry
def function_exit(function_name, value):   pass   # called on function return
```

**`update(params, scope)`** — called for every traced line. `params` is a `TrackedDict` wrapping the raw variables dict. Accessing any key returns an `R` object (or a raw primitive) so the builder can hold references that re-resolve automatically each step.

**`function_call(function_name, **kwargs)`** — called just before the first line inside a function executes:
- `function_name`: the function's `__name__` (e.g. `'__init__'`, `'sort'`)
- `kwargs`: each argument value is R-wrapped (or a raw primitive); excluding `self`
- Dunder methods (`__init__`, `__str__`, etc.) are included; single-underscore helpers are not

**`function_exit(function_name, value)`** — called when a function returns:
- `value` for `__init__`: the constructed `self` object, R-wrapped
- `value` for all other functions: the return value, R-wrapped (or raw primitive)

**R-wrapping in function hooks:** all non-primitive values received in `function_call` kwargs and `function_exit` value are `R` objects, consistent with `update()`'s `TrackedDict`. Attribute access works transparently (`value.val`, `kwargs['node'].next`). The R objects are registered in the live registry so any R stored in a hook will resolve correctly in future `update()` calls.

**`isinstance` does not work on R objects** — use `hasattr` or check `function_name` instead:
```python
# Wrong:
if isinstance(value, Node): ...

# Right:
if function_name == 'Node.__init__' and hasattr(value, 'val'): ...
```

**Timing:** both function hooks are called *before* `update()` for the same line step, so any visual elements they create appear in that step's snapshot. `code_timeline` and `visual_timeline` stay parallel — no extra steps are added.

**Typical use — track object creation:**
```python
def function_exit(function_name, value):
    if function_name == 'Node.__init__' and hasattr(value, 'val'):
        r = Rect()
        r.position = (len(created), 0)
        panel.add(r)
        created.append(r)
```

See `src/samples/linked-list-creation.json` for a working example.

### `_visual_code_trace(code, persistent=False)` — Main Entry Point

Called by TypeScript for both initial trace and debug-call sub-runs.

```
1. _run_with_trace(code, persistent)
       → fills _trace_steps (line events) and _function_events (call/return events)
2. Back-fill pass (reverse):
       next_params = {}
       for step in code_trace[::-1]:
           next_params.update(step['variables'])
           step['variables'].update(next_params)
   (Makes variables visible at steps before they're first assigned)
3. Build visual timeline:
       for step_idx, step in enumerate(code_trace):
           drain _function_events with step_index == step_idx:
               → calls function_call() or function_exit()
           update(step['variables'], step['scope'])   # builder code; raw Python values
           V.params = step['variables']               # raw Python values
           V.scope  = step['scope']
           snapshot = _serialize_visual_builder()
           timeline.append(json.loads(snapshot))
       drain any remaining _function_events (after the last line step)
4. Fallback: if no traceable lines → one-step timeline with current visual state
5. Serialize variables for TypeScript:
       for step in code_trace:
           step['variables'] = _serialize_variables_for_ts(step['variables'])
6. Return json.dumps({ code_timeline, visual_timeline, handlers })
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
| `executeClickHandler(elemId, row, col)` | `_handle_click_with_output` → if `runCall`: `_execute_run_call`; else `_serialize_visual_builder` + `_serialize_handlers_json` | `{ snapshot, debugCall?: string }` |
| `executeDebugCall(expression, lineOffset)` | `_prepare_and_trace_debug_call(expr, offset)` | Same shape as `executePythonCode` |

### Output Capture

Python `print()` output is captured by redirecting `sys.stdout` before each execution. Output is segmented in `src/output-terminal/terminalState.ts`:
- **Builder** tab: output from `exec(visualBuilderCode)`
- **Debugger** tab: output from `_visual_code_trace(debuggerCode)`
- **Combined** tab: both together

### Output Capture — Import Files

Both builder and debugger import files are bundled at build time and written to Pyodide's VFS during `loadPythonRuntime()`, making them importable with standard Python `import` syntax.

**How it works:**
- Files in `src/builder-imports/*.py` → importable in builder code
- Files in `src/debugger-imports/*.py` → importable in debugger code
- Vite's `import.meta.glob('.../*.py', { eager: true, as: 'raw' })` bundles the files at build time
- `py.FS.writeFile('/home/pyodide/<filename>', content)` writes each file to the Pyodide VFS
- `/home/pyodide` is in `sys.path` by default, so `import my_module` works normally

**Tracer behavior with debugger imports:** The tracer only records steps for frames where `co_filename in ('<exec>', '<string>')`. Functions from import files have a real filepath (`/home/pyodide/...`) and are silently skipped — they execute normally but produce no trace steps.

**Future work (TODO):** Allow uploading import files directly in the app while running. At that point, uploaded files would also be persisted in the JSON save/load format.

### Key Files Summary

| File | Purpose |
|------|---------|
| `src/code-builder/services/visualBuilder.py` | VisualElem, Panel, DebugCall, serialization, click dispatch |
| `src/code-builder/services/visualBuilderShapes.py` | Concrete shape subclasses |
| `src/debugger-panel/pythonTracer.py` | Tracer, V(), _exec_context, timeline building |
| `src/code-builder/services/pythonExecutor.ts` | All TypeScript↔Pyodide calls |
| `src/output-terminal/terminalState.ts` | Output capture and tab segmentation |
| `src/builder-imports/*.py` | User-extendable Python helpers importable in builder code |
| `src/debugger-imports/*.py` | User-extendable Python helpers importable in debugger code |
