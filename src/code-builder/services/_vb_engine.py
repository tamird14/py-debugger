# Engine internals: VisualElem, V, R, TrackedDict, PopupException.
#
# This file is written to the Pyodide VFS so it can be imported as a module:
#
#   import _vb_engine as _engine
#
# User builder code never has _engine in scope, so these names are immune
# to accidental shadowing.

import ast as _ast
import copy as _copy
from typing import Any, Dict, List, Optional, Tuple


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


def _extract_names(expr: str) -> set:
    """Return all variable names referenced in an expression string."""
    try:
        tree = _ast.parse(expr, mode='eval')
        return {node.id for node in _ast.walk(tree) if isinstance(node, _ast.Name)}
    except SyntaxError:
        return set()


class V:
    params = {}
    scope = []

    SAFE_GLOBALS = {
        "len": len,
        "sum": sum,
        "min": min,
        "max": max,
        "abs": abs,
        "round": round,
        "sorted": sorted,
    }

    def __init__(self, expr: str, default: Any = None, names=None):
        self.expr = expr
        self.default = default
        if names is not None:
            self._deps = set(names)
        else:
            self._deps = _extract_names(expr) - set(V.SAFE_GLOBALS.keys())

    def eval(self):
        try:
            return R._wrap(eval(self.expr, {"__builtins__": {}}, {**V.SAFE_GLOBALS, **V.params}))
        except NameError as e:
            undefined = str(e).split("'")[1] if "'" in str(e) else None
            if undefined in self._deps:
                return self.default
            return self.default
        except Exception:
            return self.expr


class R:
    """Tracks a debugger object across trace steps by its original identity.

    The builder stores an R obtained from params; at each step the R re-resolves
    to the current step's copy of that object via R.registry.

    Builder code never constructs R directly — it receives R objects transparently
    when accessing params (a TrackedDict) or traversing attributes of an R.
    """
    registry: dict = {}      # {id(original_obj): current_step_copy}  — set per step
    inv_registry: dict = {}  # {id(current_step_copy): id(original_obj)} — set per step

    def __init__(self, orig_id: int):
        object.__setattr__(self, '_orig_id', orig_id)

    @classmethod
    def _wrap(cls, obj: Any) -> Any:
        """Wrap a copy returned from the registry (keyed by id(copy) in inv_registry)."""
        if isinstance(obj, (int, float, str, bool, type(None))):
            return obj
        orig_id = cls.inv_registry.get(id(obj))
        return cls(orig_id) if orig_id is not None else obj

    @classmethod
    def _wrap_original(cls, obj: Any) -> Any:
        """Wrap a live original object (keyed by id(original) in registry).

        Used for function event arguments and return values — these are the same
        live Python objects as in the outer scope, so their id() is already a key
        in R.registry from the most recent line step. No copy is needed.
        Falls back to returning the raw object if not tracked.
        """
        if isinstance(obj, (int, float, str, bool, type(None))):
            return obj
        return cls(id(obj)) if id(obj) in cls.registry else obj

    def resolve(self) -> Any:
        """Return the current step's copy of the tracked object, or None if gone."""
        return R.registry.get(object.__getattribute__(self, '_orig_id'))

    def __getattr__(self, name: str) -> Any:
        obj = self.resolve()
        if obj is None:
            raise AttributeError(f"Tracked object no longer exists in the current step")
        return R._wrap(getattr(obj, name))

    def __getitem__(self, key: Any) -> Any:
        obj = self.resolve()
        return R._wrap(obj[key])

    def __repr__(self) -> str:
        obj = self.resolve()
        return repr(obj)

    def __len__(self) -> int:
        return len(self.resolve())

    def __iter__(self):
        obj = self.resolve()
        return (R._wrap(item) for item in obj)


class TrackedDict:
    """Wraps a variables dict so attribute access returns R-tracked objects.

    Passed as 'params' to the builder's update() hook so the builder can hold
    references that automatically re-resolve to the correct copy each step.
    """
    def __init__(self, raw: Dict[str, Any]):
        self._raw = raw

    def __getitem__(self, key: str) -> Any:
        return R._wrap(self._raw[key])

    def __contains__(self, key: str) -> bool:
        return key in self._raw

    def keys(self):
        return self._raw.keys()

    def get(self, key: str, default: Any = None) -> Any:
        if key not in self._raw:
            return default
        return R._wrap(self._raw[key])


def _get_v_attr(self, name):
    value = object.__getattribute__(self, name)
    if isinstance(value, V):
        return value.eval()
    if isinstance(value, R):
        return value.resolve()
    return value


VisualElem.__getattribute__ = _get_v_attr
