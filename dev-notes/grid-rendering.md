# Grid Rendering

[← dev-notes](./dev-notes.md)

How `Grid.tsx` takes the output of `useGridState` and renders it as an interactive, animated canvas.

---

## Overview

`Grid` (`src/visual-panel/components/Grid.tsx`) is a `forwardRef` component that receives pre-processed data and turns it into positioned DOM elements. It does **not** know about Python, Pyodide, or element types — that concern belongs to `useGridState`. Grid's job is purely presentational + interaction dispatch.

```
useGridState
  → cells Map + overlayCells Map + panels array
    → Grid.tsx (objectsToRender memo)
      → GridSingleObject (one per element)
        → GridCell → shape renderer (RectView, LineView, etc.)
```

---

## Input Data

Grid receives three main data structures from `useGridState`:

| Prop | Type | What it is |
|------|------|------------|
| `cells` | `Map<string, RenderableObjectData>` | Primary placement. Key = `"row,col"`. One entry per grid cell. |
| `overlayCells` | `Map<string, RenderableObjectData>` | Overflow placement. Key = `"row,col,n"`. Used when two elements share the same cell. |
| `panels` | `PanelInfo[]` | Panel background metadata (position, size, style). Rendered separately from elements. |

**Why two maps?** Each cell can only have one entry in `cells`. When a second element lands on the same cell (e.g. a Line at (7,8) and a Rect also at (7,8)), `useGridState` puts the second one in `overlayCells` with a collision-disambiguated key like `"7,8,0"`. Both elements are still rendered at the same pixel position.

---

## The `objectsToRender` Memoization

```typescript
const objectsToRender = useMemo((): RenderableObject[] => {
    const objects: RenderableObject[] = [];

    // Primary cells (skip panel entries — panels are rendered separately)
    for (const [posKey, cellData] of cells) {
        if (cellData.panel) continue;
        objects.push({
            key: cellData.objectId ?? posKey,   // stable element ID preferred
            row, col, cellData, widthCells, heightCells,
        });
    }

    // Overflow cells (second+ element on the same grid cell)
    for (const [posKey, cellData] of overlayCells) {
        objects.push({
            key: cellData.objectId ?? ('overlay-' + posKey),  // stable ID, fallback adds prefix
            row, col, cellData, widthCells, heightCells,
        });
    }

    // Sort: higher userZ first (lower z value = closer = on top)
    // then by zOrder (insertion order tiebreak)
    objects.sort((a, b) =>
        (b.cellData.userZ ?? 0) - (a.cellData.userZ ?? 0) ||
        (a.cellData.zOrder ?? 0) - (b.cellData.zOrder ?? 0)
    );
    return objects;
}, [cells, overlayCells]);
```

The `key` field is critical for animation. React uses it to decide whether to keep or replace a DOM node. The rule: **always prefer `objectId` over position-based fallbacks**. `objectId` is a stable string like `vb-elem-1` that follows the element regardless of which map it ends up in. If a key changed from `vb-elem-1` to `overlay-vb-elem-1` just because the element moved into an overflow cell, React would unmount and remount it, breaking CSS transitions.

---

## `GridSingleObject` — One Per Visual Element

Each entry in `objectsToRender` becomes a `GridSingleObject`. This is a `memo`-wrapped component that renders a single absolutely-positioned div at `(col * CELL_SIZE, row * CELL_SIZE)`.

```
<div style={{ left: col*40, top: row*40, width: w*40, height: h*40 }}>
    <GridCell ... />          ← renders the actual shape SVG
    {flashing && <flash overlay />}
</div>
```

### Animation

Two conditions must both be true for CSS transitions to fire:
1. **Global animation toggle** (`useAnimationEnabled()`) is on
2. **Per-element flag** `cellData.animate !== false`

When both are true, the outer div gets `transition-all ease-out` with the configured `transitionDuration`. This is what makes position and size changes animate smoothly. Color/opacity transitions are handled inside each shape renderer.

**Fade-in on mount:** `mounted` state starts `false` (opacity 0). A `requestAnimationFrame` callback sets it to `true` after the first paint, producing a fade-in. In jump mode, `mounted` is set to `true` synchronously so there is no fade.

**Invisible elements:** When `elementInfo.visible === false`, opacity is 0 and `pointerEvents` is `none`. The DOM node stays in the tree (preserving React key and CSS transition potential), it just becomes invisible.

### Click Handling

If the element has `clickData` (set by `useGridState` when the Python element has `on_click`):
- `cursor-pointer` cursor class applied
- On click: compute which sub-cell was clicked using `offsetX/Y / CELL_SIZE`, add to base position, call `onElementClick(elemId, [row, col])`
- A white flash overlay is shown for 300ms as visual feedback

### Drag Handling

Drag is split across `GridSingleObject` and the parent `Grid`:
- **Mouse down** on a draggable element (has `dragData`): `GridSingleObject` calls `onElementDragStart(elemId, pos)`. Grid stores drag state in `dragStateRef`.
- **Mouse move** on the grid container: Grid's `handleMouseMove` fires `onElementDrag(elemId, pos, 'mid')` for each new cell entered. `dragCallInFlightRef` prevents queuing multiple in-flight calls.
- **Mouse up** (window-level listener): fires `onElementDrag(elemId, pos, 'end')` and clears drag state. Window-level ensures this fires even if the mouse is released outside the grid.

---

## Rendering Layers (z-order in the DOM)

The grid content div contains four absolutely-positioned layers stacked in order:

| Layer | What it renders | `pointer-events` |
|-------|----------------|-----------------|
| Background grid | CSS gradient lines (the grid itself) | — |
| Panel backgrounds | Colored/bordered panel rectangles | `none` |
| Objects | All visual elements (`renderedObjects`) | per-element (clickable/draggable ones get `auto`) |
| Panel handles | Panel title labels above panel top edge | `none` |
| Text boxes | Floating text annotations | conditional |

Panel backgrounds are rendered **below** objects so elements appear on top of their panel. Panel handles are rendered **above** objects so titles are never obscured.

---

## Zoom

The entire grid content div is CSS-scaled with `transform: scale(zoom)` from the top-left origin. Mouse event coordinates are adjusted by `/ zoom` in `getCellFromMouseEvent`. `CELL_SIZE` (40px) is always the logical cell size — zoom only affects visual size.

`alignGrid()` (exposed via `ref`) snaps the scroll position to the nearest cell boundary to prevent blurry grid lines.

---

## Key Files

| File | Role |
|------|------|
| `src/visual-panel/components/Grid.tsx` | This file: rendering + interaction dispatch |
| `src/visual-panel/components/GridCell.tsx` | Delegates to shape renderer based on `elementInfo.type` |
| `src/visual-panel/hooks/useGridState.ts` | Builds `cells`, `overlayCells`, `panels` from hydrated element instances |
| `src/visual-panel/types/grid.ts` | `RenderableObjectData`, `InteractionData`, `CellStyle`, `cellKey()` |
| `src/animation/animationContext.tsx` | `useAnimationEnabled()`, `useAnimationDuration()` |
