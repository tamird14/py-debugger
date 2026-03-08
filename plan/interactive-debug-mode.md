# Interactive Debug Mode Design

## Overview

This feature extends the current debugger to support a persistent, stateful interactive mode. After stepping through debugger code, the user can switch to a **mouse interaction mode** where clicking on visual elements triggers handlers defined in the visual builder — and those handlers can, in turn, call back into the debugger code. The key invariant is that **debugger state is never reset**: the Python interpreter context persists across all interactions.

---

## Concepts

### Modes

The application operates in one of three mutually exclusive modes:

| Mode | Description |
|------|-------------|
| **Trace Mode** | Stepping through a pre-recorded trace (current behavior). Timeline controls are active. Mouse is disabled. |
| **Interactive Mode** | Execution finished. Mouse events are active. Timeline controls are hidden. |
| **Debug-in-Event Mode** | An event handler triggered debugger code. Timeline controls are active. Mouse is disabled. |

Switching from Trace Mode → Interactive Mode is triggered explicitly by the user ("Finish Trace"). Switching back is automatic: when an event handler calls debugger code, the app enters Debug-in-Event Mode; when that debug run finishes, it returns to Interactive Mode.

### Persistent Python Context

Today, the Python environment is re-initialized on every "Analyze" run. This feature requires the **Pyodide namespace to persist** after the initial trace so that:

1. Visual element objects remain alive with their current state.
2. Variables from the debugger code's last step remain in scope.
3. Subsequent event-triggered debug runs operate on the same objects and variables.

A single `persistentContext` object in `pythonExecutor.ts` holds the Pyodide globals dictionary after the initial run and is reused for all subsequent calls.

---

## Feature Parts

### Part 1 — Finish Trace & Enter Interactive Mode

**Trigger:** User clicks a "Finish & Interact" button (visible after a successful trace run).

**What happens:**

1. The timeline is left at its current step (the visual panel reflects that moment in the execution).
2. The app transitions to **Interactive Mode**.
3. Timeline controls are hidden; a status bar shows "Interactive Mode".
4. Mouse events are enabled on elements that have `on_click` (or other) handlers.
5. The Python Pyodide context is preserved exactly as it was at the last trace step.

**UI change:** "Finish & Interact" button in the timeline toolbar, enabled only when `analyzeStatus === 'success'`.

**State change:** `appMode` transitions from `'trace'` → `'interactive'`.

---

### Part 2 — Mouse Event Handling in Interactive Mode

**Trigger:** User clicks a visual element that has an `on_click` handler.

**What happens:**

1. `GridArea` fires `handleElementClick(elemId, row, col)` (same as today).
2. `pythonExecutor.executeClickHandler(elemId, row, col)` is called.
3. Python `_handle_click(elemId, row, col)` runs the element's `on_click` method.
4. The handler may mutate element properties (color, position, visibility, etc.).
5. `_serialize_visual_builder()` returns the new snapshot.
6. The frontend deserializes it and calls `loadVisualBuilderObjects(snapshot)`.
7. The visual panel updates immediately. No timeline step is recorded.

This is largely the same as the current click-handler flow — the key difference is that it now works as a standalone interactive loop rather than just during a trace.

**No debug call in handler:** execution is synchronous and fast — the visual panel updates in place. This is the default path.

---

### Part 3 — Event Handlers Calling Debugger Code

An event handler (in the visual builder Python code) can trigger a new debug run of a function defined in the debugger code. For example:

```python
# In the visual builder
class MyButton(Rect):
    def on_click(self, position):
        self.color = (100, 200, 100)
        debug_call("run_step()")   # ← calls into debugger code
```

`debug_call(expr)` is a new Python API provided by the framework. When called inside an event handler, it signals the frontend to enter **Debug-in-Event Mode**.

**What happens:**

1. `on_click` calls `debug_call("run_step()")`.
2. Python immediately returns a special sentinel value to the frontend instead of the normal visual snapshot.

    ```json
    { "mode": "debug_call", "expression": "run_step()" }
    ```

3. The frontend detects the sentinel and transitions to **Debug-in-Event Mode**:
   - Mouse events are disabled.
   - Timeline controls appear.
4. `pythonExecutor.executeDebugCall(expression)` is called.
5. Python runs `_visual_code_trace_expr(expression)` — a variant of the existing tracer that:
   - Evaluates `expression` in the **persistent context** (so it shares all existing variables and objects).
   - Records a new `code_timeline` and `visual_timeline` for just this sub-run.
6. The frontend loads this new timeline, letting the user step through it.
7. When the user finishes stepping (clicks "Back to Interactive"), the app returns to Interactive Mode.
   - The visual panel shows the state at the **last step** of the sub-run.
   - The persistent context now includes any side-effects of the sub-run.

---

### Part 4 — Debug-in-Event Mode Detail

This mode is identical to Trace Mode in terms of UI (timeline controls, variable panel, line highlighting) but has two important differences:

1. **It runs on top of existing persistent state.** Variables from the initial trace are available.
2. **Returning to Interactive Mode does not reset anything.** The Python context after the sub-run becomes the new base state for future interactions.

This enables patterns like:

- Click a button → run a sorting step → step through the sort → see the array rearrange → return to interactive → click again → run another step.

Each click builds on the state left by the previous one.

---

### Part 5 — State Persistence Across Debug Re-entries

Every time the app enters a debug sub-run (via `debug_call`), the result is applied on top of the existing persistent context. This means:

- Variables mutated by previous sub-runs are visible in subsequent ones.
- Visual elements retain their accumulated state (position, color, etc.).
- The sub-run timeline is **ephemeral** — navigating its steps does not overwrite the persistent context; only **finishing** the sub-run (by advancing to its last step) commits the final state.

**Implementation note:** The persistent context is a Pyodide `globals` dict. After each sub-run, the globals dict is updated in-place with the sub-run's final frame locals. Visual element objects (in `VisualElem._registry`) are also live Python objects so they persist automatically.

---

## State Machine

```
         ┌──────────────────┐
         │   Idle / Editing │
         └────────┬─────────┘
                  │ User clicks "Analyze"
                  ▼
         ┌──────────────────┐
         │   Trace Mode     │  ← timeline controls active, mouse disabled
         └────────┬─────────┘
                  │ User clicks "Finish & Interact"
                  ▼
         ┌──────────────────────────────────────────┐
    ┌───►│        Interactive Mode                  │◄───┐
    │    │  mouse events active, timeline hidden    │    │
    │    └──────────────┬───────────────────────────┘    │
    │                   │                                 │
    │     Click (no     │  Click triggers debug_call()   │
    │     debug_call)   │                                 │
    │         │         ▼                                 │
    │         │  ┌──────────────────┐                    │
    │         │  │ Debug-in-Event   │  ── User clicks ───┘
    │         │  │ Mode             │     "Back to Interactive"
    │         │  │ (timeline active,│
    │         │  │  mouse disabled) │
    │         │  └──────────────────┘
    │         │
    └─────────┘  (visual update applied, stay in Interactive Mode)
```

---

## Data Flow

### Initial Trace (unchanged)

```
User → Analyze → executePythonCode()
  → Python: _visual_code_trace(debuggerCode)
  → Returns: { code_timeline, visual_timeline, handlers }
  → Frontend stores timeline, sets appMode = 'trace'
  → persistentContext = pyodide.globals (saved reference)
```

### Entering Interactive Mode

```
User → "Finish & Interact"
  → appMode = 'interactive'
  → mouseEnabled = true
  → Timeline controls hidden
  → Visual panel stays at current snapshot
  → persistentContext unchanged
```

### Click Handler (no debug_call)

```
User click → executeClickHandler(elemId, row, col)
  → Python: _handle_click() using persistentContext
  → Returns: { mode: 'visual_update', snapshot: [...] }
  → Frontend: loadVisualBuilderObjects(snapshot)
  → Visual panel updates in place
```

### Click Handler (with debug_call)

```
User click → executeClickHandler(elemId, row, col)
  → Python: _handle_click() → on_click() → debug_call("expr")
  → Returns: { mode: 'debug_call', expression: "expr" }
  → appMode = 'debug_in_event'
  → mouseEnabled = false
  → executeDebugCall("expr")
    → Python: _visual_code_trace_expr("expr", persistentContext)
    → Returns: { code_timeline, visual_timeline }
    → Frontend loads sub-run timeline
  → User steps through sub-run
  → User clicks "Back to Interactive"
    → persistentContext updated with sub-run final state
    → appMode = 'interactive'
    → Visual panel shows last step of sub-run
```

---

## New APIs

### Python (visualBuilder.py)

```python
def debug_call(expression: str) -> None:
    """
    Call from inside an event handler to trigger a debugged sub-run.
    Raises a special internal exception that the _handle_click wrapper catches.
    The frontend then initiates a full debug trace of `expression`.
    """
```

### Python (pythonTracer.py)

```python
def _visual_code_trace_expr(expression: str, context: dict) -> str:
    """
    Variant of _visual_code_trace that:
    - Evaluates `expression` inside `context` (the persistent globals dict)
    - Traces execution exactly like _visual_code_trace
    - Does NOT reset VisualElem._registry (elements persist)
    - Returns JSON: { code_timeline, visual_timeline }
    """
```

### TypeScript (pythonExecutor.ts)

```typescript
// Stores the live Pyodide globals after initial trace
let persistentContext: PyProxy | null = null;

async function executeClickHandler(
  elemId: number, row: number, col: number
): Promise<ClickHandlerResult>
// Returns either { mode: 'visual_update', snapshot }
// or { mode: 'debug_call', expression }

async function executeDebugCall(
  expression: string
): Promise<{ codeTimeline, visualTimeline }>
// Runs _visual_code_trace_expr in persistentContext
```

### TypeScript (App.tsx)

```typescript
type AppMode = 'idle' | 'trace' | 'interactive' | 'debug_in_event';

// New state:
const [appMode, setAppMode] = useState<AppMode>('idle');

// New handlers:
function handleFinishTrace(): void      // trace → interactive
function handleBackToInteractive(): void // debug_in_event → interactive
function handleDebugCall(expr: string): Promise<void>
```

---

## UI Changes

| Element | Trace Mode | Interactive Mode | Debug-in-Event Mode |
|---------|-----------|-----------------|---------------------|
| Timeline controls | Visible & active | Hidden | Visible & active |
| "Finish & Interact" button | Visible | Hidden | Hidden |
| "Back to Interactive" button | Hidden | Hidden | Visible |
| Mouse events on grid | Disabled | Enabled (clickable elements) | Disabled |
| Mode indicator (status bar) | "Tracing" | "Interactive" | "Debugging event" |
| Variable panel | Shows trace vars | Hidden (or last step vars) | Shows sub-run vars |

---

## Key Constraints & Invariants

1. **No mode overlap.** Only one of { timeline controls, mouse events } is active at a time.
2. **Persistent context is read-only during step navigation.** Navigating backward/forward in a trace timeline only changes what the frontend *displays*; it does not re-execute Python or mutate the persistent context.
3. **Persistent context is updated only when advancing past a debug sub-run.** Clicking "Back to Interactive" after a `debug_call` applies the final state of that sub-run to the persistent context.
4. **Visual element registry persists.** `VisualElem._registry` is never cleared between interactions. New elements can be created inside `on_click` or debug sub-runs, and they will be present in all subsequent snapshots.
5. **Handlers are re-detected after each sub-run.** After a debug sub-run, `_get_handlers()` is called again so that new elements with handlers registered during the sub-run become clickable.

---

## Implementation Commits

Each commit is scoped to one concern and touches as few files as possible. They are ordered so each builds on the previous with no dead code left behind.

---

### Commit 1 — Introduce `AppMode` type and derive `mouseEnabled` from it (`App.tsx`)

**Files:** `src/app/App.tsx`

Replace the free-standing `mouseEnabled: boolean` state with an `appMode: AppMode` state where `type AppMode = 'idle' | 'trace' | 'interactive' | 'debug_in_event'`. Derive `mouseEnabled` as `appMode === 'interactive'` and pass it down exactly as before. After a successful analyze, set `appMode = 'trace'` instead of leaving `mouseEnabled` untouched. The existing "Events / Debugger" toggle becomes a temporary shim (`'interactive'` ↔ `'trace'`) that will be removed in Commit 2. No visible behaviour changes — pure internal refactor.

---

### Commit 2 — Replace manual mouse toggle with "Finish & Interact" button (`CodeEditorArea.tsx`, `App.tsx`)

**Files:** `src/app/CodeEditorArea.tsx`, `src/app/App.tsx`

Remove the `mouseEnabled` / `onMouseEnabledChange` props from `CodeEditorArea`. Add an `appMode` prop and an `onEnterInteractive` callback. Replace the "Events / Debugger" button with a "Finish & Interact" button that is only rendered when `appMode === 'trace'` and `analyzeStatus === 'success'`. Wire `onEnterInteractive` in `App.tsx` to `setAppMode('interactive')`.

---

### Commit 3 — Add `DebugCallException` and `debug_call()` sentinel to `visualBuilder.py`

**Files:** `src/code-builder/services/visualBuilder.py`

Add a `DebugCallException(expression: str)` class. Add a top-level `debug_call(expression: str)` function that raises it. Wrap the body of `_handle_click` in a `try/except DebugCallException` block:
- On a normal return, wrap the existing snapshot in `{ "mode": "visual_update", "snapshot": [...] }`.
- On `DebugCallException`, return `{ "mode": "debug_call", "expression": exc.expression }`.

This is purely a Python change and has no effect until the TypeScript side is updated in Commit 4.

---

### Commit 4 — Update `executeClickHandler` return type to `ClickHandlerResult` (`pythonExecutor.ts`)

**Files:** `src/code-builder/services/pythonExecutor.ts`

Define and export:
```typescript
type ClickHandlerResult =
  | { mode: 'visual_update'; snapshot: VisualBuilderElementBase[] }
  | { mode: 'debug_call'; expression: string }
  | null;
```
Change `executeClickHandler` to return `Promise<ClickHandlerResult>` and parse the new JSON envelope from Python. `GridArea.handleElementClick` currently calls this and always treats the result as a snapshot array — update it to only process `visual_update` results and silently ignore `debug_call` for now (that path is wired in Commit 7).

---

### Commit 5 — Add `_visual_code_trace_expr` to `pythonTracer.py`

**Files:** `src/debugger-panel/pythonTracer.py`

Add a new function `_visual_code_trace_expr(expression: str) -> str` that:
- Does **not** call `VisualElem._clear_registry()`.
- Compiles and runs `expression` with `exec()` inside `exec_globals` extended from the **current Pyodide globals** (so all variables and objects from the initial trace are in scope).
- Runs the same `sys.settrace` tracing loop as `_visual_code_trace`.
- Returns `json.dumps({ 'code_timeline': ..., 'visual_timeline': ... })` — no `handlers` key, since the registry is unchanged.

---

### Commit 6 — Add `executeDebugCall` and save persistent Pyodide globals (`pythonExecutor.ts`)

**Files:** `src/code-builder/services/pythonExecutor.ts`

Add a module-level `let persistentGlobals: any = null`. At the end of a successful `executePythonCode`, assign `persistentGlobals = py.globals`. Clear it when a new analyze starts. Add:
```typescript
async function executeDebugCall(
  expression: string
): Promise<{ codeTimeline: TraceStep[]; visualTimeline: VisualBuilderElementBase[][] } | null>
```
This function calls `_visual_code_trace_expr(expression)` in Pyodide, parses the result, updates `setCodeTimeline` and `hydrateTimelineFromArray`, and returns the parsed timelines so the caller can know the new `stepCount`.

---

### Commit 7 — Propagate `debug_call` result upward from `GridArea.tsx`

**Files:** `src/app/GridArea.tsx`

Add an optional `onDebugCall?: (expression: string) => void` prop to `GridAreaProps`. In `handleElementClick`, after receiving a `ClickHandlerResult`:
- `visual_update` → existing hydration + `loadVisualBuilderObjects` path (unchanged).
- `debug_call` → call `onDebugCall?.(result.expression)` and return early.

Pass `onDebugCall` through from `App.tsx` (stub for now — wired in Commit 8).

---

### Commit 8 — Wire `handleDebugCall` and `handleBackToInteractive` in `App.tsx`

**Files:** `src/app/App.tsx`

Add `handleDebugCall(expression: string)`:
1. Sets `appMode = 'debug_in_event'`.
2. Calls `executeDebugCall(expression)`.
3. On success: calls `setStepCount`, `setCurrentStep(0)`, loads first snapshot of the sub-run timeline.
4. On failure: reverts `appMode = 'interactive'` and logs the error.

Add `handleBackToInteractive()`:
1. Jumps to the last step of the current sub-run timeline (`goToStep(stepCount - 1)`).
2. Sets `appMode = 'interactive'`.

Pass `handleDebugCall` as `onDebugCall` to `GridArea` and `handleBackToInteractive` down to `CodeEditorArea`.

---

### Commit 9 — Add mode status badge and "Back to Interactive" button (`CodeEditorArea.tsx`, `App.tsx`)

**Files:** `src/app/CodeEditorArea.tsx`, `src/app/App.tsx`

Add an `onBackToInteractive` prop to `CodeEditorArea`. In the header action bar, render:
- A small pill badge showing the current mode: `"Tracing"` (indigo), `"Interactive"` (emerald), `"Debugging event"` (amber).
- A `"Back to Interactive"` button, visible only when `appMode === 'debug_in_event'`, that calls `onBackToInteractive`.

Pass `handleBackToInteractive` and `appMode` from `App.tsx`.

---

### Commit 10 — Hide timeline controls and variable panel when in Interactive mode (`App.tsx`, `CodeEditorArea.tsx`)

**Files:** `src/app/App.tsx`, `src/app/CodeEditorArea.tsx`

In `App.tsx`, wrap `<TimelineControls>` in `{appMode !== 'interactive' && ...}` so it disappears in Interactive mode. In `CodeEditorArea.tsx`, hide the `<VariablePanel>` when `appMode === 'interactive'` (the variables shown belong to the trace that has finished, which is misleading). The debugger code editor itself remains visible so the user can see the code that ran.
