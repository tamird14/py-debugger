# Developer Notes

**AlgoPlay** — a browser-based interactive algorithm visualizer. Users write Python code in a single editor, click Analyze, step through execution watching data structures animate on a grid, then enter interactive mode to click on elements that trigger Python handlers.

---

## Part 1: App Overview

### What This Project Is

Users write a single Python file that contains two kinds of code, interleaved:

- **Algorithm code** — the algorithm being studied (e.g. bubble sort). Traced with V() change detection: a snapshot is recorded whenever any bound V() expression changes value.
- **Viz blocks** (`# @viz … # @end`) — visual builder code that declares panels, shapes, and V()-bound properties. A snapshot is recorded at the end of each viz block. Viz blocks can appear anywhere in the file — at the top to declare the initial layout, or inline between algorithm steps to update visuals.

The result is a **timeline** of snapshots that can be navigated forward and backward.

Python runs entirely in-browser via **Pyodide** (WebAssembly). There is no server.

→ See [Python Engine](./python-engine.md) for how execution, tracing, and V() work.
→ See [Visual Elements](./visual-elements.md) for how Python objects become clickable grid cells.

### Product Vision

**AlgoPlay** — interactive exploration of algorithms, not passive watching.

The core differentiator is **interactive mode**: users click visual elements, trigger traced sub-runs, and accumulate state across interactions. No other algorithm visualizer has this. Every architectural decision should favor making interactive mode powerful and discoverable.

### Component Layout

```
┌──────────────────────────────┬──────────────────────────────────────┐
│          Code Panel          │           Visual Panel               │
│                              │                                      │
│  ┌────────────────────────┐  │  ┌────────────────────────────────┐  │
│  │  Combined Code editor  │  │  │                                │  │
│  │  (Monaco, viz block    │  │  │   Grid (50×50 cells)           │  │
│  │   decorations, line    │  │  │   + TextBoxesLayer             │  │
│  │   highlight, autocpl.) │  │  │                                │  │
│  └────────────────────────┘  │  └────────────────────────────────┘  │
│  Output Terminal (bottom)    │  Zoom controls · Screenshot          │
│                              │  API Reference (toggle button)       │
└──────────────────────────────┴──────────────────────────────────────┘
       App header: TimelineControls · Analyze/Edit · mode badge · Animated/Jump toggle · dark mode
```

**Named components:**
| Name | What it is |
|------|-----------|
| **Code Panel** | Left side — the combined code editor |
| **Combined Code editor** | Single Monaco editor; viz blocks highlighted in blue; active line highlighted in yellow during trace; autocomplete for visual API |
| **Output Terminal** | Print output at the bottom of the Code Panel |
| **Visual Panel** | Right side — the grid canvas with text box overlay and controls |
| **API Reference** | Floating overlay showing builder function signatures; toggled from the Visual Panel |
| **TimelineControls** | Step prev/next navigation in the app header |

### Embed Mode

Navigate to `/embed?sample=<name>&dark=0|1` for an embeddable view: no code editor, auto-analyzes on Pyodide ready, minimal header with sample selector, same Grid and TimelineControls. Used for embedding demos in external pages.

### Main Flow

The app has four modes. The normal progression is:

1. **Write** Python code in the Combined Code editor (algorithm + viz blocks)
2. **Analyze** — Python executes the code with V() change detection and viz-block snapshot hooks; builds a timeline
3. **Trace mode** — step forward/backward through the timeline; watch data structures animate and variables update
4. **Interactive mode** — click on visual elements to trigger Python handlers; handlers run with viz-aware tracing and produce a mini-timeline

```
                ┌────────────────┐
                │      idle      │
                └───────┬────────┘
                        │ Analyze succeeds
                        ▼
                ┌────────────────┐
                │     trace      │
                └───────┬────────┘
                        │ Finish & Interact
                        ▼
     ┌───────────────────────────────────────┐
┌───►│           interactive                 │
│    └───────────────┬───────────────────────┘
│                    │ click → mini-timeline to step through
│                    ▼
│    ┌────────────────────────┐
│    │       debug_in_event   │
│    └────────────────────────┘
│                    │ Back to Interactive
└────────────────────┘

(Edit returns to idle from trace or interactive)
```

| Mode | Timeline | Mouse | Editor | Variable panel |
|------|----------|-------|--------|----------------|
| `idle` | hidden | off | unlocked | hidden |
| `trace` | visible | off | locked | visible |
| `interactive` | hidden | on | locked | hidden |
| `debug_in_event` | visible | off | locked | visible |

### Trace Mode

After Analyze, the app enters trace mode. The timeline is pre-built and stored in memory. Navigation never re-executes Python.

- **TimelineControls** lets the user step prev/next
- The **Visual Panel** shows the animated snapshot at the current step
- The **Combined Code editor** highlights the current line in yellow; the **variable panel** shows captured variables at that step

### Interactive Mode

In interactive mode, visual elements that have Python `on_click` handlers are clickable (pointer cursor, timeline hidden).

When an element is clicked:
1. `executeCombinedClickHandler(elemId, row, col, vizRanges)` is called
2. Python runs the handler with viz-aware tracing (algorithm code inside the handler is traced; viz-block helper functions are skipped)
3. Returns `CombinedClickResult: { interactiveTimeline, finalSnapshot }`
4. The mini-timeline is appended and the app enters `debug_in_event` mode for stepping
5. **Back to Interactive** returns to interactive mode with the accumulated state

The Python namespace (`_combined_ns`) persists across all clicks and sub-runs — handlers can read and mutate the algorithm's state over multiple interactions.

---

### Detailed Documentation

- [**Python Engine**](./python-engine.md) — Pyodide runtime, combined execution model, viz block preprocessing, V() change detection tracer, snapshot recording, interactive click tracing, the TypeScript↔Python bridge
- [**Visual Elements**](./visual-elements.md) — full pipeline from Python object to clickable grid cell: serialization, TypeScript hydration, element registry, two-pass grid layout, click dispatch chain
- [**Other Components**](./other-components.md) — text boxes (drawing, drag/resize, formatting), save/load JSON format, output terminal, API reference panel
- [**Sharp Edges**](./sharp-edges.md) — known issues and architectural quirks to read before touching the Python/TypeScript boundary, serialization, or mode transitions
- [**Python Tracing Primer**](./python-tracing-primer.md) — how `sys.settrace` works: events, frame attributes, worked example with output

---
---

## Part 2: Technical Reference

### Directory Structure

```
src/
├── app/                            # React shell and layout
│   ├── App.tsx                     # All top-level state, mode transitions, event wiring
│   ├── EmbedPage.tsx               # Embed-only entry point (/embed route)
│   ├── GridArea.tsx                # Visual Panel: grid container, click dispatch, screenshot
│   └── ExtrasMenu.tsx              # Header extras dropdown (dark mode, etc.)
│
├── components/
│   └── combined-editor/            # Combined editor: all Python engine files + TS bridge
│       ├── CombinedEditor.tsx      # Monaco editor with viz block decorations, line highlight, autocomplete
│       ├── combinedExecutor.ts     # TypeScript ↔ Pyodide bridge (all Pyodide calls)
│       ├── vizBlockParser.ts       # Parse & validate # @viz / # @end blocks
│       ├── _vb_engine.py           # VFS module: VisualElem, V, R, TrackedDict, PopupException
│       ├── user_api.py             # VFS module: user-facing API (Panel, shapes, Input, no_debug)
│       ├── vb_serializer.py        # Engine: execution, snapshot recording, interactive dispatch
│       ├── sample.py               # Default sample shown on first load
│       └── samples/                # Bundled sample JSON files (*.json)
│
├── python-engine/                  # Legacy location — vestigial; combined-editor supersedes it
│   └── code-builder/services/
│       └── pythonExecutor.ts       # Pyodide init + loadPyodide() (still used for initialization)
│
├── timeline/
│   ├── TimelineControls.tsx        # Prev/next navigation (rendered in header)
│   ├── timelineState.ts            # Store for visual snapshots; hydrateTimelineFromArray()
│   └── discreteTimelineSchema.ts   # Timeline data types
│
├── visual-panel/
│   ├── handlersState.ts            # Registry: elem_id → ["on_click"]
│   ├── hooks/useGridState.ts       # loadVisualBuilderObjects(); grid cell map; occupancy
│   ├── components/
│   │   ├── Grid.tsx                # 50×50 cell renderer; zoom, screenshots
│   │   └── GridCell.tsx            # Individual cell with shape renderer
│   ├── render-objects/             # TypeScript element classes (Rect, Circle, Arrow, Panel, etc.)
│   ├── shapes/                     # React SVG/HTML renderers per shape type
│   ├── views/rendererRegistry.ts   # Maps type string → React renderer
│   └── types/elementRegistry.ts   # Maps type string → constructor for hydration
│
├── api/
│   ├── ApiReferencePanel.tsx       # API reference overlay
│   ├── visualBuilder.ts            # VisualBuilderElementBase interface + VISUAL_ELEM_SCHEMA
│   └── functionsSchema.ts          # Available builder function schemas
│
├── text-boxes/                     # UI-only grid annotations (not Python objects)
│   ├── types.ts                    # TextBox interface
│   ├── TextBoxesLayer.tsx          # Drawing mode overlay + renders all TextBoxItem children
│   ├── TextBoxItem.tsx             # Single draggable/resizable/editable text box
│   └── TextBoxFormatToolbar.tsx    # Font size, text color, bg color, delete
│
├── output-terminal/
│   ├── OutputTerminal.tsx          # Print output display
│   └── terminalState.ts            # Output capture state
│
├── animation/
│   └── animationContext.tsx         # AnimationContext (boolean); Animated/Jump toggle state
├── contexts/ThemeContext.tsx        # Dark/light mode context
├── pages/PlanPage.tsx              # About/info page (/plan route)
└── main.tsx                        # App entry point; BrowserRouter; routes: / → App, /embed → EmbedPage
```

---

### Mode State Machine

See diagram in Part 1. Derived values:
- `mouseEnabled = appMode === 'interactive'`
- `readOnly = appMode !== 'idle'`
- `showTimeline = appMode === 'trace' || appMode === 'debug_in_event'`

---

### Key State in App.tsx

| Variable | Type | Purpose |
|----------|------|---------|
| `appMode` | `'idle'\|'trace'\|'interactive'\|'debug_in_event'` | Drives all UI mode logic |
| `combinedCode` | `string` | Combined Code editor content |
| `combinedTimeline` | `CombinedStep[]` | Timeline from last Analyze |
| `isCombinedEditable` | `boolean` | Whether editor is unlocked |
| `isAnalyzingCombined` | `boolean` | Disables Analyze button while Python runs |
| `analyzeStatus` | `'idle'\|'success'\|'error'` | Controls Analyze/Edit button appearance |
| `projectName` | `string` | Current project name; used as filename for Save |
| `currentStep` | `number` | Current timeline index |
| `stepCount` | `number` | Total steps in active timeline |
| `hasInteractiveElements` | `boolean` | Whether any element has a click handler |
| `textBoxes` | `TextBox[]` | Grid annotation boxes (owned here for save/load) |
| `pyodideReady` | `boolean` | Whether Pyodide has finished loading |

---

### Full Data Flow

#### Initial Trace (Analyze)

1. `handleAnalyzeCombined()` calls `executeCombinedCode(combinedCode)`
2. `combinedExecutor.ts`:
   - Preprocesses code: `# @viz` → `__viz_begin__()`, `# @end` → `__viz_end__(dict(locals()))`
   - Loads Pyodide (once per session)
   - Calls `py.runPythonAsync(_exec_combined_code(preprocessedCode))`
   - Returns `CombinedResult: { timeline: CombinedStep[], handlers, error? }`
3. `setHandlers()`, `hydrateTimelineFromArray()` populate stores
4. `loadVisualBuilderObjects(timeline[0])` renders first snapshot
5. `appMode = 'trace'`

#### Timeline Navigation

1. `goToStep(n)` → `getStateAt(n)` → returns already-hydrated snapshot (no Python re-exec)
2. `loadVisualBuilderObjects(snapshot)` → grid re-renders
3. Variable panel updates from `CombinedStep.variables`

#### Click Handler

1. Grid fires `onCombinedTrace(elemId, row, col)`
2. `executeCombinedClickHandler(elemId, row, col, vizRanges)` in `combinedExecutor.ts`:
   - Calls `_exec_combined_click_traced(elemId, row, col)` in Python
   - Returns `CombinedClickResult: { interactiveTimeline, finalSnapshot }`
3. Mini-timeline appended to stores; `appMode = 'debug_in_event'`
4. User steps through mini-timeline; Back to Interactive returns to `interactive`

#### Input Changed

1. User types in an `Input` element → `onCombinedInputChanged(elemId, text)`
2. `executeCombinedInputChanged(elemId, text, vizRanges)` → same `CombinedClickResult` shape
3. Same mini-timeline flow as click

#### Edit

1. `handleEdit()`:
   - `setIsCombinedEditable(true)`
   - `setAppMode('idle')`

---

### Python Files Loaded Into Pyodide

`_vb_engine.py` and `user_api.py` are written to the Pyodide VFS and imported as modules. `vb_serializer.py` is exec'd into Pyodide globals.

| File | How loaded | Purpose |
|------|------------|---------|
| `src/components/combined-editor/_vb_engine.py` | VFS import | Hidden engine types: `VisualElem`, `V`, `R`, `TrackedDict`, `PopupException` |
| `src/components/combined-editor/user_api.py` | VFS import | User-facing API: `Panel`, all shapes, `Input`, `no_debug` |
| `src/components/combined-editor/vb_serializer.py` | exec'd | Execution, snapshot recording, interactive dispatch |

See [Python Engine](./python-engine.md) for the full architecture.

---

### Component Prop Tree

```
App.tsx
  │  appMode, currentStep, stepCount, hasInteractiveElements, isAnalyzingCombined,
  │  combinedCode, isCombinedEditable, textBoxes, pyodideReady
  │
  ├─ TimelineControls.tsx   (in header)
  │   props: currentStep, stepCount, appMode, onStep, onEnterInteractive
  │
  ├─ ApiReferencePanel.tsx  (floating overlay)
  │   props: open, onClose
  │
  ├─ CombinedEditor.tsx     (Code Panel)
  │   props: code, onChange, isEditable, currentStep, currentLine, appMode
  │   handle: foldVizBlocks()
  │   └─ OutputTerminal   (bottom of editor)
  │
  └─ GridArea.tsx           (Visual Panel)
      props: darkMode, mouseEnabled, textBoxes, onTextBoxesChange,
             combinedVizRanges, onCombinedTrace, onCombinedInputChanged
      ├─ Grid.tsx
      │   props: cells, panels, zoom, mouseEnabled, onElementClick
      └─ TextBoxesLayer.tsx

EmbedPage.tsx  (separate root at /embed)
  │  appMode, currentStep, stepCount, pyodideReady
  ├─ TimelineControls.tsx
  └─ GridArea.tsx   (same props as App, minus text boxes and edit callbacks)
```
