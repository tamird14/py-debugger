import { loadPyodide } from './pythonExecutor';
import { type VisualBuilderElement } from '../types/visualBuilder';
import VISUAL_BUILDER_PYTHON from './visualBuilder.py?raw';
import { Arrow, Circle, Rect } from '../types/shapes';
import { Array1D, Array2D } from '../types/arrayShapes';
import { Label } from '../types/label';

export interface ExecuteVisualBuilderResult {
  success: boolean;
  elements: VisualBuilderElement[];
  error?: string;
}

/**
 * Execute visual builder Python code in Pyodide and return serialized visual elements.
 */
export async function executeVisualBuilderCode(code: string): Promise<ExecuteVisualBuilderResult> {
  try {
    const py = await loadPyodide();

    // Inject class definitions and serialization
    await py.runPythonAsync(VISUAL_BUILDER_PYTHON);

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
    const elements = JSON.parse(resultJson) as VisualBuilderElement[];
    const elementsRaw: any[] = JSON.parse(resultJson); // each element is a dictionary
    
    const wrappedElements = elementsRaw.map(el => {
      switch(el.type) {
        case 'rect': return new Rect(el);
        case 'circle': return new Circle(el);
        case 'arrow': return new Arrow(el);
        case 'label': return new Label(el);
        case 'array': return new Array1D(el);
        case 'array2d': return new Array2D(el);
        default: return el;
      }
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
