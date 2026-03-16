import type { VisualBuilderElementBase } from '../../api/visualBuilder';
import VB_ENGINE_PYTHON from './_vb_engine.py?raw';
import VISUAL_BUILDER_PYTHON from './visualBuilder.py?raw';
import EVENT_HANDLING_PYTHON from './event_handling.py?raw';
import VISUAL_BUILDER_SHAPES_PYTHON from './visualBuilderShapes.py?raw';
import PYTHON_TRACER from '../../debugger-panel/pythonTracer.py?raw';
import { hydrateTimelineFromArray } from '../../timeline/timelineState';
import { setCodeTimeline, type TraceStep } from '../../debugger-panel/codeTimelineState';
import { setHandlers } from '../../visual-panel/handlersState';
import { setCurrentStepOutputs, setBuilderStepOutputs, setBuilderOutput, appendClickOutput, appendError } from '../../output-terminal/terminalState';

// ---------------------------------------------------------------------------
// Pyodide runtime
// ---------------------------------------------------------------------------

interface PyodideRuntime {
  runPythonAsync: (code: string) => Promise<string>;
  FS: { writeFile: (path: string, content: string) => void };
}

interface WindowWithPyodide extends Window {
  loadPyodide?: (options: { indexURL: string }) => Promise<PyodideRuntime>;
}

let pyodide: PyodideRuntime | null = null;
let isLoading = false;
let loadPromise: Promise<PyodideRuntime> | null = null;
let pythonRuntimeReady = false;

export async function loadPyodide(): Promise<PyodideRuntime> {
  if (pyodide) return pyodide;
  if (isLoading && loadPromise) return loadPromise;

  isLoading = true;
  loadPromise = (async () => {
    const PYODIDE_VERSION = '0.26.4';
    const cdnUrl = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

    if (!(window as WindowWithPyodide).loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${cdnUrl}pyodide.js`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Pyodide script'));
        document.head.appendChild(script);
      });
    }

    pyodide = await (window as WindowWithPyodide).loadPyodide!({ indexURL: cdnUrl });
    isLoading = false;
    return pyodide;
  })();

  return loadPromise;
}

export function isPyodideLoaded(): boolean {
  return pyodide !== null;
}

// ---------------------------------------------------------------------------
// Execution helpers
// ---------------------------------------------------------------------------

// Builder import files: bundled at build time, written to Pyodide VFS so they
// are importable via standard `import` syntax in builder code.
// TODO: future enhancement — allow uploading import files directly in the app;
// at that point they will also be persisted in the JSON save/load format.
const BUILDER_IMPORT_FILES = import.meta.glob(
  '../../builder-imports/*.py',
  { eager: true, as: 'raw' },
) as Record<string, string>;

// Debugger import files: same mechanism as builder imports but for debugger/algorithm code.
// Functions defined in these files are silently skipped by the tracer (which only records
// steps for frames with co_filename in ('<exec>', '<string>')), so they execute normally
// without appearing as trace steps.
// TODO: future enhancement — same online upload as builder imports.
const DEBUGGER_IMPORT_FILES = import.meta.glob(
  '../../debugger-imports/*.py',
  { eager: true, as: 'raw' },
) as Record<string, string>;

const PYTHON_FILES = [
  { source: EVENT_HANDLING_PYTHON },
  { source: VISUAL_BUILDER_PYTHON },
  { source: VISUAL_BUILDER_SHAPES_PYTHON },
  { source: PYTHON_TRACER },
];

// Escapes a string for embedding inside a Python '''...''' triple-quoted string.
// Backslashes and single quotes are escaped first, then any resulting ''' sequences
// are broken up so they cannot accidentally close the triple-quote delimiter.
function escapeForTripleQuote(code: string): string {
  return code
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/'''/g, "\\'\\'\\'");
}

async function loadPythonRuntime(): Promise<PyodideRuntime> {
  const py = await loadPyodide();

  if (!pythonRuntimeReady) {
    // Write builder and debugger import files to Pyodide VFS so they are importable
    py.FS.writeFile('/home/pyodide/_vb_engine.py', VB_ENGINE_PYTHON);

    for (const [path, content] of Object.entries(BUILDER_IMPORT_FILES)) {
      const filename = path.split('/').pop()!;
      py.FS.writeFile(`/home/pyodide/${filename}`, content);
    }
    for (const [path, content] of Object.entries(DEBUGGER_IMPORT_FILES)) {
      const filename = path.split('/').pop()!;
      py.FS.writeFile(`/home/pyodide/${filename}`, content);
    }

    for (const { source } of PYTHON_FILES) {
      await py.runPythonAsync(source);
    }
    pythonRuntimeReady = true;
  }

  return py;
}

function cleanPythonError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('PythonError:')
    ? msg.split('PythonError:')[1]?.trim() ?? msg
    : msg;
}

/**
 * If the traceback contains any frames from user code (`<string>` filename),
 * filter out all non-user frames and keep only those + the exception message.
 * If no `<string>` frames exist (internal/wrapper error), return the full error.
 */
function filterTraceback(error: string): string {
  const lines = error.split('\n');
  const hasUserFrame = lines.some((line) => /^\s+File "<string>"/.test(line));
  if (!hasUserFrame) return error;

  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === 'Traceback (most recent call last):') {
      result.push(line);
      i++;
      continue;
    }
    if (/^ {2}File "/.test(line)) {
      const isUserFrame = line.startsWith('  File "<string>"');
      const frameLines = [line];
      i++;
      // collect source/pointer lines belonging to this frame (indented 4+ spaces)
      while (i < lines.length && lines[i].startsWith('    ')) {
        frameLines.push(lines[i++]);
      }
      if (isUserFrame) result.push(...frameLines);
      continue;
    }
    result.push(line);
    i++;
  }
  while (result.length > 0 && result[result.length - 1] === '') result.pop();
  return result.join('\n');
}

type TraceStep_WithOutput = TraceStep & { output?: string; builder_output?: string };

type TraceResult = {
  code_timeline: TraceStep_WithOutput[];
  visual_timeline: VisualBuilderElementBase[][];
  handlers: Record<string, string[]>;
};

function applyTimeline(parsed: TraceResult): void {
  setHandlers(parsed.handlers ?? {});
  setCodeTimeline(parsed.code_timeline);
  hydrateTimelineFromArray(parsed.visual_timeline);
  setCurrentStepOutputs(parsed.code_timeline.map((s) => s.output ?? ''));
  setBuilderStepOutputs(parsed.code_timeline.map((s) => s.builder_output ?? ''));
}

// ---------------------------------------------------------------------------
// Python executors
// ---------------------------------------------------------------------------


async function initializeBuilderCode(py: PyodideRuntime, visualBuilderCode: string): Promise<void> {
  await py.runPythonAsync('_engine.VisualElem._clear_registry()');
  const escapedVB = escapeForTripleQuote(visualBuilderCode);
  const builderOutput: string = await py.runPythonAsync(`_exec_builder_code('''${escapedVB}''')`);
  setBuilderOutput(builderOutput);
}

function validateTimeline(parsed: TraceResult): string | null {
  if (parsed.code_timeline.length !== parsed.visual_timeline.length) {
    return `Timeline length mismatch: code=${parsed.code_timeline.length} visual=${parsed.visual_timeline.length}`;
  }
  return null;
}

export interface DebuggerExecuteResult {
  success: boolean;
  error?: string;
}

export async function executePythonCode(
  visualBuilderCode: string,
  debuggerCode: string,
): Promise<DebuggerExecuteResult> {
  try {
    const py = await loadPythonRuntime();
    await initializeBuilderCode(py, visualBuilderCode);

    const escapedCode = escapeForTripleQuote(debuggerCode);
    const resultJson: string = await py.runPythonAsync(
      `_visual_code_trace('''${escapedCode}''')`,
    );

    const parsed = JSON.parse(resultJson) as TraceResult;
    const mismatch = validateTimeline(parsed);
    if (mismatch) return { success: false, error: mismatch };

    applyTimeline(parsed);
    return { success: true };
  } catch (error) {
    console.error('Execution error:', error);
    const msg = filterTraceback(cleanPythonError(error));
    appendError(msg);
    return { success: false, error: msg };
  }
}

export async function executeDebugCall(expression: string): Promise<DebuggerExecuteResult> {
  if (!pyodide) {
    console.error('executeDebugCall called before Pyodide was initialized');
    return { success: false, error: 'Something went wrong. Try refreshing the page.' };
  }
  try {
    const escapedExpr = escapeForTripleQuote(expression);
    const resultJson: string = await pyodide.runPythonAsync(
      `_prepare_and_trace_debug_call('''${escapedExpr}''')`,
    );

    const parsed = JSON.parse(resultJson) as TraceResult;
    const mismatch = validateTimeline(parsed);
    if (mismatch) return { success: false, error: mismatch };

    applyTimeline(parsed);
    return { success: true };
  } catch (error) {
    console.error('Debug call error:', error);
    const msg = filterTraceback(cleanPythonError(error));
    appendError(msg);
    return { success: false, error: msg };
  }
}

export type ClickHandlerResult = {
  snapshot: VisualBuilderElementBase[];
  debugCall?: string;
  error?: string;
} | null;

export type EventName = 'on_click' | 'on_drag';
export type DragType = 'start' | 'mid' | 'end';

export async function executeEventHandler(
  eventName: EventName,
  elemId: number,
  row: number,
  col: number,
  dragType?: DragType,
): Promise<ClickHandlerResult> {
  if (!pyodide) return null;
  try {
    const extraArgs = dragType !== undefined ? `, '${dragType}'` : '';
    const eventResultJson: string = await pyodide.runPythonAsync(
      `_handle_event_with_output('${eventName}', ${elemId}, ${row}, ${col}${extraArgs})`,
    );
    const eventResult = JSON.parse(eventResultJson) as {
      debugCall: string | null;
      runCall: string | null;
      output: string;
    };
    appendClickOutput(eventResult.output);
    if (eventResult.runCall) {
      const escaped = escapeForTripleQuote(eventResult.runCall);
      const runResultJson: string = await pyodide.runPythonAsync(
        `_execute_run_call('''${escaped}''')`,
      );
      const runResult = JSON.parse(runResultJson) as {
        snapshot: VisualBuilderElementBase[];
        handlers: Record<string, string[]>;
        output: string;
      };
      appendClickOutput(runResult.output);
      setHandlers(runResult.handlers ?? {});
      return { snapshot: runResult.snapshot };
    }
    const snapshotJson: string = await pyodide.runPythonAsync(`_serialize_visual_builder()`);
    const snapshot = JSON.parse(snapshotJson) as VisualBuilderElementBase[];
    const handlersJson: string = await pyodide.runPythonAsync(`_serialize_handlers_json()`);
    setHandlers(JSON.parse(handlersJson));
    const debugCall = eventResult.debugCall;
    return debugCall ? { snapshot, debugCall } : { snapshot };
  } catch (error) {
    console.error('Event handler error:', error);
    const msg = filterTraceback(cleanPythonError(error));
    appendError(msg);
    return { snapshot: [], error: msg };
  }
}

/** Thin wrapper kept for call-site compatibility. */
export function executeClickHandler(elemId: number, row: number, col: number): Promise<ClickHandlerResult> {
  return executeEventHandler('on_click', elemId, row, col);
}

/** Reset all mutable Python state (exec context + visual registry). Called when entering edit mode. */
export async function resetPythonState(): Promise<void> {
  if (!pyodide) return;
  await pyodide.runPythonAsync('_reset_exec_state()');
}
