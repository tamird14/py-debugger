# Developer Notes

A browser-based visual algorithm debugger: write Python code, click Analyze, step through execution watching data structures animate on a grid, then enter interactive mode to click on elements that trigger Python handlers.

---

## Part 1: App Overview

### What This Project Is

Users write two kinds of Python code side-by-side:

- **Debugger code** — the algorithm being studied (e.g. bubble sort). It is traced line-by-line, and the trace is saved as a **Timeline** of steps that can be navigated forward, backward, and by jumping to breakpoints. → See [Python Engine](./python-engine.md)
- **Builder code** — declares visual elements (panels, rectangles, circles, arrows, arrays) whose properties can be bound to debugger variables, so they animate as you step through the algorithm. → See [Visual Elements](./visual-elements.md)

Python runs entirely in-browser via **Pyodide** (WebAssembly). There is no server.

### Component Layout

```
┌──────────────────────────────┬──────────────────────────────────────┐
│          Code Panel          │           Visual Panel               │
│                              │                                      │
│  ┌────────────────────────┐  │  ┌────────────────────────────────┐  │
│  │  Debugger Code editor  │  │  │                                │  │
│  │  (Monaco, breakpoints, │  │  │   Grid (50×50 cells)           │  │
│  │   variable viewer)     │  │  │   + TextBoxesLayer             │  │
│  ├────────────────────────┤  │  │                                │  │
│  │  Builder Code editor   │  │  └────────────────────────────────┘  │
│  │  (Monaco)              │  │  Zoom controls · Screenshot          │
│  └────────────────────────┘  │  API Reference (toggle button)       │
│  Output Terminal (bottom)    │                                      │
└──────────────────────────────┴──────────────────────────────────────┘
       App header: TimelineControls · Analyze/Edit · mode badge · Animated/Jump toggle · dark mode
```

**Named components:**
| Name | What it is |
|------|-----------|
| **Code Panel** | Left side — tab container with the two code editors |
| **Debugger Code editor** | Monaco editor for the algorithm; breakpoint gutter, live variable panel |
| **Builder Code editor** | Monaco editor for visual builder Python code |
| **Output Terminal** | Print output at the bottom of the Code Panel; segmented into builder/debugger/combined tabs |
| **Visual Panel** | Right side — the grid canvas with text box overlay and controls |
| **API Reference** | Floating overlay showing builder function signatures; toggled from the Visual Panel |
| **TimelineControls** | Step prev/next/breakpoint navigation in the app header |

### Main Flow

The app has four modes. The normal progression is:

1. **Write** debugger code and builder code in the Code Panel
2. **Analyze** — Python traces the algorithm and builds two parallel timelines (visual snapshots + variable states)
3. **Trace mode** — step forward/backward through the timeline; watch data structures animate and variables update
4. **Interactive mode** — click on visual elements to trigger Python handlers; handlers can update the visualization or launch a **debug call** (a mini traced sub-run)
5. **Debug call** — a handler expression is traced as a new timeline; step through it, then return to interactive mode with accumulated state

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
│                    │ click returns DebugCall
│                    ▼
│    ┌────────────────────────────┐
│    │       debug_in_event       │
│    └────────────────────────────┘
│                    │ Back to Interactive
└────────────────────┘

(Edit returns to idle from trace or interactive)
```

| Mode | Timeline | Mouse | Editors | Variable panel |
|------|----------|-------|---------|----------------|
| `idle` | hidden | off | unlocked | hidden |
| `trace` | visible | off | locked | visible |
| `interactive` | hidden | on | locked | hidden |
| `debug_in_event` | visible | off | locked | visible |

### Trace Mode

After Analyze, the app enters trace mode. The two timelines — one visual, one for code state — are pre-built and stored in memory. Navigation never re-executes Python.

- **TimelineControls** (in the header) lets the user step prev/next or jump to the nearest breakpoint
- The **Visual Panel** shows the animated snapshot at the current step — elements update their size, color, and position as you step
- The **Debugger Code editor** highlights the current line; the **variable panel** shows all captured variable values at that step
- Variables are back-filled: if a variable is first assigned at step 10, it is visible (with that value) at steps 0–9 too
- Click **Finish & Interact** to leave trace mode and enter interactive mode

### Interactive Mode and Debug Calls

In interactive mode, visual elements that have Python `on_click` handlers are clickable (pointer cursor, no timeline visible).

**Simple click handler:** The `on_click` function runs in Python, updates the visual element state, and the grid re-renders with the new snapshot. No mode change.

**DebugCall:** If `on_click` returns `DebugCall("some_expression")`, the expression is wrapped into a function and traced as a mini sub-run. The app enters `debug_in_event` mode: the Debugger Code editor shows the original code plus the injected expression, and the timeline shows the sub-run's steps. After stepping through, **Back to Interactive** returns to interactive mode.

State accumulates across interactions: the Python execution namespace (`_exec_context`) is preserved between clicks and debug calls, so handlers can read and mutate algorithm variables over multiple interactions.

---

### Detailed Documentation

- [**Python Engine**](./python-engine.md) — Pyodide runtime, the tracer (`sys.settrace`, `_exec_context`, `V()` expressions, back-fill algorithm), the builder (VisualElem class hierarchy, shapes, DebugCall), and the TypeScript↔Python bridge
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
│   ├── CodeEditorArea.tsx          # Code Panel: tabs, buttons, variable panel layout
│   └── GridArea.tsx                # Visual Panel: grid container, click dispatch, screenshot
│
├── code-builder/
│   └── services/
│       ├── pythonExecutor.ts       # TypeScript ↔ Pyodide bridge (all Pyodide calls)
│       ├── visualBuilder.py        # VisualElem base class, Panel, DebugCall, _handle_click, serialization
│       └── visualBuilderShapes.py  # Shape subclasses: Rect, Circle, Arrow, Line, Label, Array, Array2D
│
├── debugger-panel/
│   ├── pythonTracer.py             # sys.settrace tracing, _exec_context, V(), timelines
│   ├── DebuggerCodeEditor.tsx      # Monaco editor with breakpoint gutter
│   ├── VariablePanel.tsx           # Live variable viewer (shown in trace/debug_in_event)
│   ├── codeTimelineState.ts        # Store for code-side trace steps (variables + scope)
│   └── debuggerSample.py           # Default debugger code loaded on startup
│
├── timeline/
│   ├── TimelineControls.tsx        # Prev/next/breakpoint navigation (rendered in header)
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
│   ├── ApiReferencePanel.tsx       # API reference overlay (rendered by App.tsx)
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
│   ├── OutputTerminal.tsx          # Print output display with builder/debugger/combined tabs
│   └── terminalState.ts            # Output capture and segmentation state
│
├── animation/
│   └── animationContext.tsx         # AnimationContext (boolean); Animated/Jump toggle state
├── contexts/ThemeContext.tsx        # Dark/light mode context
├── samples/                        # Bundled sample JSON files (bubble-sort.json, etc.)
├── pages/PlanPage.tsx              # About/info page (/about route)
└── main.tsx                        # App entry point; BrowserRouter; ThemeProvider
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
| `visualBuilderCode` | `string` | Builder Code editor content |
| `debuggerCode` | `string` | Debugger Code editor content (clean, no suffix) |
| `debugCallSuffix` | `string \| null` | Appended to editor display only during `debug_in_event`; must be cleared on Edit/BackToInteractive |
| `analyzeStatus` | `'idle'\|'success'\|'error'\|'dirty'` | Controls Analyze/Edit button appearance |
| `currentStep` | `number` | Current timeline index |
| `stepCount` | `number` | Total steps in active timeline |
| `breakpoints` | `Set<number>` | Line numbers with breakpoints |
| `isAnalyzing` | `boolean` | Disables Analyze button while Python is running |
| `textBoxes` | `TextBox[]` | Grid annotation boxes (owned here for save/load) |

---

### Full Data Flow

#### Initial Trace (Analyze)

1. `handleAnalyze()` calls `runAnalyze(vbCode, dbgCode)`
2. `executePythonCode(vbCode, dbgCode)` in `src/code-builder/services/pythonExecutor.ts`:
   - Loads Pyodide + 3 Python files once per session
   - `VisualElem._clear_registry()` — clears visual element list
   - `exec(visualBuilderCode)` — defines panels, shapes, V()-bound properties in Pyodide globals
   - `_visual_code_trace(debuggerCode)` — traces debugger code; builds timelines
   - Returns `{ code_timeline, visual_timeline, handlers }` as JSON
3. `setHandlers()`, `setCodeTimeline()`, `hydrateTimelineFromArray()` populate stores
4. `loadVisualBuilderObjects(timeline[0])` — renders first snapshot in grid
5. `appMode = 'trace'`

#### Timeline Navigation

1. `goToStep(n)` → `getStateAt(n)` → returns already-hydrated snapshot (no Python re-exec)
2. `loadVisualBuilderObjects(snapshot)` → grid re-renders
3. `getCodeStepAt(n)` → variable panel updates

#### Click Handler — No DebugCall

1. Grid fires `onElementClick(elemId, position)`
2. `executeClickHandler(elemId, row, col)` in `pythonExecutor.ts`:
   - `_handle_click(elemId, row, col)` → `None`
   - `_serialize_visual_builder()` → new snapshot
   - `_serialize_handlers_json()` → re-fetches handlers (supports new clickable elements)
3. `loadVisualBuilderObjects(hydratedSnapshot)` — grid updates in place

#### Click Handler — With DebugCall

1. Grid fires `onElementClick(elemId, position)`
2. `executeClickHandler` → `_handle_click` → returns `"expression string"`
3. `result.debugCall` is non-null → `onDebugCall?.("expression")`
4. `handleDebugCall(expression)` in `App.tsx`:
   - Sets `debugCallSuffix` for editor display
   - `appMode = 'debug_in_event'`
   - `lineOffset = debuggerCode.split('\n').length + 2`
   - `executeDebugCall(expression, lineOffset)` → Pyodide runs `_prepare_and_trace_debug_call`
   - Loads sub-run timeline into stores
5. User steps through sub-run; `_exec_context` now has mutations from handler

#### Back to Interactive

1. `handleBackToInteractive()`:
   - `goToStep(getMaxTime())` — show last step of sub-run
   - `setDebugCallSuffix(null)` — remove injected function from editor display
   - `appMode = 'interactive'`

#### Edit

1. `handleEdit()`:
   - `setDebugCallSuffix(null)` — **must** clear first to prevent Monaco onChange infinite loop
   - `setAnalyzeStatus('dirty')`
   - `setAppMode('idle')`

---

### The Three Python Files Loaded Into Pyodide

All loaded once at session start by `loadPythonRuntime()` in `pythonExecutor.ts`. Loading order matters.

| File | Purpose |
|------|---------|
| `src/code-builder/services/visualBuilder.py` | `VisualElem` + `_registry`; `Panel`; `DebugCall`; `_handle_click`; `_serialize_visual_builder`; `_serialize_handlers` / `_serialize_handlers_json`; `PopupException` |
| `src/code-builder/services/visualBuilderShapes.py` | `Rect`, `Circle`, `Arrow`, `Label`, `Array`, `Array2D` — concrete shape classes with `_serialize()` |
| `src/debugger-panel/pythonTracer.py` | `sys.settrace` tracing; `_exec_context`; `V()` class; `_visual_code_trace`; `_prepare_and_trace_debug_call`; `MAX_TRACE_STEPS` |

`pythonTracer.py` is loaded last because it patches `VisualElem.__getattribute__` (to auto-eval `V()` objects) and references functions defined in `visualBuilder.py`.

---

### Component Prop Tree

```
App.tsx
  │  appMode, currentStep, stepCount, breakpoints, isAnalyzing, analyzeStatus,
  │  textBoxes, debugCallSuffix, visualBuilderCode, debuggerCode
  │
  ├─ TimelineControls.tsx   (in header)
  │   props: currentStep, stepCount, appMode, breakpoints, onStep, onEnterInteractive
  │
  ├─ ApiReferencePanel.tsx  (floating overlay, rendered directly by App)
  │   props: open, onClose
  │
  ├─ CodeEditorArea.tsx
  │   props: debuggerCode, visualBuilderCode, appMode, readOnly, analyzeStatus,
  │           breakpoints, highlightedLines, currentVariables, debugCallSuffix,
  │           onAnalyze, onEdit, onLoad, onSave, onBreakpointsChange, onBackToInteractive
  │   ├─ DebuggerCodeEditor   (Debugger Code editor)
  │   ├─ VariablePanel        (below Debugger Code editor, hidden in interactive)
  │   ├─ CodeEditor           (Builder Code editor)
  │   └─ OutputTerminal       (bottom)
  │
  └─ GridArea.tsx
      props: darkMode, mouseEnabled, textBoxes, onTextBoxesChange, onDebugCall
      ├─ Grid.tsx
      │   props: cells, panels, zoom, mouseEnabled, onElementClick
      └─ TextBoxesLayer.tsx
```
