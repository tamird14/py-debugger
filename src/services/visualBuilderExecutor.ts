import { loadPyodide } from './pythonExecutor';
import type { ExecutionScope } from './pythonExecutor';
import type { VariableDictionary } from '../types/grid';
import type { VisualBuilderElement } from '../types/visualBuilder';

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

const VISUAL_BUILDER_PYTHON = `
class VisualElem:
    _registry = []
    
    def __init__(self):
        self.position = (0, 0)
        self.visible = True
        self._parent = None
        VisualElem._registry.append(self)
    
    def update(self, scope, params):
        """Called each execution step.
        scope: list of (func_name, line_number) tuples for the call stack
        params: dict of variable_name -> value at this step
        """
        pass


class Panel(VisualElem):
    def __init__(self, name="Panel"):
        super().__init__()
        self.name = name
        self.width = 5
        self.height = 5
        self._children = []
    
    def add(self, elem):
        if elem not in self._children:
            self._children.append(elem)
            elem._parent = self
    
    def remove(self, elem):
        if elem in self._children:
            self._children.remove(elem)
            elem._parent = None


class Rect(VisualElem):
    def __init__(self, pos=(0, 0)):
        super().__init__()
        self.position = pos
        self.width = 1
        self.height = 1
        self.color = (34, 197, 94)
        self.visible = True


class Label(VisualElem):
    def __init__(self, label=""):
        super().__init__()
        self.label = label
        self.position = (0, 0)
        self.width = 1
        self.height = 1
        self.font_size = 14
        self.color = (255, 255, 255)
        self.visible = True


class Var(VisualElem):
    def __init__(self, var_name=""):
        super().__init__()
        self.var_name = var_name
        self.position = (0, 0)
        self.display = "name-value"
        self.visible = True


class Array(VisualElem):
    def __init__(self, var_name=""):
        super().__init__()
        self.var_name = var_name
        self.position = (0, 0)
        self.direction = "right"
        self.length = 5
        self.visible = True
        self._cells = [0] * self.length

    def __setitem__(self, index, value):
        n = len(self._cells)
        if index >= n:
            self._cells.extend([0] * (index - n + 1))
            self.length = len(self._cells)
        self._cells[index] = value

    def __getitem__(self, index):
        if 0 <= index < len(self._cells):
            return self._cells[index]
        return 0


def _serialize_elem(elem, vb_id):
    """Serialize one visual element to a dict for JSON."""
    pos = getattr(elem, 'position', (0, 0))
    if not isinstance(pos, (list, tuple)) or len(pos) < 2:
        pos = (0, 0)
    row, col = int(pos[0]), int(pos[1])
    
    out = {
        "type": None,
        "position": [row, col],
        "visible": getattr(elem, 'visible', True),
    }
    
    if isinstance(elem, Panel):
        out["type"] = "panel"
        out["name"] = getattr(elem, 'name', 'Panel')
        out["width"] = int(getattr(elem, 'width', 5))
        out["height"] = int(getattr(elem, 'height', 5))
    elif isinstance(elem, Rect):
        out["type"] = "rect"
        out["width"] = int(getattr(elem, 'width', 1))
        out["height"] = int(getattr(elem, 'height', 1))
        c = getattr(elem, 'color', (34, 197, 94))
        if isinstance(c, (list, tuple)) and len(c) >= 3:
            out["color"] = [int(c[0]), int(c[1]), int(c[2])]
        else:
            out["color"] = [34, 197, 94]
    elif isinstance(elem, Label):
        out["type"] = "label"
        out["label"] = str(getattr(elem, 'label', ''))
        out["width"] = int(getattr(elem, 'width', 1))
        out["height"] = int(getattr(elem, 'height', 1))
        out["fontSize"] = int(getattr(elem, 'font_size', 14))
        c = getattr(elem, 'color', (255, 255, 255))
        if isinstance(c, (list, tuple)) and len(c) >= 3:
            out["color"] = [int(c[0]), int(c[1]), int(c[2])]
        else:
            out["color"] = [255, 255, 255]
    elif isinstance(elem, Var):
        out["type"] = "var"
        out["varName"] = str(getattr(elem, 'var_name', ''))
        out["display"] = str(getattr(elem, 'display', 'name-value'))
    elif isinstance(elem, Array):
        out["type"] = "array"
        out["varName"] = str(getattr(elem, 'var_name', ''))
        out["direction"] = str(getattr(elem, 'direction', 'right'))
        out["length"] = int(getattr(elem, 'length', 5))
        cells = getattr(elem, '_cells', [])
        out["values"] = list(cells) if isinstance(cells, (list, tuple)) else []
    else:
        out["type"] = "rect"
        out["width"] = 1
        out["height"] = 1
        out["color"] = [34, 197, 94]
    
    if getattr(elem, '_parent', None) is not None and hasattr(elem._parent, '_vb_id'):
        out["panelId"] = elem._parent._vb_id
    
    return out


def _serialize_visual_builder():
    """Walk VisualElem._registry and return list of serialized elements."""
    import json
    id_counter = [0]
    
    def next_id(prefix):
        id_counter[0] += 1
        return prefix + "-" + str(id_counter[0])
    
    for i, elem in enumerate(VisualElem._registry):
        if isinstance(elem, Panel):
            elem._vb_id = next_id("panel")
        else:
            elem._vb_id = next_id("elem")
    
    # Output panels first so loaders can resolve panelId before processing children
    panels_first = sorted(VisualElem._registry, key=lambda e: (0 if isinstance(e, Panel) else 1, type(e).__name__))
    result = []
    for elem in panels_first:
        result.append(_serialize_elem(elem, elem._vb_id))
    
    return json.dumps(result)
`;

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
