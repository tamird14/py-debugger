import inspect
from typing import get_type_hints

def on_click(self, position: tuple[int, int]):
    pass

def has_same_signature(obj, func):
    """
    Check if obj has a callable attribute with the same name
    and same signature (number, names, and annotated types) as func.
    """
    name = func.__name__

    # 1. Check the attribute exists
    if not hasattr(obj, name):
        return False

    attr = getattr(obj, name)
    if not callable(attr):
        return False

    # 2. Compare signatures
    sig1 = inspect.signature(func)
    sig2 = inspect.signature(attr)

    # Quick check: same number of parameters
    if len(sig1.parameters) != len(sig2.parameters):
        return False

    # Compare  annotations
    for ((_, p1), (_, p2)) in zip(sig1.parameters.items(), sig2.parameters.items()):

        # Check annotation if both are annotated
        if p1.annotation != inspect.Parameter.empty and p2.annotation != inspect.Parameter.empty:
            if p1.annotation != p2.annotation:
                return False

    return True

class PopupException(Exception):
    """Exception type used to signal user-facing popup messages."""
    pass


class DebugCall:
    """Return this from an event handler to trigger a debugged sub-run of expression."""
    def __init__(self, expression: str):
        self.expression = expression


class VisualElem:
    _registry = []
    _vis_elem_id = 0

    @staticmethod
    def _clear_registry():
        VisualElem._registry.clear()
        VisualElem._vis_elem_id = 0

    @staticmethod
    def _stop_registry():
        VisualElem._vis_elem_id = -1

    def __init__(self):
        self.position = (0, 0)
        self.visible = True
        self.alpha = 1.0
        self._parent = None
        self._elem_id = VisualElem._vis_elem_id
        if VisualElem._vis_elem_id >= 0:
            VisualElem._vis_elem_id += 1
            VisualElem._registry.append(self)

    def _get_event_handlers(self):
        handlers = []
        if has_same_signature(type(self), on_click):
            handlers.append("on_click")
        return handlers

    def _serialize_base(self):
        """Return base serialization dict with common properties."""
        pos = getattr(self, 'position', (0, 0))
        if not isinstance(pos, (list, tuple)) or len(pos) < 2:
            pos = (0, 0)
        try:
            row, col = int(pos[0]), int(pos[1])
        except (ValueError, TypeError):
            row, col = 0, 0

        alpha = getattr(self, 'alpha', 1.0)
        try:
            alpha = float(alpha)
        except (ValueError, TypeError):
            alpha = 1.0


        return {
            "position": [row, col],
            "visible": getattr(self, 'visible', True),
            "alpha": alpha,
            "_elem_id": self._elem_id,
        }

    def _serialize(self):
        """Override in subclasses to provide type-specific serialization."""
        out = self._serialize_base()
        out["type"] = "rect"
        out["width"] = 1
        out["height"] = 1
        out["color"] = [34, 197, 94]
        return out

    @staticmethod
    def _serialize_color(color, default):
        """Helper to serialize RGB color tuple."""
        if isinstance(color, (list, tuple)) and len(color) >= 3:
            return [int(color[0]), int(color[1]), int(color[2])]
        return list(default)


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

    def _serialize(self):
        out = self._serialize_base()
        out["type"] = "panel"
        out["name"] = getattr(self, 'name', 'Panel')
        out["width"] = int(getattr(self, 'width', 5))
        out["height"] = int(getattr(self, 'height', 5))
        return out


class Label(VisualElem):
    def __init__(self, label="", position=(0, 0), width=1, height=1, font_size=14, color=None, visible=True):
        super().__init__()
        self.label = label
        self.position = position
        self.width = width
        self.height = height
        self.font_size = font_size
        self.color = color
        self.visible = visible

    def _serialize(self):
        out = self._serialize_base()
        out["type"] = "label"
        out["label"] = str(getattr(self, 'label', ''))
        out["width"] = int(getattr(self, 'width', 1))
        out["height"] = int(getattr(self, 'height', 1))
        out["fontSize"] = int(getattr(self, 'font_size', 14))
        c = getattr(self, 'color', None)
        if c is not None:
            out["color"] = self._serialize_color(c, (0, 0, 0))
        return out


class Var(VisualElem):
    def __init__(self, var_name=""):
        super().__init__()
        self.var_name = var_name
        self.position = (0, 0)
        self.display = "name-value"
        self.visible = True

    def _serialize(self):
        out = self._serialize_base()
        out["type"] = "var"
        out["varName"] = str(getattr(self, 'var_name', ''))
        out["display"] = str(getattr(self, 'display', 'name-value'))
        return out


class Array(VisualElem):
    def __init__(self, arr=None, var_name="", position=(0, 0), direction="right", show_index=True, visible=True):
        super().__init__()
        if arr is None:
            arr = []
        self._cells = arr
        self.var_name = var_name
        self.position = position
        self.direction = direction
        self.show_index = show_index
        self.visible = visible
        self.color = None
        self.font_size = None

    @property
    def length(self):
        return len(self._cells)

    def _serialize(self):
        out = self._serialize_base()
        out["type"] = "array"
        out["varName"] = str(getattr(self, 'var_name', ''))
        out["direction"] = str(getattr(self, 'direction', 'right'))
        out["length"] = int(getattr(self, 'length', 5))
        out["showIndex"] = bool(getattr(self, 'show_index', True))
        c = getattr(self, 'color', None)
        if c is not None:
            out["color"] = self._serialize_color(c, (0, 0, 0))
        cells = getattr(self, '_cells', [])
        out["values"] = list(cells) if isinstance(cells, (list, tuple)) else []
        return out


class Array2D(VisualElem):
    """Display a 2D list variable as a matrix on the grid."""
    def __init__(self, var_name="", position=(0, 0), num_rows=3, num_cols=3, show_index=True, visible=True):
        super().__init__()
        self.var_name = var_name
        self.position = position
        self._num_rows = num_rows
        self._num_cols = num_cols
        self._dims_manually_set = False
        self.show_index = show_index
        self.visible = visible
        self.color = None
        self.font_size = None

    def set_dims(self, rows, cols):
        self._num_rows = rows
        self._num_cols = cols
        self._dims_manually_set = True

    def _serialize(self):
        out = self._serialize_base()
        out["type"] = "array2d"
        out["varName"] = str(getattr(self, 'var_name', ''))
        out["numRows"] = int(getattr(self, '_num_rows', 3))
        out["numCols"] = int(getattr(self, '_num_cols', 3))
        out["showIndex"] = bool(getattr(self, 'show_index', True))
        c = getattr(self, 'color', None)
        if c is not None:
            out["color"] = self._serialize_color(c, (0, 0, 0))
        return out


def _serialize_elem(elem, vb_id):
    """Serialize one visual element to a dict for JSON."""
    out = elem._serialize()
    if getattr(elem, '_parent', None) is not None and hasattr(elem._parent, '_vb_id'):
        out["panelId"] = elem._parent._vb_id
    return out

def _handle_click(elem_id, row, col):
    """Call on_click on the element with the given id.

    Returns the debug expression string if the handler returned a DebugCall,
    or None for a plain visual update. The caller is responsible for fetching
    the updated snapshot via _serialize_visual_builder().
    """
    result = None
    for elem in VisualElem._registry:
        if elem._elem_id == elem_id:
            result = elem.on_click((row, col))
            break
    if isinstance(result, DebugCall):
        return result.expression
    return None


def _serialize_handlers():
    """Return event handlers for all elements as a dict (for embedding in larger JSON)."""
    handlers = {}
    for elem in VisualElem._registry:
        elem_handlers = elem._get_event_handlers()
        if elem_handlers:
            handlers[elem._elem_id] = elem_handlers
    return handlers


def _serialize_handlers_json():
    """Return event handlers as a JSON string (for direct TypeScript calls)."""
    import json
    return json.dumps(_serialize_handlers())


def _exec_builder_code(code):
    """Execute visual builder code with stdout capture. Returns captured output string."""
    import io as _io, sys as _sys
    _old_stdout = _sys.stdout
    _sys.stdout = _io.StringIO()
    try:
        exec(code, globals())
        return _sys.stdout.getvalue()
    finally:
        _sys.stdout = _old_stdout


def _handle_click_with_output(elem_id, row, col):
    """Like _handle_click but captures stdout. Returns JSON {debugCall, output}."""
    import io as _io, sys as _sys, json as _json
    _old_stdout = _sys.stdout
    _capture = _io.StringIO()
    _sys.stdout = _capture
    try:
        _result = _handle_click(elem_id, row, col)
    finally:
        _sys.stdout = _old_stdout
    return _json.dumps({'debugCall': _result, 'output': _capture.getvalue()})


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

    panels_first = sorted(VisualElem._registry, key=lambda e: (0 if isinstance(e, Panel) else 1, type(e).__name__))
    result = []
    for elem in panels_first:
        result.append(_serialize_elem(elem, elem._vb_id))

    return json.dumps(result)
