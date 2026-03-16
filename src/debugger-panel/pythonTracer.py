import sys
import json
import copy
import ast as _ast
from io import StringIO
from types import FrameType
from typing import Any, Dict, List, Tuple, Optional, Set, TypedDict
import _vb_engine as _engine
import user_api as _user_api


class VariableValue(TypedDict):
    type: str
    value: Any

# TraceStep.variables holds raw Python values internally (not VariableValue wrappers).
# They are converted to VariableValue dicts only at the TypeScript boundary
# via _serialize_variables_for_ts(), right before json.dumps.
class TraceStep(TypedDict):
    variables: Dict[str, Any]
    scope: List[Tuple[str, int]]

MAX_TRACE_STEPS = 1000  # TODO: make this user-configurable

_original_stdout = sys.stdout


def _is_traceable_func(name: str) -> bool:
    """True for public functions and dunder methods; False for single-underscore private."""
    if name.startswith('__') and name.endswith('__'):
        return True
    return not name.startswith('_')


def _capture_variables(
    frame: FrameType,
    exclude_vars: Optional[Set[str]] = None,
    memo: Optional[dict] = None,
) -> Dict[str, Any]:
    """Capture variables from a frame as raw Python values.

    Returns {name: raw_python_value}. Type conversion for the TypeScript
    boundary happens later in _serialize_variables_for_ts().

    memo: if provided, shared across all deepcopy calls so the same original
    object always maps to the same copy within a step. The caller can inspect
    memo afterwards to build an identity registry (see R class).
    """
    if exclude_vars is None:
        exclude_vars = set()
    if memo is None:
        memo = {}

    result: Dict[str, Any] = {}
    local_vars = frame.f_locals.copy()
    # When inside a function, also expose enclosing scopes (closures + globals)
    # so V-expressions referencing outer variables still evaluate correctly.
    if frame.f_locals is not frame.f_globals:
        # Walk enclosing function frames (closure scopes), innermost first
        f = frame.f_back
        while f is not None and f.f_code.co_filename in ('<exec>', '<string>') and f.f_locals is not f.f_globals:
            for k, v in f.f_locals.items():
                if k not in local_vars:
                    local_vars[k] = v
            f = f.f_back
        # Module-level globals
        for k, v in frame.f_globals.items():
            if k not in local_vars:
                local_vars[k] = v

    for name, value in local_vars.items():
        if name.startswith('_'):
            continue
        if name in exclude_vars:
            continue
        if callable(value) or isinstance(value, type):
            continue
        result[name] = copy.deepcopy(value, memo)

    return result


def _capture_scope(frame: FrameType) -> List[Tuple[str, int]]:
    """Capture the current scope as a list of (function_name, line_number) tuples,
    innermost scope last. The top-level module scope is represented as ('_main_', line).
    """
    scope = []
    f = frame
    while f is not None and f.f_code.co_filename in ('<exec>', '<string>'):
        name = f.f_code.co_name
        if name == '<module>':
            name = '_main_'
        is_priv = name.startswith('_') and not (name.startswith('__') and name.endswith('__'))
        if not is_priv:
            scope.insert(0, (name, f.f_lineno))
        f = f.f_back
    return scope


def _json_leaf(value: Any) -> Any:
    """Return a JSON-safe primitive representation of a value (one level deep)."""
    if isinstance(value, (bool, int, float, str)) or value is None:
        return value
    try:
        return repr(value)[:100]
    except Exception:
        return '<unrepresentable>'


def _serialize_value_for_ts(value: Any) -> Optional[VariableValue]:
    """Convert a single raw Python value to a JSON-safe VariableValue for TypeScript.

    Returns None for types that should be silently skipped (callables, types).
    """
    if isinstance(value, bool):
        return {'type': 'int', 'value': 1 if value else 0}
    if isinstance(value, int):
        return {'type': 'int', 'value': value}
    if isinstance(value, float):
        return {'type': 'float', 'value': value}
    if isinstance(value, str):
        return {'type': 'str', 'value': value}
    if value is None:
        return {'type': 'none', 'value': None}
    if isinstance(value, list):
        if len(value) > 0 and all(isinstance(row, list) for row in value):
            if all(isinstance(x, (int, float, bool)) for row in value for x in row):
                int_values = [[int(x) if isinstance(x, (int, float)) else (1 if x else 0) for x in row] for row in value]
                return {'type': 'arr2d[int]', 'value': int_values}
            elif all(isinstance(x, str) for row in value for x in row):
                return {'type': 'arr2d[str]', 'value': value}
        elif all(isinstance(x, (int, float, bool)) for x in value):
            int_values = [int(x) if isinstance(x, (int, float)) else (1 if x else 0) for x in value]
            return {'type': 'arr[int]', 'value': int_values}
        elif all(isinstance(x, str) for x in value):
            return {'type': 'arr[str]', 'value': value}
    if isinstance(value, tuple):
        return {'type': 'tuple', 'value': [_json_leaf(x) for x in value]}
    if isinstance(value, dict):
        items = list(value.items())[:50]
        return {'type': 'dict', 'value': {str(k): _json_leaf(v) for k, v in items}}
    if isinstance(value, set):
        return {'type': 'set', 'value': sorted([_json_leaf(x) for x in value], key=repr)}
    # Custom objects and anything else: use the class name as type and repr as value.
    try:
        type_name = type(value).__name__
        return {'type': type_name, 'value': repr(value)[:200]}
    except Exception:
        return None


def _serialize_variables_for_ts(raw_vars: Dict[str, Any]) -> Dict[str, VariableValue]:
    """Convert {name: raw_python_value} to {name: VariableValue} for json.dumps."""
    result: Dict[str, VariableValue] = {}
    for name, value in raw_vars.items():
        try:
            serialized = _serialize_value_for_ts(value)
            if serialized is not None:
                result[name] = serialized
        except Exception:
            pass
    return result


_exec_context: dict = {}
_last_code_line_count: int = 0


def _visual_code_trace(code: str, persistent: bool = False) -> str:
    global _last_code_line_count, _exec_context
    if not persistent:
        _last_code_line_count = len(code.splitlines())

    code_trace: List[TraceStep] = []
    visual_timeline = []
    debugger_output_buf = StringIO()
    last_output_pos = 0
    accumulated_builder_output: List[str] = []  # builder output from function events since last line step

    def _call_builder(fn, *args, **kwargs):
        """Call a builder hook with tracing disabled and stdout captured."""
        buf = StringIO()
        sys.settrace(None)
        sys.stdout = buf
        try:
            fn(*args, **kwargs)
        finally:
            sys.stdout = debugger_output_buf
            sys.settrace(trace_fn)
        return buf.getvalue()

    def trace_fn(frame, event, arg):
        nonlocal last_output_pos
        code_obj = frame.f_code
        if code_obj.co_filename not in ('<exec>', '<string>'):
            return trace_fn

        if event == 'call':
            if not _is_traceable_func(code_obj.co_name):
                return trace_fn
            func_name = code_obj.co_qualname
            # Arguments are the same live objects already in R.registry from the last
            # line step — no copy needed. _wrap_original looks up id(original) directly.
            accumulated_builder_output.append(_call_builder(
                _user_code_ns.get('function_call', _user_api.function_call), func_name,
                **{
                    name: _engine.R._wrap_original(frame.f_locals[name])
                    for name in code_obj.co_varnames[:code_obj.co_argcount]
                    if name != 'self' and name in frame.f_locals
                }
            ))
            return trace_fn

        if event == 'return':
            if not _is_traceable_func(code_obj.co_name):
                return trace_fn
            func_name = code_obj.co_qualname
            # For __init__, self was traced as a variable inside the function so its
            # id() is already in R.registry from the last line step within __init__.
            # For other functions, arg is usually also a tracked variable — fall back
            # to raw if not found (e.g. a brand-new object never assigned to a variable).
            value = frame.f_locals.get('self') if code_obj.co_name == '__init__' else arg
            accumulated_builder_output.append(_call_builder(
                _user_code_ns.get('function_exit', _user_api.function_exit), func_name, _engine.R._wrap_original(value)
            ))
            return trace_fn

        if event != 'line':
            return trace_fn

        is_private = code_obj.co_name.startswith('_') and not (
            code_obj.co_name.startswith('__') and code_obj.co_name.endswith('__')
        )
        if is_private:
            return trace_fn

        # Preparing variables and scope
        _step_memo: dict = {}
        variables = _capture_variables(frame, {'__builtins__', '__name__', '__doc__'}, _step_memo)
        scope = _capture_scope(frame)

        cur_pos = debugger_output_buf.tell()
        output_slice = debugger_output_buf.getvalue()[last_output_pos:cur_pos]
        last_output_pos = cur_pos

        # Update R identity registries for this step so R wrappers resolve correctly.
        _engine.R.registry = _step_memo
        _engine.R.inv_registry = {id(v): k for k, v in _step_memo.items()}

        _engine.V.params = variables
        _engine.V.scope = scope
        accumulated_builder_output.append(_call_builder(
            _user_code_ns.get('update', _user_api.update), _engine.TrackedDict(variables), scope))

        snapshot = json.loads(_serialize_visual_builder())

        code_trace.append({
            'variables': variables,
            'scope': scope,
            'output': output_slice,
            'builder_output': ''.join(accumulated_builder_output),
        })
        accumulated_builder_output.clear()
        visual_timeline.append(snapshot)

        if len(code_trace) >= MAX_TRACE_STEPS:
            raise _engine.PopupException(
                f"Trace exceeded {MAX_TRACE_STEPS} steps — possible infinite loop. "
                "(This limit will be user-configurable in a future update.)"
            )

        return trace_fn

    exec_ctx = _exec_context if persistent else {'__builtins__': __builtins__}
    if not persistent:
        _exec_context = exec_ctx

    sys.stdout = debugger_output_buf
    try:
        compiled = compile(code, '<exec>', 'exec')
        sys.settrace(trace_fn)
        exec(compiled, exec_ctx)
    finally:
        sys.settrace(None)
        sys.stdout = _original_stdout

    # Attach any remaining debugger output to the last step
    if code_trace:
        remaining = debugger_output_buf.getvalue()[last_output_pos:]
        if remaining:
            code_trace[-1]['output'] += remaining

    # When code is empty (or has no traceable lines) still return the
    # current visual-builder state as a single step so the panel renders.
    if not visual_timeline:
        code_trace = [{'variables': {}, 'scope': [], 'output': '', 'builder_output': ''}]
        visual_timeline = [json.loads(_serialize_visual_builder())]

    # Serialize raw Python values to JSON-safe VariableValue dicts for TypeScript.
    for step in code_trace:
        step['variables'] = _serialize_variables_for_ts(step['variables'])

    return json.dumps({
        'code_timeline': code_trace,
        'visual_timeline': visual_timeline,
        'handlers': _serialize_handlers(),
    })

def _reset_exec_state() -> None:
    """Clear all mutable Python state: execution context, visual element registry,
    and any names added to the global namespace by the previous builder code run.

    Called when the user enters edit mode so the next Analyze starts from a
    completely clean environment, regardless of what happened in the previous
    interactive session.
    """
    global _exec_context
    _exec_context = {'__builtins__': __builtins__}
    _engine.VisualElem._clear_registry()
    _user_code_ns.clear()


def _prepare_and_trace_debug_call(expression: str) -> str:
    """
    Define `debug_call()` in _exec_context with line numbers shifted to match
    the position of the injected function in the displayed combined code, then
    trace it persistently.
    """
    func_source = f"def debug_call():\n    {expression}"
    tree = _ast.parse(func_source)
    _ast.increment_lineno(tree, _last_code_line_count + 2)
    exec(compile(tree, '<exec>', 'exec'), _exec_context)
    return _visual_code_trace('debug_call()', True)
