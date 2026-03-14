
from typing import get_type_hints


class PopupException(Exception):
    """Exception type used to signal user-facing popup messages."""
    pass


class VisualElem:
    _registry = []
    _vis_elem_id = 0

    @staticmethod
    def _clear_registry():
        VisualElem._registry.clear()
        VisualElem._vis_elem_id = 0

    def __init__(self):
        self.position = (0, 0)
        self.visible = True
        self.alpha = 1.0
        self.z = 0
        self.animate = True
        self._parent = None
        self._elem_id = VisualElem._vis_elem_id
        VisualElem._vis_elem_id += 1
        VisualElem._registry.append(self)

    def delete(self):
        """Remove this element from the registry and its parent panel."""
        if self in VisualElem._registry:
            VisualElem._registry.remove(self)
        if self._parent is not None:
            self._parent.remove(self)

    def _get_event_handlers(self):
        handlers = []
        for func in [on_click, on_drag]:
            if has_same_signature(type(self), func):
                handlers.append(func.__name__)
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


        out = {
            "position": [row, col],
            "visible": getattr(self, 'visible', True),
            "alpha": alpha,
            "z": int(getattr(self, 'z', 0)),
            "animate": bool(getattr(self, 'animate', True)),
            "_elem_id": self._elem_id,
        }
        if self._parent is not None:
            out["panelId"] = str(self._parent._elem_id)
        return out

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
        out = self._serialize_base()
        out["type"] = "panel"
        out["name"] = getattr(self, 'name', 'Panel')
        out["width"] = int(getattr(self, 'width', 5))
        out["height"] = int(getattr(self, 'height', 5))
        return out



def _serialize_visual_builder():
    """Walk VisualElem._registry and return list of serialized elements."""
    import json
    return json.dumps([elem._serialize() for elem in VisualElem._registry])



_MAX_BUILDER_STEPS = 100_000

class _BuilderLoopError(Exception):
    pass

# Names added to globals() by the most recent builder code run.
_builder_added_globals: set = set()
# Default (no-op) implementations of builder hooks, captured once on first use.
_default_hooks: dict = {}
# Names of the builder hooks that user builder code may override.
_HOOK_NAMES = ('update', 'function_call', 'function_exit')


def _reset_builder_state() -> None:
    """Remove all names added by the last builder code run and restore default hooks."""
    global _builder_added_globals
    for name in _builder_added_globals:
        globals().pop(name, None)
    _builder_added_globals = set()
    for name, fn in _default_hooks.items():
        globals()[name] = fn


def _exec_builder_code(code):
    """Execute visual builder code with stdout capture and infinite loop protection."""
    global _builder_added_globals
    import io as _io, sys as _sys

    # Capture default hook implementations the first time (before any builder code runs).
    if not _default_hooks:
        for _hook in _HOOK_NAMES:
            if _hook in globals():
                _default_hooks[_hook] = globals()[_hook]

    # Clean up everything the previous builder code run added to globals.
    _reset_builder_state()

    _step_count = [0]

    def _guard(frame, event, arg):
        _step_count[0] += 1
        if _step_count[0] > _MAX_BUILDER_STEPS:
            raise _BuilderLoopError(
                f"Builder code exceeded {_MAX_BUILDER_STEPS} steps — "
                "possible infinite loop. Execution stopped."
            )
        return _guard

    _before_keys = set(globals().keys())
    _old_stdout = _sys.stdout
    _sys.stdout = _io.StringIO()
    try:
        _sys.settrace(_guard)
        exec(code, globals())
        return _sys.stdout.getvalue()
    except _BuilderLoopError:
        raise
    finally:
        _sys.settrace(None)
        _sys.stdout = _old_stdout
        # Track what this run added so we can remove it next time.
        _builder_added_globals = set(globals().keys()) - _before_keys


def _execute_run_call(expression: str) -> str:
    """Execute expression silently in _exec_context, return snapshot + handlers JSON."""
    import io as _io, sys as _sys, json as _json
    _old_stdout = _sys.stdout
    _capture = _io.StringIO()
    _sys.stdout = _capture
    try:
        exec(expression, _exec_context)
    finally:
        _sys.stdout = _old_stdout
    snapshot = _json.loads(_serialize_visual_builder())
    handlers = _serialize_handlers()
    return _json.dumps({
        'snapshot': snapshot,
        'handlers': handlers,
        'output': _capture.getvalue(),
    })
