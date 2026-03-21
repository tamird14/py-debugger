# Python Engine

[← dev-notes](./dev-notes.md)

Python runs entirely in-browser via **Pyodide** (WebAssembly, loaded once per page session). There is no server-side Python.

---

## Part 1: General Description

### Combined Execution Model

The user writes a single Python file. It contains two kinds of code interleaved:

- **Algorithm code** — runs normally; the V() change detection tracer records a snapshot whenever any bound V() expression changes value.
- **Viz blocks** (`# @viz … # @end`) — visual builder code that declares and updates visual elements. Before execution, they are preprocessed into engine calls:
  - `# @viz` → `__viz_begin__()` (pauses V() detection)
  - `# @end` → `__viz_end__(dict(locals()))` (resumes detection and records a snapshot)

The two kinds of code share one namespace (`_combined_ns`). Variables declared in algorithm code are visible inside viz blocks and vice versa.

### Three-Layer Architecture

The Python side is split into three layers, each in a separate file — all under `src/components/combined-editor/`:

| Layer | File | What lives here |
|-------|------|-----------------|
| **Hidden engine types** | `_vb_engine.py` | `VisualElem`, `V`, `R`, `TrackedDict`, `PopupException`, `make_step_guard` |
| **User-facing API** | `user_api.py` | `Panel`, all shapes, `Input`, `no_debug` |
| **Engine** | `vb_serializer.py` | Execution, snapshot recording, interactive click/input dispatch |

`_vb_engine.py` and `user_api.py` are **Python VFS modules** — written to `/home/pyodide/` at startup and imported via standard `import`. `vb_serializer.py` is exec'd into Pyodide globals.

### Persistent Namespace: `_combined_ns`

`_combined_ns` is a Python dict that serves as the execution namespace for combined code. It persists across interactions:
- Re-created at the start of each Analyze (fresh namespace seeded from `user_api` exports)
- Preserved between `_exec_combined_click_traced` calls — handlers see all variables from the last run
- Only destroyed on page reload or next Analyze

### Python ↔ TypeScript Bridge

All TypeScript-to-Python calls go through `src/components/combined-editor/combinedExecutor.ts`. It manages Pyodide initialization, code preprocessing, and JSON parsing of results.

---

## Part 2: Visual Elements

### Files

| File | Purpose |
|------|---------|
| `src/components/combined-editor/_vb_engine.py` | Hidden engine types: `VisualElem`, `V`, `R`, `TrackedDict`, `PopupException` |
| `src/components/combined-editor/user_api.py` | User-facing API: `Panel`, all shapes, `Input`, `no_debug` |

### `VisualElem` — Base Class

Every visual element extends `VisualElem`. Key class-level state:

```python
class VisualElem:
    _registry = []        # All live element instances
    _vis_elem_id = 0      # Auto-incrementing counter
```

**`_elem_id`** — assigned at construction, stable for the lifetime of the element. This is the identity that bridges Python and TypeScript for click dispatch.

**`_clear_registry()`** — called at the start of every Analyze. Clears `_registry` and resets the `_vis_elem_id` counter.

**`_serialize_base()`** — fields every element emits:
```python
{
    "position": [row, col],   # Panel-relative if element has a parent panel
    "visible": bool,
    "alpha": float,
    "z": int,                 # Depth layer; lower z = closer = rendered on top (default 0)
    "_elem_id": int,
    "panelId": str or None,   # str(_elem_id) of parent panel, or None
}
```

**`__getattribute__` patch** — `_vb_engine.py` replaces `VisualElem.__getattribute__` with `get_v_attr`. Any property access on a `VisualElem` subclass automatically calls `.eval()` on `V()` objects and `.resolve()` on `R` objects. This is what makes V() and R bindings work during serialization.

### Shape Classes (`user_api.py`)

All shapes use schema-driven serialization via `_ShapeBase`. Constructor args are keyword-only.

| Class | Key constructor args | Clickable |
|-------|---------------------|-----------|
| `Rect` | `panel, row, col, width, height, color` | Yes (extends BasicShape in TS) |
| `Circle` | `panel, row, col, radius, color` | Yes |
| `Arrow` | `panel, row, col, end_row, end_col` | Yes |
| `Line` | `start, end, color, stroke_weight, start_offset, end_offset, start_cap, end_cap` | No |
| `Label` | `panel, row, col, text` | No (TS does not set `_elemId`) |
| `Array` | `panel, row, col, values` | No |
| `Array2D` | `panel, row, col, arr` (2D list) | No |
| `Input` | `panel, row, col, width, height` | Special — dispatches `input_changed` |

`Line` has no `panel` argument — it specifies absolute start/end grid cells. `start_offset` and `end_offset` are `(row_frac, col_frac)` fractions within the cell (0.0–1.0). `start_cap`/`end_cap` can be `'none'` or `'arrow'`.

`Array2D` takes `arr=[[...]]`, a 2D list of primitives. The `rectangular` property (default `True`) controls jagged-row rendering.

`Input` is an interactive text field. Override `input_changed(self, text)` to handle user input. Call `get_input()` to read the current value.

### `Panel`

Container element. Children store positions relative to the panel's top-left corner in Python serialization. TypeScript resolves them to absolute grid coordinates in `loadVisualBuilderObjects()`. See [visual-elements.md](./visual-elements.md).

### `no_debug(fn)` Decorator

```python
@no_debug
def my_helper():
    ...
```

Marks a function so the viz-aware interactive tracer skips local tracing for it. Useful for functions defined inside viz blocks that should not produce trace steps when called from click handlers. Implemented by setting `fn._no_debug = True`; the interactive tracer checks `co_firstlineno` against viz ranges to achieve the same effect without needing this decorator explicitly.

### Serialization

**`_serialize_visual_builder()`** — walks `VisualElem._registry` and returns JSON array of all serialized elements.

**`_serialize_combined_handlers() → str`** — returns `json.dumps({elem_id: ["on_click"]})` for elements that have an `on_click` method or are an `Input` instance.

---

## Part 3: Tracing & Snapshots

### File

| File | Purpose |
|------|---------|
| `src/components/combined-editor/vb_serializer.py` | Combined execution, V() tracer, snapshot recording, interactive dispatch |

### `_exec_combined_code(code)` — Main Entry Point

Called by TypeScript for each Analyze run.

```
1. Reset combined timeline and namespace
2. Preprocess code (# @viz → __viz_begin__(), # @end → __viz_end__(dict(locals())))
3. Seed namespace: user_api exports + __viz_begin__ + __viz_end__
4. sys.settrace(_make_v_aware_tracer())
5. exec(compile(code, '<combined_code>', 'exec'), _combined_ns)
6. sys.settrace(None)
7. _combined_ns = ns  # persist for interactive mode
8. Return json.dumps({ timeline: _combined_timeline, handlers, error? })
```

### Snapshot Triggers

Two conditions cause a snapshot to be recorded into `_combined_timeline`:

1. **Viz block exit** — `__viz_end__(dict(locals()))` is called. Snapshot includes the visual state, current locals, and the line number. `is_viz=True` in the step.

2. **V() value change** — `_make_v_aware_tracer()` sets up a `sys.settrace` tracer that fires on every `'line'` event. If `_tracing_active` (i.e., not inside a viz block) and any V() expression has changed value since the last check, a snapshot is recorded.

`__viz_begin__()` sets `_tracing_active = False` to suppress V() snapshots during viz block execution. `__viz_end__()` sets it back to `True` then records the snapshot.

### `_collect_variables(frame_locals)`

Extracts serializable variables from a frame's locals dict. Skips names starting with `_`. Converts:
- Primitives (`int`, `float`, `str`, `bool`) → `{ type, value }`
- Lists of primitives → `{ type: 'list', value: [...] }`
- Lists of lists → `{ type: 'list2d', value: [[...]] }`
- Dicts → `{ type: 'dict', value: {str(k): v, ...} }` (capped)

Note: simpler than the old `_serialize_variables_for_ts` — no `R`-object unwrapping or custom class handling. The combined model captures variables only at snapshot boundaries, not every line.

### `V()` — Lazy Expression Evaluation

```python
class V:
    params = {}    # class variable: current frame locals (see sharp-edges.md)

    def __init__(self, expr: str, default=None):
        self.expr = expr
        self.default = default

    def eval(self):
        return eval(self.expr, {"__builtins__": {}}, {**SAFE_GLOBALS, **V.params})
        # On any exception: returns self.default (or self.expr if no default)
```

`V.params` is set from `frame.f_locals` at each line event by the V() change detection tracer. The `__getattribute__` patch on `VisualElem` triggers `.eval()` automatically whenever a property is accessed during serialization.

### `R` — Stable Object Reference Across Steps

Same as before: `R` stores the `id` of the original Python object and resolves to the current step's copy via `R.registry`. See the original description in the old [python-engine.md history] for details. Still documented fully in `_vb_engine.py`.

### Interactive Tracing

When an element is clicked, `_exec_combined_click_traced(elem_id, row, col, viz_ranges_json)` runs:

1. Finds the element by `_elem_id` in `_combined_ns` namespace (not re-exec'd)
2. Sets up `_make_interactive_tracer(viz_ranges)`:
   - Same V() change-detection logic as the initial trace
   - **Per-frame skipping**: if a function's `co_firstlineno` falls inside a viz block range, returns `None` on the `'call'` event — skipping local tracing for that frame only. Algorithm functions called from within that frame still get traced (their `co_firstlineno` is outside viz ranges).
3. Calls `target.on_click(row, col)` with the tracer active
4. Returns `{ interactive_timeline, final_snapshot, handlers, output }`

Input changes use `_exec_combined_input_changed(elem_id, text, viz_ranges_json)` — same pattern, calls `target.input_changed(text)`.

---

## Part 4: Python ↔ TypeScript Bridge

All calls go through `src/components/combined-editor/combinedExecutor.ts`.

| TypeScript function | Python call | Returns |
|--------------------|-------------|---------|
| `executeCombinedCode(code)` | `_exec_combined_code(preprocessedCode)` | `CombinedResult: { timeline, handlers, error? }` |
| `executeCombinedClickHandler(elemId, row, col, vizRanges)` | `_exec_combined_click_traced(...)` | `CombinedClickResult: { interactiveTimeline, finalSnapshot }` |
| `executeCombinedInputChanged(elemId, text, vizRanges)` | `_exec_combined_input_changed(...)` | `CombinedClickResult: { interactiveTimeline, finalSnapshot }` |

Pyodide initialization (`loadPyodide()`) still lives in `src/python-engine/code-builder/services/pythonExecutor.ts` — loaded once per session. `combinedExecutor.ts` calls it before any Python execution.

### Output Capture

Python `print()` output is captured by redirecting `sys.stdout` before execution. The combined editor captures output incrementally: each snapshot records the stdout delta since the previous snapshot (`output` field in `CombinedStep`). The `OutputTerminal` displays the accumulated output from the current step.

### Import Files

Builder and debugger import files (in `src/python-engine/builder-imports/*.py` and `debugger-imports/*.py`) are still bundled at build time and written to the Pyodide VFS during `loadPyodide()`. They are importable from combined editor code with standard `import`.

**Tracer behavior:** The V() tracer only records steps for frames where `co_filename == '<combined_code>'`. Functions from import files have a real filepath and are silently skipped — they execute normally but produce no trace steps.

### Key Files Summary

| File | Type | Purpose |
|------|------|---------|
| `src/components/combined-editor/_vb_engine.py` | VFS module | Hidden engine types: VisualElem, V, R, TrackedDict, PopupException |
| `src/components/combined-editor/user_api.py` | VFS module | User-facing API: Panel, shapes, Input, no_debug |
| `src/components/combined-editor/vb_serializer.py` | exec'd | Execution, snapshot recording, interactive dispatch |
| `src/components/combined-editor/combinedExecutor.ts` | TypeScript | All TypeScript↔Pyodide calls; code preprocessing |
| `src/components/combined-editor/vizBlockParser.ts` | TypeScript | Parse & validate # @viz / # @end blocks |
| `src/python-engine/code-builder/services/pythonExecutor.ts` | TypeScript | Pyodide init (`loadPyodide()`); VFS file writes |
