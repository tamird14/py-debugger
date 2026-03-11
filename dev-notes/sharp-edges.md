# Sharp Edges

[← dev-notes](./dev-notes.md)

Non-obvious behaviors, gotchas, and constraints. Read this before touching the Python/TypeScript boundary, mode transitions, or serialization logic.

---

## A: Known Issues

These are imperfections worth fixing at some point.

### `_exec_context` Not Reset Between Analyze Runs

Running Analyze twice in the same page session does **not** clear `_exec_context`. Variables and functions from the previous run remain until overwritten by the new run. `VisualElem._clear_registry()` resets the visual elements, but not the Python variable namespace.

In practice this is usually harmless because `exec(debuggerCode)` re-defines most variables. The risk is with **functions removed from the code** — if you had `def temp(): ...` in a previous run and deleted it, `temp` is still callable in the new session. Also any module-level side effects from the previous run persist.

**Workaround:** Reload the page for a completely clean state.
**Fix direction:** Reset `_exec_context` at the start of `_visual_code_trace` when `persistent=False`.

---

### `debugCallSuffix` Clearing Requirement

The `code` prop passed to `DebuggerCodeEditor` is `debuggerCode + (debugCallSuffix ?? '')`. When in `debug_in_event` mode, the editor shows the original code plus the injected `debug_call` function.

If `debugCallSuffix` is **non-null** when `appMode` becomes `idle`, Monaco fires `onChange` with the suffixed content → `setDebuggerCode(originalCode + suffix)` → the prop becomes `(originalCode + suffix) + suffix` → infinite loop.

`handleEdit()` must clear `debugCallSuffix` **before** setting `appMode = 'idle'`. The order matters.

**Fix direction:** Handle suffix display inside `DebuggerCodeEditor` / `CodeEditorArea` rather than at App.tsx level — `CodeEditorArea` could receive clean `debuggerCode` + a separate `suffixLines` prop and manage the editor content internally.

---

## B: Architectural Quirks

These are intentional behaviors that are non-obvious and must be understood to avoid breaking things.

### `V.params` Is a Class Variable

`V.params` is a single class-level dict shared by all `V()` instances. It is set once per timeline step in the build loop:

```python
for step in code_trace:
    V.params = step['variables']
    snapshot = _serialize_visual_builder()
```

Outside this loop — e.g., when `_serialize_visual_builder()` is called from `executeClickHandler` during interactive mode — `V.params` holds whatever was set last (the final trace step). This is intentional: interactive mode shows the final visual state. But if `_serialize_visual_builder()` is ever called in an unexpected context, `V.params` will be stale.

---

### `_elem_id` (Python) vs `_elemId` (TypeScript)

Python serializes `"_elem_id": self._elem_id` (snake_case). TypeScript's `BasicShape` constructor translates it: `this._elemId = el._elem_id` (camelCase). This translation happens in **one place only**: `src/visual-panel/render-objects/BasicShape.ts`.

Code that reads the ID from a **hydrated TypeScript instance** must use `_elemId` (camelCase). Code that reads from **raw JSON** (e.g., before hydration) must use `_elem_id` (snake_case). Mixing these silently returns `undefined`.

---

### `_vb_id` Is Not Stable Across Serialization Calls

`_vb_id` is assigned fresh on every call to `_serialize_visual_builder()` using an incrementing counter. Two calls produce different `_vb_id` values for the same element. Never use `_vb_id` to correlate elements across calls or timeline steps.

Use `_elem_id` for any persistent element identity.

---

### `_serialize_handlers()` vs `_serialize_handlers_json()` — Never Swap

```python
_serialize_handlers()      → Python dict   (used inside _visual_code_trace; embedded in json.dumps)
_serialize_handlers_json() → JSON string   (used by TypeScript direct calls)
```

Embedding `_serialize_handlers_json()` inside another `json.dumps` would produce a JSON string value instead of a dict — the handlers key in the result would be a string like `'{"1": ["on_click"]}'` instead of an object. Click handlers would silently stop working.

---

### Label and Array Elements Are Never Clickable

`Label`, `Array1D`, `Array2D` extend `VisualBuilderElementBase` directly in TypeScript — they do not go through `BasicShape`. Their `_elemId` property is never set (remains `undefined`).

Even if you define `on_click` on a `Label` in Python, it will appear in `_serialize_handlers()`, but `loadVisualBuilderObjects()` checks `(el as any)._elemId != null` before assembling `clickData` — so the check fails and no click listener is attached.

---

### Panel-Relative vs Absolute Positions

Child elements of a `Panel` store positions **relative to the panel's top-left corner** in Python serialization. The raw JSON `position` field for a panel child is a relative offset, not an absolute grid coordinate.

`loadVisualBuilderObjects()` (two-pass algorithm in `useGridState.ts`) resolves relative positions to absolute grid coordinates during hydration. After hydration, `element.position` in a TypeScript instance is always absolute. Never compare raw JSON positions of children with absolute grid positions directly.

---

### Handlers Re-Fetched on Every Click

After every click, `executeClickHandler` calls `_serialize_handlers_json()` to re-fetch the full handler registry. This allows `on_click` handlers that create new visual elements (with their own `on_click`) to make those elements immediately clickable — without requiring a full re-analyze.

The cost is one extra Pyodide round-trip per click. This is acceptable for the interactive use case but would be noticeable at high click rates.

---

### `MAX_TRACE_STEPS = 1000` Hard Cap

After recording 1000 trace steps, `_trace_function` raises `PopupException`. This propagates through `_run_with_trace` (the `finally` block still restores `sys.settrace` and stdout), and is caught by TypeScript to display a user-friendly message.

This prevents infinite loops in user debugger code from hanging the browser tab. If a user's algorithm genuinely needs more than 1000 steps, the constant must be raised in `pythonTracer.py`.

---

### Pyodide State Persists for the Full Page Session

All Python module globals — `VisualElem._registry`, `_exec_context`, Pyodide's module namespace, the three loaded Python files — persist for the lifetime of the page. Only a page reload clears everything. Multiple Analyze runs in the same session share this global state (mitigated by `_clear_registry()` and `_exec_context` re-creation, but see the `_exec_context` issue above).
