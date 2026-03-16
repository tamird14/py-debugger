import inspect
import _vb_engine as _engine
import user_api as _user_api


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

    # Compare annotations
    for ((_, p1), (_, p2)) in zip(sig1.parameters.items(), sig2.parameters.items()):
        if p1.annotation != inspect.Parameter.empty and p2.annotation != inspect.Parameter.empty:
            if p1.annotation != p2.annotation:
                return False

    return True


def _handle_event_with_output(event_name, elem_id, row, col, *extra_args):
    """Dispatch any named event handler (on_click, on_drag). Returns JSON {debugCall, runCall, output}."""
    import io as _io, sys as _sys, json as _json
    _old_stdout = _sys.stdout
    _capture = _io.StringIO()
    _sys.stdout = _capture
    result = None
    try:
        for elem in _engine.VisualElem._registry:
            if elem._elem_id == elem_id:
                handler = getattr(elem, event_name, None)
                if callable(handler):
                    result = handler((row, col), *extra_args)
                break
    finally:
        _sys.stdout = _old_stdout
    if isinstance(result, _user_api.DebugCall):
        _kind, _expr = 'debug', result.expression
    elif isinstance(result, _user_api.RunCall):
        _kind, _expr = 'run', result.expression
    else:
        _kind, _expr = None, None
    return _json.dumps({
        'debugCall': _expr if _kind == 'debug' else None,
        'runCall':   _expr if _kind == 'run'   else None,
        'output': _capture.getvalue(),
    })


def _handle_click_with_output(elem_id, row, col):
    """Thin wrapper around _handle_event_with_output for on_click (called by TypeScript)."""
    return _handle_event_with_output('on_click', elem_id, row, col)


def _serialize_handlers():
    """Return event handlers for all elements as a dict (for embedding in larger JSON)."""
    handlers = {}
    for elem in _engine.VisualElem._registry:
        elem_handlers = [f.__name__ for f in [_user_api.on_click, _user_api.on_drag]
                         if has_same_signature(type(elem), f)]
        if elem_handlers:
            handlers[elem._elem_id] = elem_handlers
    return handlers


def _serialize_handlers_json():
    """Return event handlers as a JSON string (for direct TypeScript calls)."""
    import json
    return json.dumps(_serialize_handlers())
