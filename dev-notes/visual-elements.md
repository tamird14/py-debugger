# Visual Elements

[← dev-notes](./dev-notes.md)

The pipeline that takes a Python element object to a rendered, clickable cell on the grid.

```
Python VisualElem
  → _serialize_visual_builder() → JSON array
    → hydrateTimelineFromArray() → TypeScript class instances
      → loadVisualBuilderObjects() → grid cell map
        → user click → executeClickHandler() → Python _handle_click()
```

---

## Part 1: General Description

### Data Side

Every visual element has two IDs:
- **`_elem_id`** — stable integer assigned at construction. The only identity that holds across serialization calls, Python/TS boundary, and timeline steps.
- **`_vb_id`** — ephemeral string (e.g. `"elem-3"`) assigned fresh on every call to `_serialize_visual_builder()`. Used for React keys and panel-parent references within a single snapshot only.

At each traced line, `_serialize_visual_builder()` produces a JSON snapshot of the full element registry. All `V()` property bindings are evaluated against that step's variables before serialization.

### Renderers

TypeScript has a class hierarchy mirroring the Python shapes:
- **`BasicShape`** (`src/visual-panel/render-objects/BasicShape.ts`) — base for all clickable shapes. Its constructor copies `el._elem_id` → `this._elemId` (the only snake→camelCase bridge).
- `Rect`, `Circle`, `Arrow` extend `BasicShape` → they get `_elemId` → they can be clickable.
- `Line`, `Label`, `Array1D`, `Array2D` implement `VisualBuilderElementBase` directly → they do **not** get `_elemId` → they are never clickable, even if `on_click` is defined in Python.

### Registration

Each TypeScript shape class registers itself by type string: `registerVisualElement('rect', Rect, RECT_SCHEMA)`. This happens as a side effect when shape modules are imported (triggered by `src/api/visualBuilder.ts`). The registry maps `type` string → constructor, used during hydration.

### Mouse Events

Click data is assembled during grid hydration: for each element with a valid `_elemId` that has a registered `on_click` handler, a `clickData` object is attached to the grid cell. The Grid renders those cells with pointer cursor and a click listener. Clicking dispatches through GridArea → pythonExecutor → Python `_handle_click()`.

---

## Part 2: Files and Functions

### Python Side

**File:** `src/code-builder/services/visualBuilder.py`

#### `_elem_id` vs `_vb_id`

| Field | Type | Assigned when | Stable? | Use for |
|-------|------|---------------|---------|---------|
| `_elem_id` | `int` | At `__init__` | Yes | Click dispatch; TS↔Python identity |
| `_vb_id` | `str` (`"elem-3"`) | At each `_serialize_visual_builder()` call | No — reassigned every call | React keys; `panelId` references within one snapshot |

#### `_serialize_visual_builder()`

```python
# 1. Assign fresh _vb_id to every element
# 2. Sort: panels first (so children can reference parent _vb_id)
# 3. Serialize each element via _serialize() → JSON array
```

Children store positions **relative to their parent panel's top-left corner**. TypeScript resolves these to absolute grid coordinates.

#### `_serialize_handlers()` vs `_serialize_handlers_json()`

```python
_serialize_handlers()      → Python dict { int: ["on_click"] }
                             Used ONLY inside _visual_code_trace (embedded in outer json.dumps)

_serialize_handlers_json() → JSON string of the same dict
                             Used by TypeScript direct calls (executeClickHandler)
```

**Never swap them** — embedding the JSON string version inside `json.dumps` double-encodes it.

---

### TypeScript Hydration

**File:** `src/timeline/timelineState.ts`

#### `hydrateTimelineFromArray(rawTimeline)`

Converts a raw JSON timeline (arrays of plain objects) into a timeline of TypeScript class instances:

```typescript
timeline = rawTimeline.map(snapshot =>
    snapshot.map(el => {
        const Ctor = getConstructor(el.type);
        return Ctor ? new Ctor(el) : el;  // falls back to plain object if unknown type
    })
);
```

Also `hydrateTimelineFromJson(jsonStr)` — parses string first, then calls the array version.

#### Element Registry

**File:** `src/visual-panel/types/elementRegistry.ts`

```typescript
registerVisualElement('rect', Rect, RECT_SCHEMA)
registerVisualElement('circle', Circle, CIRCLE_SCHEMA)
// ... etc.
```

`getConstructor(type)` looks up the registered class. All registrations are triggered as side effects when `src/api/visualBuilder.ts` is imported.

#### `BasicShape.ts` — The Identity Bridge

**File:** `src/visual-panel/render-objects/BasicShape.ts`

```typescript
constructor(type: string, el: any) {
    this._elemId = el._elem_id;  // snake_case (Python JSON) → camelCase (TypeScript)
    // ...
}
```

This is the **only place** the Python `_elem_id` is transferred to TypeScript. Subclasses (`Rect`, `Circle`, `Arrow`) inherit this. `Label`, `Array1D`, `Array2D` do not extend `BasicShape` — their `_elemId` is `undefined`.

---

### Grid Hydration: `loadVisualBuilderObjects()`

**File:** `src/visual-panel/hooks/useGridState.ts`

Takes an array of hydrated TypeScript element instances and populates the grid cell map.

#### Two-Pass Algorithm

**Pass 1 — Panels:**
```
For each Panel element:
  → Place at element.position in grid
  → Record in panelIdMap: _vb_id → { absolutePosition }
```

**Pass 2 — Non-panels:**
```
For each non-Panel element:
  → If element.panelId exists:
      absolutePosition = panelIdMap[panelId].absolutePosition + element.position
  → Else:
      absolutePosition = element.position
  → Call element.draw() → RenderableObjectData
  → Assemble clickData (see below)
  → Store in objects map
```

Note: `element.position` in a hydrated TypeScript instance is the **absolute position** after `BasicShape` construction — but for children of panels, the raw JSON position was relative; TypeScript adds the panel offset here.

#### Click Data Assembly

```typescript
const elemId = (el as any)._elemId as number | undefined;
const clickData = elemId != null && hasHandler(elemId, 'on_click')
    ? { elemId, position: el.position as [number, number] }
    : undefined;
```

Cells with `clickData` get pointer cursor and click listener in `Grid.tsx`. Cells without it are purely visual.

---

### Click Dispatch Chain

**Files:** `Grid.tsx` → `GridArea.tsx` → `pythonExecutor.ts` → `visualBuilder.py`

```
Grid.tsx:
  onElementClick(clickData.elemId, [row, col])

GridArea.tsx (handleElementClick):
  result = await executeClickHandler(elemId, row, col)
  if result.snapshot:
    hydrate snapshot → loadVisualBuilderObjects(hydrated)
  if result.debugCall:
    onDebugCall?.(result.debugCall)

pythonExecutor.ts (executeClickHandler):
  1. _handle_click(elemId, row, col)      → null or "expression string"
  2. _serialize_visual_builder()          → snapshot JSON
  3. _serialize_handlers_json()           → handlers JSON (always re-fetched)
  setHandlers(JSON.parse(handlersJson))
  return { snapshot, debugCall?: string }
```

**Why snapshot hydration happens in GridArea, not the executor:** The executor returns raw JSON (plain objects). GridArea calls `getConstructor` to instantiate proper TypeScript class instances before passing to `loadVisualBuilderObjects`. This is the same hydration as `hydrateTimelineFromArray` but for a single snapshot.

**Why handlers are re-fetched on every click:** Elements created inside `on_click` handlers accumulate in `_registry` and may have their own `on_click`. Re-fetching ensures they are immediately clickable without a full re-analyze. Cost: one extra Pyodide call per click. See [sharp-edges.md](./sharp-edges.md).

---

### Handler Registry

**File:** `src/visual-panel/handlersState.ts`

```typescript
let handlers: Record<number, string[]> = {};
export function setHandlers(raw: Record<string, string[]>): void
export function hasHandler(elemId: number, handlerName: string): boolean
```

JSON object keys are always strings; `setHandlers` converts them to numbers to match `_elemId`. Updated after: initial trace, every click, every debug-call sub-run.

---

### z-Depth Ordering

Every element serializes a `z` integer (default `0`). Lower z = closer = rendered on top.

- Set via constructor: `Rect(..., z=5)` or post-construction: `r.z = 5` (before Analyze).
- `loadVisualBuilderObjects()` passes `z` through to `RenderableObjectData`.
- `Grid.tsx` sorts rendered objects by `z` descending before rendering, so lower-z objects are drawn last (on top).

---

### Animation

Smooth animations are enabled by an **`AnimationContext`** (`src/animation/animationContext.tsx`) boolean. A toggle button in the app header switches between **Animated** and **Jump** modes.

**React key stability:** Elements with a `_elemId` use `vb-elem-{id}` as their React key (instead of a sequential counter). This means React keeps the same DOM node across timeline steps and click-handler updates — a prerequisite for CSS transitions.

**What animates:**
- Position and size: `transition-all duration-300 ease-out` on `GridSingleObject` (the positioned wrapper div)
- Color and alpha: CSS transitions on SVG `fill`, `fill-opacity`, `stroke`, and `opacity` inside each shape renderer (`RectView`, `CircleView`, `ArrowView`, `LineView`, `LabelView`)
- Fade in/out: elements fade in on first mount (opacity 0 → 1) and fade out when `visible=false` (opacity transitions to 0 while staying in the DOM). Invisible elements get `pointerEvents: none`.

In Jump mode (animation off), all transitions are disabled for instant updates.

---

### Key Invariants

1. `_elem_id` (Python `int`) === `_elemId` (TypeScript `number`) — the only stable identity
2. `_vb_id` is ephemeral — never use it across serialization calls
3. `BasicShape` subclasses (`Rect`, `Circle`, `Arrow`) are clickable; `Line`, `Label`, `Array` are not
4. `_serialize_handlers()` → dict (embed in outer json.dumps); `_serialize_handlers_json()` → string (for TS calls)
5. Handlers are re-fetched after every click to support dynamically created elements
6. Panel children have panel-relative positions in Python JSON; absolute positions in TypeScript instances
7. Lower `z` = closer to viewer = rendered on top

---

### Key Files Summary

| File | Purpose |
|------|---------|
| `src/code-builder/services/visualBuilder.py` | Python serialization, handler registry, `_handle_click_with_output`, `_execute_run_call` |
| `src/code-builder/services/visualBuilderShapes.py` | `Rect`, `Circle`, `Arrow`, `Line`, `Label`, `Array`, `Array2D` shape classes |
| `src/visual-panel/render-objects/BasicShape.ts` | `_elemId` bridge; clickable base class |
| `src/visual-panel/render-objects/line/Line.ts` | `Line` TypeScript class (implements `VisualBuilderElementBase`, not `BasicShape`) |
| `src/visual-panel/types/elementRegistry.ts` | Constructor registry by type string |
| `src/timeline/timelineState.ts` | `hydrateTimelineFromArray` / `hydrateTimelineFromJson` |
| `src/visual-panel/hooks/useGridState.ts` | `loadVisualBuilderObjects`; two-pass algorithm; click data; z-sort |
| `src/visual-panel/handlersState.ts` | `setHandlers`; `hasHandler` |
| `src/app/GridArea.tsx` | Click dispatch; snapshot re-hydration |
| `src/animation/animationContext.tsx` | `AnimationContext` boolean; Animated/Jump toggle |
