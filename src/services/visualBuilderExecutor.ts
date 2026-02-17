import { loadPyodide } from './pythonExecutor';
import type { VisualBuilderElement } from '../types/visualBuilder';

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
    panels_first = sorted(VisualElem._registry, key=lambda e: 0 if isinstance(e, Panel) else 1)
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
