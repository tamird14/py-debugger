# Other Components

[← dev-notes](./dev-notes.md)

Covers: text boxes (user annotations), save/load, the output terminal, the API reference panel, and embed mode.

## Contents

- [Text Boxes](#text-boxes)
- [Save / Load](#save--load)
- [Output Terminal](#output-terminal)
- [API Reference Panel](#api-reference-panel)
- [Embed Mode](#embed-mode)

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

### Rich Text Editor

Text boxes use **TipTap 3** (ProseMirror-based) for rich text. The editor is always mounted per box and toggles between `editable: true` (double-click) and `editable: false` (view mode). In view mode, `pointer-events: none` is applied so drag/resize still works.

**Extensions loaded:** `StarterKit`, `TextStyle`, `Color`, `FontSize` (custom — `@tiptap/extension-font-size` is pre-release), `Underline`.

**Focus pattern in toolbar:** every formatting button uses `onMouseDown={e => e.preventDefault()}` to keep editor focus, then `editor.chain().focus().toggleBold().run()` etc.

### Formatting Toolbar

Renders inside `TextBoxItem` at `position: absolute; bottom: 100%` (above the text box). Controls (left → right):
- Font size select (10–48px) — per-selection via `textStyle` mark
- **B** bold / **I** italic / **U** underline toggles — per-selection
- Text color picker — per-selection via `setColor()`
- `•≡` bullet list / `1≡` ordered list toggles
- Background color picker — box-level only
- Clear background button
- Delete button (red)

### `TextBox` Interface

**File:** `src/text-boxes/types.ts`

```typescript
import type { JSONContent } from '@tiptap/react';

interface TextBox {
    id: string;           // "text-{timestamp}"
    row: number;
    col: number;
    widthCells: number;
    heightCells: number;
    content: JSONContent; // TipTap document node — all text formatting lives here
    bgColor?: string;     // hex; box-level only (undefined = transparent)
}
```

**Migration:** `migrateTextBox(raw)` in `types.ts` upgrades old saves that used `text`/`fontSize`/`color` fields. Called in `App.tsx` on load via `.map(migrateTextBox)`.

### Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `TextBoxesLayer` | `src/text-boxes/TextBoxesLayer.tsx` | Drawing mode overlay; renders all `TextBoxItem` children |
| `TextBoxItem` | `src/text-boxes/TextBoxItem.tsx` | Single text box: drag, resize, TipTap editor, format toolbar |
| `TextBoxFormatToolbar` | `src/text-boxes/TextBoxFormatToolbar.tsx` | Rich formatting controls; receives `editor: Editor \| null` prop |
| `FontSizeExtension` | `src/text-boxes/FontSizeExtension.ts` | Custom TipTap extension for `fontSize` on `textStyle` mark |

### Future Work

- Hebrew RTL support
- Inline LaTeX / center-aligned LaTeX block

---

## Save / Load

Projects are saved as JSON files. Loading a project restores the combined code editor, text boxes, and triggers an automatic re-analyze.

### JSON Format

```json
{
  "combinedCode": "arr = [5,3,8,1]\n# @viz\npanel = Panel(row=0, col=0)\n# @end\n...",
  "textBoxes": [
    {
      "id": "text-1234",
      "row": 1, "col": 2,
      "widthCells": 8, "heightCells": 3,
      "bgColor": "#ffffff",
      "content": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Title",
                "marks": [
                  { "type": "bold" },
                  { "type": "textStyle", "attrs": { "fontSize": "18px", "color": "#111827" } }
                ]
              }
            ]
          }
        ]
      }
    }
  ]
}
```

**Old format (two-editor):** saves with `builderCode` + `debuggerCode` + `breakpoints` fields are no longer generated. Old files can be migrated manually — there is no automatic migration path currently.

**Old format (pre-rich-text text boxes):** saves with `text`/`fontSize`/`color` fields at the box level are automatically migrated to `content: JSONContent` via `migrateTextBox()` on load.

### Fields

| Field | Type | Notes |
|-------|------|-------|
| `combinedCode` | `string` | Combined Code editor content |
| `textBoxes` | `TextBox[]` | Defaults to `[]` for saves that predate this field; old format auto-migrated |

### Local Save Mode

`IS_LOCAL = hostname === 'localhost' || '127.0.0.1'`. When running locally, Save POSTs to `/api/save-sample` (served by a Vite dev plugin) to write directly into `src/components/combined-editor/samples/`. A separate **Save to Samples** button (only visible locally) saves with the current project name as the filename. In non-local mode, Save downloads a `.json` file as usual.

The app header always shows a project name input (`projectName` state in `App.tsx`). On load, the name is set from the loaded filename.

### On Load Behavior

1. Combined Code editor is updated with loaded code
2. Text boxes are restored
3. `runAnalyze()` is called automatically

### Samples

Bundled sample projects live in `src/components/combined-editor/samples/*.json`. They are loaded at build time via Vite's `import.meta.glob`:

```typescript
const modules = import.meta.glob('../components/combined-editor/samples/*.json', { eager: true });
```

The filename (without `.json`) becomes the sample name. Files prefixed with `feature-` appear in the *Features* category in the dropdown; others appear in *Algorithms*.

### Key Files

| File | Purpose |
|------|---------|
| `src/app/App.tsx` | `handleSave`, `handleLoad` — JSON serialization/deserialization |
| `src/text-boxes/types.ts` | `TextBox` interface + `migrateTextBox()` |
| `src/components/combined-editor/samples/*.json` | Bundled sample projects |

---

## Output Terminal

The Output Terminal captures Python `print()` output and errors, displayed at the bottom of the Code Panel.

### How It Works

In the combined editor, output is captured incrementally. Each timeline step carries a `output` field containing the stdout delta since the previous snapshot. The terminal replays these deltas up to the current step, so as you step forward/backward through the timeline, the terminal shows what was printed at or before the current point.

### State

**File:** `src/output-terminal/terminalState.ts`

Stores the captured output. `combinedExecutor.ts` writes to it after each Analyze run via `setCombinedEditorSteps`.

### Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `OutputTerminal` | `src/output-terminal/OutputTerminal.tsx` | Renders terminal with scrollable output |

---

## API Reference Panel

The API Reference Panel is a floating overlay showing available visual builder functions and their signatures. It is not a tab inside the Code Panel — it is rendered directly by `App.tsx` and toggled by a button in the Visual Panel header.

### What It Shows

Schema for all available builder functions: `Panel`, `Rect`, `Circle`, `Arrow`, `Label`, `Array`, `Array2D`, `Input` — their constructor parameters, types, and descriptions.

### Implementation

**File:** `src/api/ApiReferencePanel.tsx`

The schema is defined in `src/api/functionsSchema.ts` and `src/api/visualBuilder.ts` (which also defines the `VisualBuilderElementBase` TypeScript interface used by the element registry).

| File | Purpose |
|------|---------|
| `src/api/ApiReferencePanel.tsx` | Floating overlay component |
| `src/api/functionsSchema.ts` | Available function schemas for display |
| `src/api/visualBuilder.ts` | `VisualBuilderElementBase` type + `VISUAL_ELEM_SCHEMA`; triggers element registry side effects |

---

## Embed Mode

Embed mode is a stripped-down, read-only view of a single sample — no code editor, no save/load, no text box drawing. Designed to be embedded in an `<iframe>` on external pages or linked to directly.

### Route

```
/embed?sample=<name>&dark=0|1
```

| Query param | Values | Behavior |
|-------------|--------|----------|
| `sample` | sample filename without `.json` | Required. Loads that bundled sample. Shows an error if not found. |
| `dark` | `0` or `1` | Forces light or dark mode. Absent → follows system `prefers-color-scheme`. |

**Entry point:** `src/app/EmbedPage.tsx`, registered at `/embed` in `src/main.tsx`.

### What It Shows

- Minimal header: AlgoPlay logo + sample name on the left; "Open full app ↗" link on the right (links to `/?sample=<name>`)
- Full-screen Grid (same `GridArea` as the main app, including text boxes from the save file)
- Timeline controls footer (same `TimelineControls`)
- Loading spinner overlay while Pyodide boots or analysis runs
- Error banner if analysis fails

No code editor, no project name input, no Analyze/Edit buttons, no API reference toggle, no screenshot button.

### Auto-Analyze Behavior

As soon as Pyodide finishes loading, the sample's `combinedCode` is analyzed automatically — the user never needs to click anything. If the result has only one frame and interactive elements, it jumps straight to `interactive` mode; otherwise it starts in `trace` mode as normal.

### Embedding in an `<iframe>`

```html
<iframe
  src="https://py-debugger.vercel.app/embed?sample=2-binary-search&dark=0"
  width="800"
  height="500"
  style="border: none; border-radius: 8px;"
  allow="cross-origin-isolated"
  title="Bubble Sort — AlgoPlay"
></iframe>
```

> **`allow="cross-origin-isolated"`** — Pyodide (WebAssembly) requires `SharedArrayBuffer`, which in turn requires the page to be cross-origin isolated (`COOP: same-origin` + `COEP: require-corp`). The host page must set these headers, or Pyodide will fall back to a slower single-threaded mode. The AlgoPlay server already sets them; embedding sites must do the same if they host the iframe themselves.

### Direct Link

You can also link users directly to the embed URL (opens full-screen in a browser tab):

```
https://py-debugger.vercel.app/embed?sample=2-binary-search
https://py-debugger.vercel.app/embed?sample=2-binary-search&dark=1
```

The "Open full app ↗" button in the embed header always links back to `/?sample=<name>` so users can switch to the full editor.

### Key Files

| File | Purpose |
|------|---------|
| `src/app/EmbedPage.tsx` | Full embed page component: Pyodide init, auto-analyze, mode state, layout |
| `src/main.tsx` | Registers `/embed` route → `EmbedPage` |
