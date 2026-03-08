import { loadPyodide } from '../code-builder/services/pythonExecutor';
import type { VisualBuilderElementBase } from '../api/visualBuilder';
import PYTHON_TRACER from './pythonTracer.py?raw';
import { registerPythonFile, getPythonFilesInOrder } from '../code-builder/services/pythonFileRegistry';
import { hydrateTimelineFromArray } from '../timeline/timelineState';
import { setCodeTimeline, type TraceStep } from './codeTimelineState';

registerPythonFile({
  id: 'pythonTracer',
  order: 30,
  source: PYTHON_TRACER,
});

export interface DebuggerExecuteResult {
  success: boolean;
  elements: VisualBuilderElementBase[];
  error?: string;
}

function escapeForExec(code: string): string {
  return code
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n');
}

export async function executeDebuggerCode(
  visualBuilderCode: string,
  debuggerCode: string,
): Promise<DebuggerExecuteResult> {
  try {
    const py = await loadPyodide();

    for (const file of getPythonFilesInOrder()) {
      await py.runPythonAsync(file.source);
    }

    await py.runPythonAsync('VisualElem._registry = []');

    const escapedVB = escapeForExec(visualBuilderCode);
    await py.runPythonAsync(`exec('''${escapedVB.replace(/'''/g, "\\'\\'\\'")}''')`);

    const escapedCode = escapeForExec(debuggerCode);
    const resultJson: string = await py.runPythonAsync(
      `_visual_code_trace('''${escapedCode.replace(/'''/g, "\\'\\'\\'")}''')`,
    );

    const parsed = JSON.parse(resultJson) as {
      code_timeline: TraceStep[];
      visual_timeline: VisualBuilderElementBase[][];
    };

    if (parsed.code_timeline.length !== parsed.visual_timeline.length) {
      return {
        success: false,
        elements: [],
        error: `Timeline length mismatch: code=${parsed.code_timeline.length} visual=${parsed.visual_timeline.length}`,
      };
    }

    setCodeTimeline(parsed.code_timeline);
    const initialElements = hydrateTimelineFromArray(parsed.visual_timeline);

    return { success: true, elements: initialElements };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const clean = msg.includes('PythonError:')
      ? msg.split('PythonError:')[1]?.trim() ?? msg
      : msg;
    return { success: false, elements: [], error: clean };
  }
}
