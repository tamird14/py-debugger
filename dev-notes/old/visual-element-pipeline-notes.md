# Developer Notes — Visual Element Pipeline

The pipeline that takes a Python element object through to a clickable cell on the grid.

```
Python VisualElem
    → _serialize_visual_builder() → JSON
        → hydrateTimelineFromArray() → TypeScript class instances
            → loadVisualBuilderObjects() → grid cells
                → user click → executeClickHandler() → Python _handle_click()
```

---

## Python Side: `VisualElem` Base Class

**File:** `src/code-builder/services/visualBuilder.py`

### Identity: `_elem_id` vs `_vb_id`

These are two different IDs serving different purposes:

| Field | Type | Assigned | Stable? | Purpose |
|-------|------|----------|---------|---------|
| `_elem_id` | `int` | At construction (`__init__`) | Yes — never changes | Click dispatch; bridges Python ↔ TypeScript |
| `_vb_id` | `str` e.g. `"elem-3"` | At serialization time | No — re-assigned every call to `_serialize_visual_builder` | React rendering keys; parent panel references |

```python
class VisualElem:
    _registry = []        # All live elements
    _vis_elem_id = 0      # Counter; increments on construction

    def __init__(self):
        self._elem_id = VisualElem._vis_elem_id
        VisualElem._vis_elem_id += 1
        VisualElem._registry.append(self)
```

**`_elem_id` is the only stable identifier.** Use it whenever you need to correlate a
TypeScript object back to a Python object (e.g., click dispatch).

**`_vb_id` must never be compared across calls.** It's a fresh string every time
`_serialize_visual_builder()` runs.

### `_registry`

A class-level list of all live `VisualElem` instances. Used by:
- `_serialize_visual_builder()` — iterates to produce JSON
- `_serialize_handlers()` — iterates to find clickable elements
- `_handle_click()` — iterates to find the clicked element

**Cleared by:** `VisualElem._clear_registry()` — called at the start of each Analyze.
**NOT cleared by:** tracing, sub-runs, or timeline navigation.

Elements created inside `on_click` handlers or debug-call sub-runs accumulate in `_registry`
and persist across interactions.

### `_serialize_base()` — Fields Every Element Serializes

```python
{
    "position": [row, col],     # May be panel-relative (see Panel nesting below)
    "visible": bool,
    "alpha": float,
    "_elem_id": int,            # Critical for click dispatch
    "panelId": str or None,     # Parent panel's _vb_id (assigned just before this call)
}
```

### `_serialize_handlers()` and `_serialize_handlers_json()`

Two functions with different return types — **do not swap them:**

```python
def _serialize_handlers() -> dict:
    # Returns a Python dict { int_key: ["on_click"] }
    # Used ONLY inside _visual_code_trace where json.dumps wraps the whole result

def _serialize_handlers_json() -> str:
    # Returns json.dumps of the same dict
    # Used by TypeScript direct calls (executeClickHandler)
```

Embedding `_serialize_handlers_json()` inside another `json.dumps` would double-encode it,
producing a string value instead of a dict — handlers would silently break.

---

## Serialization: `_serialize_visual_builder()`

```python
def _serialize_visual_builder():
    # 1. Assign fresh _vb_id to every element
    for elem in VisualElem._registry:
        elem._vb_id = next_id("panel" if isinstance(elem, Panel) else "elem")

    # 2. Sort: panels first (needed so children can reference parent _vb_id)
    panels_first = sorted(_registry, key=lambda e: (0 if Panel else 1, type.__name__))

    # 3. Serialize each element (calls _serialize() on the subclass)
    result = [_serialize_elem(elem, elem._vb_id) for elem in panels_first]
    return json.dumps(result)
```

**Panel nesting:** children set `panelId` to their parent's `_vb_id`. Positions of children
are stored **relative to the panel's top-left corner** in Python. TypeScript resolves them to
absolute grid positions.

---

## TypeScript Hydration

**File:** `src/timeline/timelineState.ts`

```typescript
export function hydrateTimelineFromArray(rawTimeline: VisualBuilderElementBase[][]) {
  timeline = rawTimeline.map((snapshot) =>
    snapshot.map((el) => {
      const entry = getConstructor(el.type);
      return entry ? new entry(el) : el;   // Falls back to plain object if unknown type
    })
  );
}
```

`getConstructor` looks up the registered TypeScript class for the element's `type` string.

### Element Registry

**File:** `src/visual-panel/types/elementRegistry.ts`

```typescript
registerVisualElement('rect', Rect, RECT_SCHEMA)
registerVisualElement('circle', Circle, CIRCLE_SCHEMA)
// etc.
```

Registration happens as a side effect when the module is imported. All registrations are
triggered by `src/api/visualBuilder.ts` importing each shape module.

### `BasicShape.ts` — The `_elemId` Bridge

**File:** `src/visual-panel/render-objects/BasicShape.ts`

```typescript
constructor(type: string, el: any) {
    this._elemId = el._elem_id;  // snake_case (Python) → camelCase (TypeScript)
    // ... other fields
}
```

This is the **only place** where Python's `_elem_id` is transferred to TypeScript.
Subclasses that extend `BasicShape` (`Rect`, `Circle`, `Arrow`) inherit this.

**Classes that do NOT copy `_elemId`:** `Label`, `Array1D`, `Array2D` — these extend
`VisualBuilderElementBase` directly. They are never clickable. If you add `on_click` to a
`Label` in Python, it will appear in `_serialize_handlers` but `hasHandler` will never be
checked because `(el as any)._elemId` is `undefined`.

---

## Click Handler Registry

**File:** `src/visual-panel/handlersState.ts`

```typescript
let handlers: Record<number, string[]> = {};

export function setHandlers(raw: Record<string, string[]>) {
  handlers = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [Number(k), v])
  );
}

export function hasHandler(elemId: number, handlerName: string): boolean {
  return handlers[elemId]?.includes(handlerName) ?? false;
}
```

JSON keys are always strings; `Number(k)` converts them back to numbers to match `_elemId`.

**When `setHandlers` is called:**
1. After `executePythonCode` (initial trace)
2. After `executeDebugCall` (sub-run)
3. After `executeClickHandler` (every click, via `_serialize_handlers_json()`)

Re-calling after every click ensures elements created inside handlers are immediately
clickable without requiring a full re-analyze.

---

## Grid Hydration: `loadVisualBuilderObjects()`

**File:** `src/visual-panel/hooks/useGridState.ts`

Takes an array of hydrated TypeScript element instances and builds the grid `objects` map.

### Two-pass algorithm

**Pass 1 — Panels:**
```
For each Panel element:
  → Add to grid at element.position
  → Record panelGridId → { gridId, absolutePosition } in panelIdMap
```

**Pass 2 — Non-panels:**
```
For each non-Panel element:
  → If element.panelId exists:
      look up panel in panelIdMap
      absolutePosition = panel.absolutePosition + element.position (relative)
  → Else: absolutePosition = element.position
  → Call element.draw() to get RenderableObjectData
  → Assemble clickData (see below)
  → Add to objects map
```

### Click Data Assembly

```typescript
const elemId = (el as any)._elemId as number | undefined;
const clickData = elemId != null && hasHandler(elemId, 'on_click')
    ? { elemId, position: el.position as [number, number] }
    : undefined;
```

`clickData` is stored on the grid cell object. The Grid component checks for its presence:
- If present → element is rendered with pointer cursor and click listener
- If absent → element is purely visual, ignores clicks

**Sharp edge:** `_elemId` is camelCase here because it reads from a **hydrated TypeScript
class instance** (where `BasicShape` stores it as `this._elemId`). This is different from the
raw JSON element (which has `_elem_id`, snake_case).

---

## Click Dispatch

**Grid → GridArea → pythonExecutor → Python**

```
Grid.tsx:
  onElementClick(clickData.elemId, [row, col])

GridArea.tsx (handleElementClick):
  result = await executeClickHandler(elemId, row, col)
  if result:
    hydrate result.snapshot → loadVisualBuilderObjects(hydrated)
    if result.debugCall → onDebugCall?.(result.debugCall)

pythonExecutor.ts (executeClickHandler):
  1. _handle_click(elemId, row, col)     → null or "expression string"
  2. _serialize_visual_builder()         → snapshot JSON
  3. _serialize_handlers_json()          → handlers JSON (re-fetched!)
  setHandlers(JSON.parse(handlersJson))
  return { snapshot, debugCall?: string }
```

**Why snapshot hydration happens in GridArea, not the executor:**
The executor returns raw JSON (plain objects). GridArea calls `getConstructor` to instantiate
proper TypeScript classes before passing to `loadVisualBuilderObjects`. This is the same
hydration as `hydrateTimelineFromArray` but for a single snapshot rather than a full timeline.

---

## Summary: Key Invariants

1. `_elem_id` (Python int) == `_elemId` (TypeScript number) — the only stable identity
2. `_vb_id` is ephemeral — never use it for element identity across calls
3. `BasicShape` subclasses are clickable; `Label`/`Array` subclasses are not
4. `_serialize_handlers()` returns dict (for embedding); `_serialize_handlers_json()` returns JSON string (for TypeScript)
5. Handlers are re-fetched after every click to support dynamically created elements
6. Panel children have panel-relative positions in Python; absolute positions in TypeScript
