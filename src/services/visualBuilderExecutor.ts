import { loadPyodide } from './pythonExecutor';
import type { ExecutionScope } from './pythonExecutor';
import type { VariableDictionary } from '../types/grid';
import type { VisualBuilderElement } from '../types/visualBuilder';
import VISUAL_BUILDER_PYTHON from './visualBuilder.py?raw';

/**
 * Convert VariableDictionary (typed vars) to a plain dict for Python update(scope, params).
 * Python expects params to be name -> value (number, list of numbers, string, or list of strings).
 */
function variableDictionaryToParams(vars: VariableDictionary): Record<string, number | number[] | string | string[]> {
  const out: Record<string, number | number[] | string | string[]> = {};
  for (const [name, v] of Object.entries(vars)) {
    if (v.type === 'int' || v.type === 'float') out[name] = v.value;
    else if (v.type === 'str') out[name] = v.value;
    else if (v.type === 'arr[int]') out[name] = v.value;
    else if (v.type === 'arr[str]') out[name] = v.value;
  }
  return out;
}

function escapeForPythonString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '').replace(/\n/g, '\\n');
}


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

    return { success: true, elements };
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

/**
 * Call update(scope, params) on each visual element in the Pyodide registry, then
 * re-serialize and return the updated elements. Use when the user has already run
 * Visual Builder Analyze; call this on each step change to apply reactive updates.
 * Returns [] if the registry is empty or not initialized (e.g. no prior Analyze).
 */
export async function runVisualBuilderUpdate(
  scope: ExecutionScope,
  params: VariableDictionary
): Promise<VisualBuilderElement[]> {
  try {
    const py = await loadPyodide();

    const paramsPlain = variableDictionaryToParams(params);
    const scopeJson = JSON.stringify(scope);
    const paramsJson = JSON.stringify(paramsPlain);
    const scopeEsc = escapeForPythonString(scopeJson);
    const paramsEsc = escapeForPythonString(paramsJson);

    const code = `
import json
scope = json.loads('''${scopeEsc}''')
params = json.loads('''${paramsEsc}''')
for e in VisualElem._registry:
    e.update(scope, params)
_serialize_visual_builder()
`;
    const resultJson = await py.runPythonAsync(code);
    if (resultJson == null || resultJson === undefined) return [];
    const elements = JSON.parse(String(resultJson)) as VisualBuilderElement[];
    return elements;
  } catch {
    return [];
  }
}
