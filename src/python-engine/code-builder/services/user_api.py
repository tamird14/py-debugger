import _vb_engine as _engine


# ── Visual Elements ──────────────────────────────────────────────────────────

PANEL_SCHEMA = {
    'objName': 'Panel',
    'type': 'panel',
    'docstring': 'A container panel. Children use positions relative to its top-left corner. width/height set the minimum size — the panel grows to fit children that overflow.',
    'properties': [
        {'name': 'name',        'type': 'str',  'default': '',      'ser': 'str'},
        {'name': 'width',       'type': 'int',  'default': 1,       'ser': 'int'},
        {'name': 'height',      'type': 'int',  'default': 1,       'ser': 'int'},
        {'name': 'show_border', 'type': 'bool', 'default': False,   'ser': 'bool'},
    ],
}


class Panel(_engine.VisualElem):
    _schema = PANEL_SCHEMA

    def __init__(self, **kwargs):
        super().__init__(**{k:v for k,v in kwargs.items() if k not in ('name', 'width', 'height', 'show_border')})
        self.name = kwargs.get('name', '')
        self.width = kwargs.get('width', 1)
        self.height = kwargs.get('height', 1)
        self.show_border = kwargs.get('show_border', False)
        self._children = []

    def __len__(self):
        return len(self._children)
    
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

    def delete(self):
        """Remove this element from the registry and its parent panel."""
        while len(self._children) > 0:
            self._children[-1].delete()
        super().delete()

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

class Rect(_engine._ShapeBase, schema=RECT_SCHEMA): pass


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

class Circle(_engine._ShapeBase, schema=CIRCLE_SCHEMA): pass


ARROW_SCHEMA = {
    'objName': 'Arrow',
    'type': 'arrow',
    'docstring': 'An arrow shape on the grid. Use angle to control direction: 0=up, 90=right, 180=down, 270=left. Use Arrow.UP/DOWN/LEFT/RIGHT constants or set_orientation() for convenience.',
    'properties': [
        {'name': 'position', 'type': 'tuple[int,int]',     'default': (0, 0),         'ser': 'base'},
        {'name': 'width',    'type': 'int',                'default': 1,              'ser': 'int'},
        {'name': 'height',   'type': 'int',                'default': 1,              'ser': 'int'},
        {'name': 'color',    'type': 'tuple[int,int,int]', 'default': (16, 185, 129), 'ser': 'color'},
        {'name': 'angle',    'type': 'float',              'default': 0,              'ser': 'float'},
        {'name': 'visible',  'type': 'bool',               'default': True,           'ser': 'base'},
        {'name': 'z',        'type': 'int',                'default': 0,              'ser': 'base'},
    ],
}

class Arrow(_engine._ShapeBase, schema=ARROW_SCHEMA):
    UP    = 0
    RIGHT = 90
    DOWN  = 180
    LEFT  = 270

    def set_orientation(self, direction: str) -> None:
        """Set angle from a direction string: 'up', 'right', 'down', or 'left'."""
        _map = {'up': 0, 'right': 90, 'down': 180, 'left': 270}
        if direction not in _map:
            raise ValueError(
                f"Arrow.set_orientation: expected 'up', 'right', 'down', or 'left', got {direction!r}"
            )
        self.angle = _map[direction]


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

# TODO: support width='auto' — measure text length and set width to ceil(len(label) * font_size / CELL_SIZE)
# so users don't have to calculate width manually for long labels.
class Label(_engine._ShapeBase, schema=LABEL_SCHEMA): pass


ARRAY_SCHEMA = {
    'objName': 'Array',
    'type': 'array',
    'docstring': 'Display a 1D list variable as a row or column on the grid.',
    'properties': [
        {'name': 'name',       'type': 'str',                    'default': '',    'ser': 'str'},
        {'name': 'position',   'type': 'tuple[int,int]',          'default': (0,0), 'ser': 'base'},
        {'name': 'direction',  'type': 'str',                    'default': 'right','ser': 'str'},
        {'name': 'show_index', 'type': 'bool',                   'default': True,  'ser': 'bool',   'key': 'showIndex'},
        {'name': 'color',      'type': 'tuple[int,int,int]|None', 'default': None,  'ser': 'color?'},  # None → CSS default
        {'name': 'cells',      'type': 'list',                   'default': [],    'ser': 'list_r', 'key': 'values'},  # deep-copied per instance by _ShapeBase.__init__
        {'name': 'visible',    'type': 'bool',                   'default': True,  'ser': 'base'},
        {'name': 'z',          'type': 'int',                    'default': 0,     'ser': 'base'},
    ],
}

class Array(_engine._ShapeBase, schema=ARRAY_SCHEMA): pass


def _array1d_post_init(self):
    raw = object.__getattribute__(self, 'cells')
    if isinstance(raw, (_engine.V, _engine.R)):
        return
    if not isinstance(raw, (list, tuple)):
        raise _engine.PopupException(
            f"Array: 'cells' must be a list, got {type(raw).__name__}"
        )
    for i, item in enumerate(raw):
        if not isinstance(item, (int, float, str, bool, type(None))):
            raise _engine.PopupException(
                f"Array: element [{i}] must be a primitive "
                f"(int, float, str, bool, or None), got {type(item).__name__}"
            )

Array._post_init = _array1d_post_init


ARRAY2D_SCHEMA = {
    'objName': 'Array2D',
    'type': 'array2d',
    'docstring': 'Display a 2D list variable as a matrix on the grid.',
    'properties': [
        {'name': 'name',       'type': 'str',                    'default': '',   'ser': 'str'},
        {'name': 'position',   'type': 'tuple[int,int]',          'default': (0,0),'ser': 'base'},
        {'name': 'show_index', 'type': 'bool',                   'default': True, 'ser': 'bool',     'key': 'showIndex'},
        {'name': 'color',      'type': 'tuple[int,int,int]|None', 'default': None, 'ser': 'color?'},
        {'name': 'cells',       'type': 'list',  'default': [],   'ser': 'list2d_r', 'key': 'values'},
        {'name': 'rectangular', 'type': 'bool',  'default': True, 'ser': 'bool'},
        {'name': 'visible',     'type': 'bool',  'default': True, 'ser': 'base'},
        {'name': 'z',          'type': 'int',                    'default': 0,    'ser': 'base'},
    ],
}

class Array2D(_engine._ShapeBase, schema=ARRAY2D_SCHEMA): pass


def _array2d_post_init(self):
    raw = object.__getattribute__(self, 'cells')
    if isinstance(raw, (_engine.V, _engine.R)):
        return
    if not isinstance(raw, (list, tuple)):
        raise _engine.PopupException(
            f"Array2D: 'cells' must be a 2D list, got {type(raw).__name__}"
        )
    for i, row in enumerate(raw):
        if not isinstance(row, (list, tuple)):
            raise _engine.PopupException(
                f"Array2D: row {i} must be a list, got {type(row).__name__}"
            )
        for j, item in enumerate(row):
            if not isinstance(item, (int, float, str, bool, type(None))):
                raise _engine.PopupException(
                    f"Array2D: element [{i}][{j}] must be a primitive "
                    f"(int, float, str, bool, or None), got {type(item).__name__}"
                )

Array2D._post_init = _array2d_post_init


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
