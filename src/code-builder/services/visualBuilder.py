import _vb_engine as _engine
import user_api as _user_api


def _serialize_visual_builder():
    """Walk VisualElem._registry and return list of serialized elements."""
    import json
    return json.dumps([elem._serialize() for elem in _engine.VisualElem._registry])


_MAX_BUILDER_STEPS = 100_000

class _BuilderLoopError(Exception):
    pass

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

    _step_count = [0]

    def _guard(frame, event, arg):
        _step_count[0] += 1
        if _step_count[0] > _MAX_BUILDER_STEPS:
            raise _BuilderLoopError(
                f"Builder code exceeded {_MAX_BUILDER_STEPS} steps — "
                "possible infinite loop. Execution stopped."
            )
        return _guard

    # Build a fresh sandbox from user_api defaults each run.
    _user_code_ns = {
        '__builtins__': __builtins__,
        **vars(_user_api),
    }

    _old_stdout = _sys.stdout
    _sys.stdout = _io.StringIO()
    try:
        _sys.settrace(_guard)
        exec(code, _user_code_ns)
        return _sys.stdout.getvalue()
    except _BuilderLoopError:
        raise
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
