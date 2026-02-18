import math

_V_GLOBALS = {
    "__builtins__": {},
    "abs": abs, "min": min, "max": max, "sum": sum,
    "round": round, "len": len, "int": int, "float": float,
    "sqrt": math.sqrt, "floor": math.floor, "ceil": math.ceil,
    "log": math.log, "pow": pow,
    "pi": math.pi,
}

_vb_user_update = None


class V:
    """Bind a property to a Python expression evaluated each step.
    The expression string is eval'd with the current step's variables in scope,
    plus math helpers (sqrt, floor, ceil, log, pow, abs, min, max, sum, round, len, pi).
    """
    def __init__(self, expr):
        self.expr = expr

    def resolve(self, params):
        try:
            return eval(self.expr, _V_GLOBALS, params)
        except Exception:
            return None


class VisualElem:
    _registry = []

    def __init__(self):
        object.__setattr__(self, '_bindings', {})
        self.position = (0, 0)
        self.visible = True
        self.alpha = 1.0
        self._parent = None
        VisualElem._registry.append(self)

    def __setattr__(self, name, value):
        if isinstance(value, V):
            self._bindings[name] = value
        else:
            object.__setattr__(self, name, value)
            if hasattr(self, '_bindings') and name in self._bindings:
                del self._bindings[name]

    def update(self, scope, params):
        """Called each execution step. Resolves V() bindings automatically.
        scope: list of (func_name, line_number) tuples for the call stack
        params: dict of variable_name -> value at this step
        """
        for attr, binding in self._bindings.items():
            resolved = binding.resolve(params)
            if resolved is not None:
                object.__setattr__(self, attr, resolved)


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
        self.color = (23, 23, 23)
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


class Circle(VisualElem):
    def __init__(self, pos=(0, 0)):
        super().__init__()
        self.position = pos
        self.width = 1
        self.height = 1
        self.color = (59, 130, 246)
        self.visible = True


class Arrow(VisualElem):
    def __init__(self, pos=(0, 0)):
        super().__init__()
        self.position = pos
        self.width = 1
        self.height = 1
        self.color = (16, 185, 129)
        self.orientation = "up"
        self.rotation = 0
        self.visible = True


def _serialize_elem(elem, vb_id):
    """Serialize one visual element to a dict for JSON."""
    pos = getattr(elem, 'position', (0, 0))
    if not isinstance(pos, (list, tuple)) or len(pos) < 2:
        pos = (0, 0)
    try:
        row, col = int(pos[0]), int(pos[1])
    except (ValueError, TypeError):
        row, col = 0, 0

    alpha = getattr(elem, 'alpha', 1.0)
    try:
        alpha = float(alpha)
    except (ValueError, TypeError):
        alpha = 1.0

    out = {
        "type": None,
        "position": [row, col],
        "visible": getattr(elem, 'visible', True),
        "alpha": alpha,
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
    elif isinstance(elem, Circle):
        out["type"] = "circle"
        out["width"] = int(getattr(elem, 'width', 1))
        out["height"] = int(getattr(elem, 'height', 1))
        c = getattr(elem, 'color', (59, 130, 246))
        if isinstance(c, (list, tuple)) and len(c) >= 3:
            out["color"] = [int(c[0]), int(c[1]), int(c[2])]
        else:
            out["color"] = [59, 130, 246]
    elif isinstance(elem, Arrow):
        out["type"] = "arrow"
        out["width"] = int(getattr(elem, 'width', 1))
        out["height"] = int(getattr(elem, 'height', 1))
        c = getattr(elem, 'color', (16, 185, 129))
        if isinstance(c, (list, tuple)) and len(c) >= 3:
            out["color"] = [int(c[0]), int(c[1]), int(c[2])]
        else:
            out["color"] = [16, 185, 129]
        out["orientation"] = str(getattr(elem, 'orientation', 'up'))
        out["rotation"] = int(getattr(elem, 'rotation', 0))
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

    panels_first = sorted(VisualElem._registry, key=lambda e: (0 if isinstance(e, Panel) else 1, type(e).__name__))
    result = []
    for elem in panels_first:
        result.append(_serialize_elem(elem, elem._vb_id))

    return json.dumps(result)
