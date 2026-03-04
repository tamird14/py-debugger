import { loadPyodide } from './pythonExecutor';
import { type VisualBuilderElementBase } from '../types/visualBuilder';
import VISUAL_BUILDER_PYTHON from './visualBuilder.py?raw';
import VISUAL_BUILDER_SHAPES_PYTHON from './visualBuilderShapes.py?raw';
import { getConstructor } from '../types/elementRegistry';

export interface ExecuteVisualBuilderResult {
  success: boolean;
  elements: VisualBuilderElementBase[];
  error?: string;
}

/**
 * Execute visual builder Python code in Pyodide and return serialized visual elements.
 */
export async function executeVisualBuilderCode(code: string): Promise<ExecuteVisualBuilderResult> {
  try {
    const py = await loadPyodide();

    // Inject class definitions and serialization (base first, then shapes)
    await py.runPythonAsync(VISUAL_BUILDER_PYTHON);
    await py.runPythonAsync(VISUAL_BUILDER_SHAPES_PYTHON);

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

    // Serialize and return
    const resultJson = await py.runPythonAsync('_serialize_visual_builder()');
    const elementsRaw: VisualBuilderElementBase[] = JSON.parse(resultJson);
    
    const wrappedElements = elementsRaw.map(el => {
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
    if (errorMessage.includes('PythonError:')) {
      cleanError = errorMessage.split('PythonError:')[1]?.trim() || errorMessage;
    }
    return {
      success: false,
      elements: [],
      error: cleanError,
    };
  }
}
