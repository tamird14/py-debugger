import _vb_engine as _engine
import user_api as _user_api


def _serialize_visual_builder():
    """Walk VisualElem._registry and return list of serialized elements."""
    import json
    return json.dumps([elem._serialize() for elem in _engine.VisualElem._registry])


# Sandbox namespace for user builder code. Populated by _exec_builder_code,
# read by _visual_code_trace for hook calls.
_user_code_ns: dict = {}


def _exec_builder_code(code: str) -> str:
    """Execute visual builder code in a sandboxed namespace with stdout capture
    and infinite loop protection.

    The sandbox is seeded from user_api defaults so the user sees Panel, Rect,
    V, update, etc. but cannot reach engine internals in Pyodide globals.
    Returns captured stdout from the builder code run.
    """
    global _user_code_ns
    import io as _io, sys as _sys

    # Build a fresh sandbox from user_api defaults each run.
    _user_code_ns = {
        '__builtins__': __builtins__,
        **vars(_user_api),
    }

    _old_stdout = _sys.stdout
    _sys.stdout = _io.StringIO()
    try:
        _sys.settrace(_engine.make_step_guard())
        exec(compile(code, '<builder_code>', 'exec'), _user_code_ns)
        return _sys.stdout.getvalue()
    finally:
        _sys.settrace(None)
        _sys.stdout = _old_stdout


def _execute_run_call(expression: str) -> str:
    """Execute expression silently in _exec_context, return snapshot + handlers JSON."""
    import io as _io, sys as _sys, json as _json
    _old_stdout = _sys.stdout
    _capture = _io.StringIO()
    _sys.stdout = _capture
    try:
        _sys.settrace(_engine.make_step_guard())
        exec(expression, _exec_context)
    finally:
        _sys.settrace(None)
        _sys.stdout = _old_stdout
    _engine.V.params = {k: v for k, v in _exec_context.items() if not k.startswith('__')}
    snapshot = _json.loads(_serialize_visual_builder())
    handlers = _serialize_handlers()
    return _json.dumps({
        'snapshot': snapshot,
        'handlers': handlers,
        'output': _capture.getvalue(),
    })
