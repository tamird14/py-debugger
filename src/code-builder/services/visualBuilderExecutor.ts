import { loadPyodide } from './pythonExecutor';
import { type VisualBuilderElementBase } from '../../api/visualBuilder';
import VISUAL_BUILDER_PYTHON from './visualBuilder.py?raw';
import VISUAL_BUILDER_SHAPES_PYTHON from './visualBuilderShapes.py?raw';
import TIMELINE_PYTHON from '../../timeline/timeline.py?raw';
import { getConstructor } from '../../visual-panel/types/elementRegistry';
import { getPythonFilesInOrder, registerPythonFile } from './pythonFileRegistry';
import { clearTimeline, hydrateTimelineFromJson } from '../../timeline/timelineState';

registerPythonFile({
  id: 'visualBuilder',
  order: 0,
  source: VISUAL_BUILDER_PYTHON,
});

registerPythonFile({
  id: 'visualBuilderShapes',
  order: 10,
  source: VISUAL_BUILDER_SHAPES_PYTHON,
});

registerPythonFile({
  id: 'timeline',
  order: 20,
  source: TIMELINE_PYTHON,
});

export type VisualBuilderExecutionMode = 'simple' | 'discrete';

export interface ExecuteVisualBuilderResult {
  success: boolean;
  elements: VisualBuilderElementBase[];
  error?: string;
}

/**
 * Execute visual builder Python code in Pyodide and return serialized visual elements.
 *
 * In 'simple' mode, this runs _serialize_visual_builder() once.
 * In 'discrete' mode, this runs _create_typescript_timeline(T) with default T=100
 * and hydrates the timeline, returning the elements for t=0.
 */
export async function executeVisualBuilderCode(
  code: string,
  mode: VisualBuilderExecutionMode = 'simple',
): Promise<ExecuteVisualBuilderResult> {
  try {
    const py = await loadPyodide();

    // Inject registered Python files (base first, then shapes, then any extensions)
    const pythonFiles = getPythonFilesInOrder();
    for (const file of pythonFiles) {
      await py.runPythonAsync(file.source);
    }

    // Reset registry so each run starts fresh
    await py.runPythonAsync('VisualElem._registry = []');

    // Escape user code for Python string
    const escapedCode = code
      .replace(/\\/g, '\\\\')
      .replace(/"""/g, '\\"\\"\\"')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n');

    // Run user's visual builder code
    await py.runPythonAsync(`
exec('''${escapedCode.replace(/'''/g, "\\'\\'\\'")}''')
`);

    if (mode === 'discrete') {
      const timelineJson = await py.runPythonAsync('_create_typescript_timeline(100)');
      const initialElements = hydrateTimelineFromJson(timelineJson);
      return { success: true, elements: initialElements };
    }

    clearTimeline();

    // Serialize and return for simple mode
    const resultJson = await py.runPythonAsync('_serialize_visual_builder()');
    const elementsRaw: VisualBuilderElementBase[] = JSON.parse(resultJson);

    const wrappedElements = elementsRaw.map((el) => {
      const entry = getConstructor(el.type);
      if (entry) {
        return new entry(el);
      }
      return el;
    });

    return { success: true, elements: wrappedElements };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    let cleanError = errorMessage;

    if (errorMessage.includes('PopupException')) {
      const parts = errorMessage.split('PopupException:');
      const popupMsg = parts[1]?.trim() || 'An error occurred';
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(popupMsg);
      }
      cleanError = popupMsg;
    } else if (errorMessage.includes('PythonError:')) {
      cleanError = errorMessage.split('PythonError:')[1]?.trim() || errorMessage;
    }

    return {
      success: false,
      elements: [],
      error: cleanError,
    };
  }
}
