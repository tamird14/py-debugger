# Developer Notes — System Overview

## What This Project Is

A browser-based visual algorithm debugger. Users write Python debugger code and visual
builder code, click "Analyze", and step through execution seeing data structures animate on
a grid. After the trace, they can enter interactive mode and click on visual elements to
trigger handlers that run further debugger code — with full state persisting across clicks.
Python runs entirely in-browser via Pyodide (WebAssembly).

---

## Directory Structure

```
src/
├── app/                    # React shell: App.tsx state machine + two panel components
│   ├── App.tsx             # All top-level state, mode transitions, handler wiring
│   ├── CodeEditorArea.tsx  # Left panel: code tabs, buttons, variable panel
│   └── GridArea.tsx        # Right panel: grid, click dispatch, screenshot
│
├── code-builder/
│   └── services/
│       ├── pythonExecutor.ts       # TypeScript ↔ Pyodide bridge (all Pyodide calls)
│       ├── visualBuilder.py        # VisualElem class hierarchy, DebugCall, _handle_click
│       └── visualBuilderShapes.py  # Shape subclasses (Rect, Circle, Arrow, Label, Array)
│
├── debugger-panel/
│   ├── pythonTracer.py             # sys.settrace tracing, _exec_context, V(), timelines
│   ├── DebuggerCodeEditor.tsx      # Monaco editor for debugger code (with breakpoints)
│   ├── codeTimelineState.ts        # Store for code-side trace steps (variables, scope)
│   └── debuggerSample.py           # Default code loaded on startup
│
├── timeline/
│   └── timelineState.ts            # Store for visual snapshots; hydration from JSON
│
├── visual-panel/
│   ├── handlersState.ts            # Registry: elem_id → ["on_click"]
│   ├── hooks/useGridState.ts       # Grid state: loadVisualBuilderObjects, click data
│   ├── components/
│   │   ├── Grid.tsx                # 50×50 cell grid renderer; zoom, screenshots
│   │   └── ...                     # Cell renderers, overlay cells
│   ├── render-objects/             # TypeScript element classes (Rect, Circle, etc.)
│   └── types/elementRegistry.ts   # Maps type string → constructor for hydration
│
├── api/
│   └── visualBuilder.ts            # VisualBuilderElementBase type; VISUAL_ELEM_SCHEMA
│
├── text-boxes/                     # UI-only grid text annotations (not Python objects)
│   ├── types.ts                    # TextBox interface
│   ├── TextBoxesLayer.tsx          # Drawing mode overlay + renders all TextBoxItem children
│   ├── TextBoxItem.tsx             # Single draggable/resizable/editable text box
│   └── TextBoxFormatToolbar.tsx    # Font size, text color, bg color, delete
│
├── contexts/ThemeContext.tsx        # Dark/light mode
├── timeline/TimelineControls.tsx   # Prev/next/breakpoint controls in header
└── samples/                        # Bundled sample JSON files (bubble-sort.json, ...)
```

---

## Mode State Machine

```
                    ┌────────────────┐
                    │  idle/editing  │  editors unlocked, Analyze button active
                    └───────┬────────┘
                            │ Analyze succeeds
                            ▼
                    ┌────────────────┐
                    │     trace      │  timeline active, editors locked, mouse off
                    └───────┬────────┘
                            │ "Finish & Interact"
                            ▼
          ┌───────────────────────────────────────┐
    ┌────►│          interactive                  │  mouse on, timeline hidden
    │     └───────────────┬───────────────────────┘
    │                     │ click returns DebugCall
    │                     ▼
    │     ┌────────────────────────────┐
    │     │      debug_in_event        │  timeline active, editors locked, mouse off
    │     └────────────────────────────┘
    │                     │ "Back to Interactive"
    └─────────────────────┘
```

| Mode | Timeline | Mouse | Editors | Variable panel |
|------|----------|-------|---------|----------------|
| `idle` | hidden | off | unlocked | hidden |
| `trace` | visible | off | locked | visible |
| `interactive` | hidden | on | locked | hidden |
| `debug_in_event` | visible | off | locked | visible |

Derived: `mouseEnabled = appMode === 'interactive'`

---

## Key State in App.tsx

| Variable | Type | Purpose |
|----------|------|---------|
| `appMode` | `'idle'\|'trace'\|'interactive'\|'debug_in_event'` | Drives all UI mode logic |
| `visualBuilderCode` | `string` | Visual builder editor content |
| `debuggerCode` | `string` | Debugger editor content (clean, no suffix) |
| `debugCallSuffix` | `string \| null` | Appended to editor display only when in debug_in_event; cleared on Edit/BackToInteractive |
| `analyzeStatus` | `'idle'\|'success'\|'error'\|'dirty'` | Controls Analyze/Edit button appearance |
| `currentStep` | `number` | Current timeline index |
| `stepCount` | `number` | Total steps in active timeline |
| `breakpoints` | `Set<number>` | Line numbers with breakpoints |
| `isAnalyzing` | `boolean` | Disables Analyze button while running |

---

## Full Data Flow

### Initial Trace (Analyze)

1. `handleAnalyze()` calls `runAnalyze(vbCode, dbgCode)`
2. `executePythonCode(vbCode, dbgCode)`:
   - Loads Pyodide + 3 Python files (once per session)
   - `VisualElem._clear_registry()` — clears visual element list
   - `exec(visualBuilderCode)` — defines panels, shapes, V()-bound properties
   - `_visual_code_trace(debuggerCode)` — runs debugger code with settrace; builds timelines
   - Returns `{ code_timeline, visual_timeline, handlers }` as JSON
3. `setHandlers()`, `setCodeTimeline()`, `hydrateTimelineFromArray()` populate stores
4. `loadVisualBuilderObjects(timeline[0])` — renders first snapshot
5. `appMode = 'trace'`

### Timeline Navigation

1. `goToStep(n)` → `getStateAt(n)` → returns already-hydrated snapshot (no Python re-exec)
2. `loadVisualBuilderObjects(snapshot)` → grid re-renders
3. `getCodeStepAt(n)` → variable panel updates

### Click Handler — No DebugCall

1. Grid fires `onElementClick(elemId, position)`
2. `executeClickHandler(elemId, row, col)`:
   - `_handle_click(elemId, row, col)` → `None`
   - `_serialize_visual_builder()` → new snapshot
   - `_serialize_handlers_json()` → re-fetches handlers (supports new clickable elements)
3. `loadVisualBuilderObjects(hydratedSnapshot)` — grid updates in place

### Click Handler — With DebugCall

1. Grid fires `onElementClick(elemId, position)`
2. `executeClickHandler` → `_handle_click` → returns `"expression string"`
3. `result.debugCall` is non-null → `onDebugCall?.("expression")`
4. `handleDebugCall(expression)`:
   - Sets `debugCallSuffix` for editor display
   - `appMode = 'debug_in_event'`
   - `lineOffset = debuggerCode.split('\n').length + 2`
   - `executeDebugCall(expression, lineOffset)` → Pyodide runs `_prepare_and_trace_debug_call`
   - Loads sub-run timeline into stores
5. User steps through sub-run; `_exec_context` now has mutations

### Back to Interactive

1. `handleBackToInteractive()`:
   - `goToStep(getMaxTime())` — show last step of sub-run
   - `setDebugCallSuffix(null)` — remove injected function from editor
   - `appMode = 'interactive'`

### Edit

1. `handleEdit()`:
   - `setDebugCallSuffix(null)` — **must** be cleared to prevent Monaco onChange loop
   - `setAnalyzeStatus('dirty')`
   - `setAppMode('idle')`

---

## The Three Python Files Loaded Into Pyodide

All three are loaded once at session start by `loadPythonRuntime()`.

| File | Purpose |
|------|---------|
| `visualBuilder.py` | `VisualElem` base class + `_registry`; `Panel`; `DebugCall` sentinel; `_handle_click`; `_serialize_visual_builder`; `_serialize_handlers` / `_serialize_handlers_json`; `PopupException` |
| `visualBuilderShapes.py` | `Rect`, `Circle`, `Arrow`, `Label`, `Array`, `Array2D` — concrete shape classes with `_serialize()` |
| `pythonTracer.py` | `sys.settrace` tracing; `_exec_context`; `V()` class; `_visual_code_trace`; `_prepare_and_trace_debug_call`; `MAX_TRACE_STEPS` |

`pythonTracer.py` is loaded last because it patches `VisualElem.__getattribute__` with `get_v_attr` (to auto-eval `V()` objects) and references `_serialize_visual_builder` and `_serialize_handlers` defined in `visualBuilder.py`.

---

## Component Tree & Prop Drilling

```
App.tsx
  │  appMode, currentStep, stepCount, breakpoints, isAnalyzing, analyzeStatus
  │
  ├─ CodeEditorArea.tsx
  │   props: code, debuggerCode, appMode, readOnly, analyzeStatus, breakpoints,
  │           highlightedLines, currentVariables, onAnalyze, onEdit, onLoad, onSave,
  │           onEnterInteractive, onBackToInteractive, onBreakpointsChange
  │   ├─ DebuggerCodeEditor  (code tab)
  │   ├─ VariablePanel       (code tab, hidden in interactive mode)
  │   └─ CodeEditor          (visual-builder tab)
  │
  └─ GridArea.tsx
      props: darkMode, mouseEnabled, onDebugCall
      └─ Grid.tsx
          props: cells, panels, zoom, mouseEnabled, onElementClick
```

---

## Text Boxes (User Annotations)

Text boxes are UI-only grid annotations — not Python objects. They persist across Analyze
runs and are saved/loaded as part of the project JSON.

**State ownership:**
- `textBoxes: TextBox[]` — lives in `App.tsx` (needed for save/load)
- `addingTextBox: boolean`, `selectedTextBoxId: string|null` — local to `GridArea.tsx`

**Rendering:**
- `TextBoxesLayer` renders inside Grid's `gridContentRef` (the `transform: scale(zoom)` div)
  as a 5th absolute layer — automatically zooms with the grid
- Coordinates: `left = col * CELL_SIZE`, `top = row * CELL_SIZE` (CELL_SIZE = 40)

**Drawing mode (T+ button):**
- `addingTextBox = true` overlays a transparent fullscreen div with `cursor: crosshair`
- `offsetX / CELL_SIZE` → column (works correctly because CSS transforms don't affect offsetX)
- On mouseup: creates `TextBox` with `id = text-${Date.now()}`, adds to state, auto-selects

**Drag/resize coordinate math:**
- Move: `newCol = startCol + Math.round((clientX - startClientX) / (CELL_SIZE * zoom))`
- Resize: same math on width/height; min 2×2 cells enforced

**Formatting toolbar:**
- Rendered inside the text box div at `position: absolute; bottom: 100%`
- Controls: font-size select (10–48px), text color, bg color, clear-bg, delete

**Key files:**
- `src/text-boxes/types.ts` — TextBox interface
- `src/text-boxes/TextBoxesLayer.tsx` — drawing mode + all TextBoxItem children
- `src/text-boxes/TextBoxItem.tsx` — drag, resize, edit, format toolbar
- `src/text-boxes/TextBoxFormatToolbar.tsx` — formatting controls

**TODO (future):**
- Rich/structured text (title + bullet runs)
- Hebrew RTL, inline LaTeX, center-aligned LaTeX block

---

## Save / Load JSON Format

```json
{
  "builderCode": "panel = Panel('main')...",
  "debuggerCode": "arr = [5,3,8,1]\n...",
  "breakpoints": [7, 12],
  "textBoxes": [
    { "id": "text-1234", "row": 1, "col": 2, "widthCells": 8, "heightCells": 3,
      "text": "Title", "fontSize": 18, "color": "#111827", "bgColor": "#ffffff" }
  ]
}
```

- `builderCode` = visual builder editor content (not `code` — renamed for clarity)
- `debuggerCode` = debugger editor content
- `breakpoints` = array of line numbers (restored as `new Set(...)` on load)
- `textBoxes` = user annotation boxes (added in text-box feature; defaults to `[]` for old saves)
- On load: both editors are updated and `runAnalyze()` is called automatically

Samples live in `src/samples/*.json` and are bundled at build time via Vite's
`import.meta.glob('../samples/*.json', { eager: true })`.

---

## Sharp Edges

**`_exec_context` not reset between sessions**
Running Analyze twice on the same page accumulates variables from both runs. Functions
defined in the first run are still visible in the second. `VisualElem._clear_registry()` resets
the visual element list but not Python variables. Re-loading the page is the only full reset.

**`debugCallSuffix` must be cleared before Monaco can edit freely**
The `code` prop to `DebuggerCodeEditor` is `debuggerCode + (debugCallSuffix ?? '')`.
If `suffix` is non-null when `appMode` becomes `idle`, Monaco fires `onChange` with the
suffixed content → `setDebuggerCode(originalCode + suffix)` → prop becomes
`(originalCode + suffix) + suffix` → infinite loop. `handleEdit` clears the suffix first.

**`_elem_id` (Python, snake_case) vs `_elemId` (TypeScript, camelCase)**
Python serializes `"_elem_id": self._elem_id`. `BasicShape.ts` constructor translates it:
`this._elemId = el._elem_id`. Code that reads back the ID from a hydrated instance must
use `_elemId` (camelCase). This is the only identity bridge between Python and TypeScript.

**`_vb_id` is not stable across calls to `_serialize_visual_builder()`**
`_vb_id` is assigned fresh on every serialization call (incrementing counter). Do not use it
as a stable key across calls. Use `_elem_id` for element identity.

**`_serialize_handlers()` vs `_serialize_handlers_json()`**
`_serialize_handlers()` returns a **Python dict** — used inside `_visual_code_trace` which
wraps everything in a single `json.dumps`. `_serialize_handlers_json()` returns a **JSON
string** — used by TypeScript direct calls (`executeClickHandler`). Never embed
`_serialize_handlers_json()` inside another `json.dumps` — it would double-encode.

**`V.params` is a class variable**
All `V()` instances share a single `V.params`. It is set once per timeline step before
`_serialize_visual_builder()` is called. If serialization is called outside this flow,
`V.params` holds whatever was set last.

**Panel-relative vs absolute positions**
Child elements store positions relative to their parent panel in Python serialization.
`useGridState.loadVisualBuilderObjects()` resolves them to absolute grid coordinates.
The raw `el.position` from a hydrated snapshot is the absolute position; the serialized
`el.position` from Python may be relative. Never compare them directly.

**Handlers are re-fetched on every click**
`executeClickHandler` calls `_serialize_handlers_json()` after the handler runs. This allows
handlers that create new visual elements (with their own `on_click`) to make those elements
immediately clickable. Downside: each click costs an extra Pyodide round-trip.
