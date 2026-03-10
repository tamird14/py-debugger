import type { VisualBuilderElementBase } from '../../api/visualBuilder';
import VISUAL_BUILDER_PYTHON from './visualBuilder.py?raw';
import VISUAL_BUILDER_SHAPES_PYTHON from './visualBuilderShapes.py?raw';
import PYTHON_TRACER from '../../debugger-panel/pythonTracer.py?raw';
import { hydrateTimelineFromArray } from '../../timeline/timelineState';
import { setCodeTimeline, type TraceStep } from '../../debugger-panel/codeTimelineState';
import { setHandlers } from '../../visual-panel/handlersState';
import { setCurrentStepOutputs, setBuilderStepOutputs, setBuilderOutput, appendClickOutput } from '../../output-terminal/terminalState';

// ---------------------------------------------------------------------------
// Pyodide runtime
// ---------------------------------------------------------------------------

let pyodide: any = null;
let isLoading = false;
let loadPromise: Promise<any> | null = null;

export async function loadPyodide(): Promise<any> {
  if (pyodide) return pyodide;
  if (isLoading && loadPromise) return loadPromise;

  isLoading = true;
  loadPromise = (async () => {
    const PYODIDE_VERSION = '0.26.4';
    const cdnUrl = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

    if (!(window as any).loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${cdnUrl}pyodide.js`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Pyodide script'));
        document.head.appendChild(script);
      });
    }

    pyodide = await (window as any).loadPyodide({ indexURL: cdnUrl });
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

const PYTHON_FILES = [
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

async function loadPythonRuntime(): Promise<any> {
  const py = await loadPyodide();
  for (const { source } of PYTHON_FILES) {
    await py.runPythonAsync(source);
  }
  return py;
}

// ---------------------------------------------------------------------------
// Python executor
// ---------------------------------------------------------------------------

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

    await py.runPythonAsync('VisualElem._clear_registry()');

    const escapedVB = escapeForTripleQuote(visualBuilderCode);
    const builderOutput: string = await py.runPythonAsync(`_exec_builder_code('''${escapedVB}''')`);
    setBuilderOutput(builderOutput);

    const escapedCode = escapeForTripleQuote(debuggerCode);
    const resultJson: string = await py.runPythonAsync(
      `_visual_code_trace('''${escapedCode}''')`,
    );

    const parsed = JSON.parse(resultJson) as {
      code_timeline: TraceStep[];
      visual_timeline: VisualBuilderElementBase[][];
      handlers: Record<string, string[]>;
    };

    if (parsed.code_timeline.length !== parsed.visual_timeline.length) {
      return {
        success: false,
        error: `Timeline length mismatch: code=${parsed.code_timeline.length} visual=${parsed.visual_timeline.length}`,
      };
    }

    setHandlers(parsed.handlers ?? {});
    setCodeTimeline(parsed.code_timeline);
    hydrateTimelineFromArray(parsed.visual_timeline);
    setCurrentStepOutputs(parsed.code_timeline.map((s) => (s as any).output ?? ''));
    setBuilderStepOutputs(parsed.code_timeline.map((s) => (s as any).builder_output ?? ''));

    return { success: true };
  } catch (error) {
    console.error('Execution error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    const clean = msg.includes('PythonError:')
      ? msg.split('PythonError:')[1]?.trim() ?? msg
      : msg;
    return { success: false, error: clean };
  }
}

export type ClickHandlerResult = {
  snapshot: VisualBuilderElementBase[];
  debugCall?: string;
} | null;

export async function executeClickHandler(
  elemId: number,
  row: number,
  col: number,
): Promise<ClickHandlerResult> {
  if (!pyodide) return null;
  try {
    const clickResultJson: string = await pyodide.runPythonAsync(
      `_handle_click_with_output(${elemId}, ${row}, ${col})`,
    );
    const clickResult = JSON.parse(clickResultJson) as { debugCall: string | null; output: string };
    appendClickOutput(clickResult.output);
    const debugCall = clickResult.debugCall;
    const snapshotJson: string = await pyodide.runPythonAsync(`_serialize_visual_builder()`);
    const snapshot = JSON.parse(snapshotJson) as VisualBuilderElementBase[];
    const handlersJson: string = await pyodide.runPythonAsync(`_serialize_handlers_json()`);
    setHandlers(JSON.parse(handlersJson));
    return debugCall ? { snapshot, debugCall } : { snapshot };
  } catch (error) {
    console.error('Click handler error:', error);
    return null;
  }
}

export type DebugCallResult = {
  stepCount: number;
  error?: string;
} | null;

export async function executeDebugCall(expression: string, lineOffset: number): Promise<DebugCallResult> {
  if (!pyodide) return null;
  try {
    const escapedExpr = escapeForTripleQuote(expression);
    const resultJson: string = await pyodide.runPythonAsync(
      `_prepare_and_trace_debug_call('''${escapedExpr}''', ${lineOffset})`,
    );
    const parsed = JSON.parse(resultJson) as {
      code_timeline: TraceStep[];
      visual_timeline: VisualBuilderElementBase[][];
      handlers: Record<string, string[]>;
    };

    setHandlers(parsed.handlers ?? {});
    setCodeTimeline(parsed.code_timeline);
    hydrateTimelineFromArray(parsed.visual_timeline);
    setCurrentStepOutputs(parsed.code_timeline.map((s) => (s as any).output ?? ''));
    setBuilderStepOutputs(parsed.code_timeline.map((s) => (s as any).builder_output ?? ''));

    return { stepCount: parsed.code_timeline.length };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const clean = msg.includes('PythonError:')
      ? msg.split('PythonError:')[1]?.trim() ?? msg
      : msg;
    return { stepCount: 0, error: clean };
  }
}
