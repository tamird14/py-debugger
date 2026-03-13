import inspect

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


class DebugCall:
    """Return this from an event handler to trigger a debugged sub-run of expression."""
    def __init__(self, expression: str):
        self.expression = expression


class RunCall:
    """Return this from an event handler to execute expression silently and refresh visuals."""
    def __init__(self, expression: str):
        self.expression = expression


def _handle_click(elem_id, row, col):
    """Call on_click on the element with the given id.

    Returns a tagged tuple ('debug'|'run'|None, expression|None).
    The caller is responsible for fetching the updated snapshot via
    _serialize_visual_builder().
    """
    result = None
    for elem in VisualElem._registry:
        if elem._elem_id == elem_id:
            result = elem.on_click((row, col))
            break
    if isinstance(result, DebugCall):
        return ('debug', result.expression)
    if isinstance(result, RunCall):
        return ('run', result.expression)
    return (None, None)


def _handle_click_with_output(elem_id, row, col):
    """Like _handle_click but captures stdout. Returns JSON {debugCall, runCall, output}."""
    import io as _io, sys as _sys, json as _json
    _old_stdout = _sys.stdout
    _capture = _io.StringIO()
    _sys.stdout = _capture
    try:
        _kind, _expr = _handle_click(elem_id, row, col)
    finally:
        _sys.stdout = _old_stdout
    return _json.dumps({
        'debugCall': _expr if _kind == 'debug' else None,
        'runCall':   _expr if _kind == 'run'   else None,
        'output': _capture.getvalue(),
    })

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