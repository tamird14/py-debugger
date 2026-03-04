class VisualElem:
    _registry = []

    def __init__(self):
        self.position = (0, 0)
        self.visible = True
        self.alpha = 1.0
        self._parent = None
        VisualElem._registry.append(self)

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
    def __init__(self, label=""):
        super().__init__()
        self.label = label
        self.position = (0, 0)
        self.width = 1
        self.height = 1
        self.font_size = 14
        self.color = None
        self.visible = True

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
    def __init__(self, var_name=""):
        super().__init__()
        self.var_name = var_name
        self.position = (0, 0)
        self.direction = "right"
        self._length = 5
        self._length_manually_set = False
        self.visible = True
        self.show_index = True
        self.color = None
        self.font_size = None
        self._cells = [0] * self._length

    @property
    def length(self):
        return self._length

    @length.setter
    def length(self, value):
        self._length = value
        self._length_manually_set = True

    def __setitem__(self, index, value):
        n = len(self._cells)
        if index >= n:
            self._cells.extend([0] * (index - n + 1))
            self._length = len(self._cells)
        self._cells[index] = value

    def __getitem__(self, index):
        if 0 <= index < len(self._cells):
            return self._cells[index]
        return 0

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
    def __init__(self, var_name=""):
        super().__init__()
        self.var_name = var_name
        self.position = (0, 0)
        self._num_rows = 3
        self._num_cols = 3
        self._dims_manually_set = False
        self.visible = True
        self.show_index = True
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
