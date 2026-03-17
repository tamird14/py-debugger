import _vb_engine as _engine


# ── Visual Elements ──────────────────────────────────────────────────────────

PANEL_SCHEMA = {
    'objName': 'Panel',
    'type': 'panel',
    'docstring': 'A container panel that positions child elements relative to its top-left corner.',
    'properties': [
        {'name': 'name',        'type': 'str',  'default': 'Panel', 'ser': 'str'},
        {'name': 'width',       'type': 'int',  'default': 5,       'ser': 'int'},
        {'name': 'height',      'type': 'int',  'default': 5,       'ser': 'int'},
        {'name': 'show_border', 'type': 'bool', 'default': False,   'ser': 'bool'},
    ],
}


class Panel(_engine.VisualElem):
    _schema = PANEL_SCHEMA

    def __init__(self, name="Panel"):
        super().__init__()
        self.name = name
        self.width = 5
        self.height = 5
        self.show_border = False
        self._children = []

    def add(self, *elems):
        for elem in elems:
            if elem._parent is not None:
                elem._parent.remove(elem)

            if elem not in self._children:
                self._children.append(elem)
                elem._parent = self

    def remove(self, elem):
        if elem in self._children:
            self._children.remove(elem)
            elem._parent = None

    def _serialize(self):
        return self._serialize_from_fields(PANEL_SCHEMA)


RECT_SCHEMA = {
    'objName': 'Rect',
    'type': 'rect',
    'docstring': 'A rectangle shape on the grid.',
    'properties': [
        {'name': 'position', 'type': 'tuple[int,int]',     'default': (0, 0),        'ser': 'base'},
        {'name': 'width',    'type': 'int',                'default': 1,             'ser': 'int'},
        {'name': 'height',   'type': 'int',                'default': 1,             'ser': 'int'},
        {'name': 'color',    'type': 'tuple[int,int,int]', 'default': (34, 197, 94), 'ser': 'color'},
        {'name': 'visible',  'type': 'bool',               'default': True,          'ser': 'base'},
        {'name': 'z',        'type': 'int',                'default': 0,             'ser': 'base'},
    ],
}

Rect = _engine.make_shape_class(RECT_SCHEMA)


CIRCLE_SCHEMA = {
    'objName': 'Circle',
    'type': 'circle',
    'docstring': 'A circle (or ellipse) shape on the grid.',
    'properties': [
        {'name': 'position', 'type': 'tuple[int,int]',     'default': (0, 0),         'ser': 'base'},
        {'name': 'width',    'type': 'int',                'default': 1,              'ser': 'int'},
        {'name': 'height',   'type': 'int',                'default': 1,              'ser': 'int'},
        {'name': 'color',    'type': 'tuple[int,int,int]', 'default': (59, 130, 246), 'ser': 'color'},
        {'name': 'visible',  'type': 'bool',               'default': True,           'ser': 'base'},
        {'name': 'z',        'type': 'int',                'default': 0,              'ser': 'base'},
    ],
}

Circle = _engine.make_shape_class(CIRCLE_SCHEMA)


ARROW_SCHEMA = {
    'objName': 'Arrow',
    'type': 'arrow',
    'docstring': 'An arrow shape on the grid. Points in the given orientation and can be rotated.',
    'properties': [
        {'name': 'position',    'type': 'tuple[int,int]',     'default': (0, 0),          'ser': 'base'},
        {'name': 'width',       'type': 'int',                'default': 1,               'ser': 'int'},
        {'name': 'height',      'type': 'int',                'default': 1,               'ser': 'int'},
        {'name': 'color',       'type': 'tuple[int,int,int]', 'default': (16, 185, 129),  'ser': 'color'},
        {'name': 'orientation', 'type': 'str',                'default': 'up',            'ser': 'str'},
        {'name': 'rotation',    'type': 'int',                'default': 0,               'ser': 'int'},
        {'name': 'visible',     'type': 'bool',               'default': True,            'ser': 'base'},
        {'name': 'z',           'type': 'int',                'default': 0,               'ser': 'base'},
    ],
}

Arrow = _engine.make_shape_class(ARROW_SCHEMA)


class Line(_engine.VisualElem):
    def __init__(self, start=(0, 0), end=(1, 1), color=(239, 68, 68),
                 stroke_weight=2, start_offset=(0.5, 0.5), end_offset=(0.5, 0.5),
                 start_cap='none', end_cap='arrow', z=0):
        super().__init__()
        self.start = start
        self.end = end
        self.color = color
        self.stroke_weight = stroke_weight
        self.start_offset = start_offset
        self.end_offset = end_offset
        self.start_cap = start_cap
        self.end_cap = end_cap
        self.z = z

    @property
    def position(self):
        return self.start

    @position.setter
    def position(self, value):
        self.start = value

    def _serialize(self):
        out = self._serialize_base()
        out["type"] = "line"
        out["start"] = list(self.start)
        out["end"] = list(self.end)
        out["color"] = self._serialize_color(self.color, (239, 68, 68))
        out["strokeWeight"] = max(0.5, float(self.stroke_weight))
        out["startOffset"] = [float(x) for x in self.start_offset]
        out["endOffset"] = [float(x) for x in self.end_offset]
        out["startCap"] = self.start_cap if self.start_cap in ('none', 'arrow') else 'none'
        out["endCap"] = self.end_cap if self.end_cap in ('none', 'arrow') else 'arrow'
        return out


LABEL_SCHEMA = {
    'objName': 'Label',
    'type': 'label',
    'docstring': 'Text label.',
    'properties': [
        {'name': 'label',     'type': 'str',             'default': '',   'ser': 'str'},
        {'name': 'position',  'type': 'tuple[int,int]',  'default': (0, 0), 'ser': 'base'},
        {'name': 'width',     'type': 'int',             'default': 1,    'ser': 'int'},
        {'name': 'height',    'type': 'int',             'default': 1,    'ser': 'int'},
        {'name': 'font_size', 'type': 'int',             'default': 14,   'ser': 'int', 'key': 'fontSize'},
        {'name': 'color',     'type': 'tuple[int,int,int]|None', 'default': None, 'ser': 'color?'},  # None → key omitted → TS falls back to CSS default text color
        {'name': 'visible',   'type': 'bool',            'default': True, 'ser': 'base'},
        {'name': 'z',         'type': 'int',             'default': 0,    'ser': 'base'},
    ],
}

Label = _engine.make_shape_class(LABEL_SCHEMA)


ARRAY_SCHEMA = {
    'objName': 'Array',
    'type': 'array',
    'docstring': 'Display a 1D list variable as a row or column on the grid.',
    'properties': [
        {'name': 'var_name',   'type': 'str',                   'default': '',    'ser': 'str',    'key': 'varName'},
        {'name': 'position',   'type': 'tuple[int,int]',         'default': (0,0), 'ser': 'base'},
        {'name': 'direction',  'type': 'str',                   'default': 'right','ser': 'str'},
        {'name': 'length',     'type': 'int',                   'default': 0,     'ser': 'int'},   # computed @property
        {'name': 'show_index', 'type': 'bool',                  'default': True,  'ser': 'bool',   'key': 'showIndex'},
        {'name': 'color',      'type': 'tuple[int,int,int]|None','default': None,  'ser': 'color?'},  # None → CSS default
        {'name': '_cells',     'type': 'list',                  'default': None,  'ser': 'list_r', 'key': 'values'},  # None default avoids mutable schema default; always set by __init__
        {'name': 'visible',    'type': 'bool',                  'default': True,  'ser': 'base'},
        {'name': 'z',          'type': 'int',                   'default': 0,     'ser': 'base'},
    ],
}


class Array(_engine.VisualElem):
    _schema = ARRAY_SCHEMA

    def __init__(self, arr=None, var_name="", position=(0, 0), direction="right", show_index=True, visible=True, z=0):
        super().__init__()
        self._cells = [] if arr is None else arr  # new list each call; never share the default
        self.var_name = var_name
        self.position = position
        self.direction = direction
        self.show_index = show_index
        self.visible = visible
        self.color = None
        self.font_size = None
        self.z = z

    @property
    def length(self):
        return len(self._cells)

    def _serialize(self):
        return self._serialize_from_fields(ARRAY_SCHEMA)


class Array2D(_engine.VisualElem):
    """Display a 2D list variable as a matrix on the grid."""
    def __init__(self, var_name="", position=(0, 0), num_rows=3, num_cols=3, show_index=True, visible=True, z=0):
        super().__init__()
        self.var_name = var_name
        self.position = position
        self._num_rows = num_rows
        self._num_cols = num_cols
        self._dims_manually_set = False
        self.show_index = show_index
        self.visible = visible
        self.z = z
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


# ── Shorthand ────────────────────────────────────────────────────────────────

V = _engine.V   # bind element properties to expressions: rect.color = V("i * 10")


# ── Builder Hooks (override to react to trace steps) ─────────────────────────

def update(params, scope):
    pass

def function_call(function_name: str, **kwargs) -> None:
    """Called when the debugger code enters a function. Override in builder code.

    function_name -- the function's __name__ (e.g. '__init__', 'my_func')
    kwargs        -- the function's arguments (excluding 'self')
    """
    pass

def function_exit(function_name: str, value) -> None:
    """Called when a function in the debugger code returns. Override in builder code.

    function_name -- the function's __name__
    value         -- for __init__: the constructed 'self' object;
                     for other functions: the return value
    """
    pass


# ── Event Return Values ──────────────────────────────────────────────────────

class DebugCall:
    """Return this from an event handler to trigger a debugged sub-run of expression."""
    def __init__(self, expression: str):
        self.expression = expression


class RunCall:
    """Return this from an event handler to execute expression silently and refresh visuals."""
    def __init__(self, expression: str):
        self.expression = expression


# ── Element Event Handlers (override per element) ────────────────────────────

def on_click(self, position: tuple[int, int]):
    pass

def on_drag(self, position: tuple[int, int], drag_type: str):
    pass
