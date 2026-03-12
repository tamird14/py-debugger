# Other Components

[← dev-notes](./dev-notes.md)

Covers: text boxes (user annotations), save/load, the output terminal, and the API reference panel.

---

## Text Boxes

Text boxes are UI-only grid annotations — not Python objects. They are drawn on an overlay layer above the Visual Panel, persist across Analyze runs, and are included in save/load JSON.

### What They Are

A text box is a resizable, draggable, editable overlay positioned in grid-cell coordinates. The user places them with a drawing tool (T+ button), types freely, and formats with a small toolbar. They are completely independent of Python execution — Analyze never affects them.

### State Ownership

| State | Location | Reason |
|-------|----------|--------|
| `textBoxes: TextBox[]` | `App.tsx` | Needed for save/load; passed down to GridArea |
| `addingTextBox: boolean` | `GridArea.tsx` (local) | UI mode flag; doesn't need app-level persistence |
| `selectedTextBoxId: string \| null` | `GridArea.tsx` (local) | Selection state; local to the visual panel |

### Rendering Architecture

`TextBoxesLayer` renders inside Grid's `gridContentRef` div (the `transform: scale(zoom)` container) as a 5th absolute layer. This means text boxes zoom with the grid automatically.

Coordinates: `left = col * CELL_SIZE` px, `top = row * CELL_SIZE` px (where `CELL_SIZE = 40`).

### Interaction Model

Text boxes follow standard design-tool behavior (Figma/Canva style):
- **Single click** — selects the text box (move mode: drag to reposition, resize via corners)
- **Double click** — enters edit mode (text cursor active)
- **Escape** — exits edit mode back to move mode

### Drawing Mode

Activated by the T+ button in GridArea:
1. `addingTextBox = true` overlays a transparent fullscreen div with `cursor: crosshair`
2. On `mouseup`: `offsetX / CELL_SIZE → col`, `offsetY / CELL_SIZE → row` (works correctly because CSS transforms do not affect `offsetX`)
3. Creates a `TextBox` with `id = "text-${Date.now()}"`, 4×2 cell default size, auto-selects it

### Drag and Resize Math

**Move:** `newCol = startCol + Math.round((clientX - startClientX) / (CELL_SIZE * zoom))`

**Resize:** Same formula on width/height delta; minimum size of 2×2 cells enforced.

The zoom factor is in the denominator because `clientX` is in screen pixels while grid coordinates are in logical cells.

### Formatting Toolbar

Renders inside `TextBoxItem` at `position: absolute; bottom: 100%` (above the text box). Controls:
- Font size select (10–48px)
- Text color picker
- Background color picker
- Clear background button
- Delete button

### `TextBox` Interface

**File:** `src/text-boxes/types.ts`

```typescript
interface TextBox {
    id: string;           // "text-{timestamp}"
    row: number;
    col: number;
    widthCells: number;
    heightCells: number;
    text: string;
    fontSize: number;     // px
    color: string;        // CSS color string
    bgColor: string;      // CSS color string (or "" for transparent)
}
```

### Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `TextBoxesLayer` | `src/text-boxes/TextBoxesLayer.tsx` | Drawing mode overlay; renders all `TextBoxItem` children |
| `TextBoxItem` | `src/text-boxes/TextBoxItem.tsx` | Single text box: drag, resize, edit, format toolbar |
| `TextBoxFormatToolbar` | `src/text-boxes/TextBoxFormatToolbar.tsx` | Formatting controls |

### Future Work

- Rich/structured text (title + bullet list runs)
- Hebrew RTL support
- Inline LaTeX / center-aligned LaTeX block

---

## Save / Load

Projects are saved as JSON files. Loading a project restores both editors, breakpoints, text boxes, and triggers an automatic re-analyze.

### JSON Format

```json
{
  "builderCode": "panel = Panel('main')\n...",
  "debuggerCode": "arr = [5,3,8,1]\n...",
  "breakpoints": [7, 12],
  "textBoxes": [
    {
      "id": "text-1234",
      "row": 1, "col": 2,
      "widthCells": 8, "heightCells": 3,
      "text": "Title",
      "fontSize": 18,
      "color": "#111827",
      "bgColor": "#ffffff"
    }
  ]
}
```

### Fields

| Field | Type | Notes |
|-------|------|-------|
| `builderCode` | `string` | Builder Code editor content |
| `debuggerCode` | `string` | Debugger Code editor content |
| `breakpoints` | `number[]` | Restored as `new Set(...)` on load |
| `textBoxes` | `TextBox[]` | Defaults to `[]` for saves that predate this field |

### On Load Behavior

1. Both editors are updated with loaded code
2. Breakpoints are restored
3. Text boxes are restored
4. `runAnalyze()` is called automatically

### Samples

Bundled sample projects live in `src/samples/*.json`. They are loaded at build time via Vite's `import.meta.glob`:

```typescript
const modules = import.meta.glob('../samples/*.json', { eager: true });
```

The filename (without `.json`) becomes the sample name shown in the Samples dropdown.

### Key Files

| File | Purpose |
|------|---------|
| `src/app/App.tsx` | `handleSave`, `handleLoad` — JSON serialization/deserialization |
| `src/text-boxes/types.ts` | `TextBox` interface |
| `src/samples/*.json` | Bundled sample projects |

---

## Output Terminal

The Output Terminal captures Python `print()` output and errors, displayed at the bottom of the Code Panel.

### Segmentation

Output is segmented into three tabs:
- **Builder** — output from `exec(visualBuilderCode)` (builder code run)
- **Debugger** — output from `_visual_code_trace(debuggerCode)` (tracer run)
- **Combined** — both together in order

### State

**File:** `src/output-terminal/terminalState.ts`

Stores the captured output segments. `pythonExecutor.ts` writes to it before/after each Python execution phase by redirecting `sys.stdout` in Pyodide.

### Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `OutputTerminal` | `src/output-terminal/OutputTerminal.tsx` | Renders terminal with tab selector and scrollable output |

---

## API Reference Panel

The API Reference Panel is a floating overlay showing available visual builder functions and their signatures. It is not a tab inside the Code Panel — it is rendered directly by `App.tsx` and toggled by a button.

### What It Shows

Schema for all available builder functions: `Panel`, `Rect`, `Circle`, `Arrow`, `Label`, `Array`, `Array2D` — their constructor parameters, types, and descriptions.

### Implementation

**File:** `src/api/ApiReferencePanel.tsx`

The schema is defined in `src/api/functionsSchema.ts` and `src/api/visualBuilder.ts` (which also defines the `VisualBuilderElementBase` TypeScript interface used by the element registry).

| File | Purpose |
|------|---------|
| `src/api/ApiReferencePanel.tsx` | Floating overlay component |
| `src/api/functionsSchema.ts` | Available function schemas for display |
| `src/api/visualBuilder.ts` | `VisualBuilderElementBase` type + `VISUAL_ELEM_SCHEMA`; triggers element registry side effects |
