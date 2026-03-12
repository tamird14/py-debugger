import sys
import json
import copy
from io import StringIO
from types import FrameType
from typing import Any, Dict, List, Tuple, Optional, Set, TypedDict, Literal, TextIO


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

_trace_steps: List[TraceStep] = []
_step_stdout_positions: List[int] = []
_output_capture = StringIO()
_original_stdout = sys.stdout

def _capture_variables(
    frame: FrameType,
    exclude_vars: Optional[Set[str]] = None
) -> Dict[str, Any]:
    """Capture variables from a frame as raw Python values.

    Returns {name: raw_python_value}. Type conversion for the TypeScript
    boundary happens later in _serialize_variables_for_ts().
    """
    if exclude_vars is None:
        exclude_vars = set()

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
        result[name] = copy.deepcopy(value)

    return result


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

TraceEvent = Literal["call", "line", "return", "exception", "opcode"]

def _trace_function(
    frame: FrameType,
    event: TraceEvent,
    arg: Any
):
    """Trace function called for each line of code."""
    global _trace_steps, _step_stdout_positions

    if event != 'line':
        return _trace_function

    code = frame.f_code

    if code.co_filename not in ('<exec>', '<string>'):
        return _trace_function

    if code.co_name.startswith('_'):
        return _trace_function

    _step_stdout_positions.append(_output_capture.tell())

    variables = _capture_variables(frame, {'__builtins__', '__name__', '__doc__'})

    scope = []
    f = frame
    while f is not None and f.f_code.co_filename in ('<exec>', '<string>'):
        name = f.f_code.co_name
        if name.startswith('_'):
            f = f.f_back
            continue
        scope.insert(0, (name if name != '<module>' else '_main_', f.f_lineno))
        f = f.f_back

    _trace_steps.append({
        'variables': variables,
        'scope': scope
    })

    if len(_trace_steps) >= MAX_TRACE_STEPS:
        raise PopupException(
            f"Trace exceeded {MAX_TRACE_STEPS} steps — possible infinite loop. "
            "(This limit will be user-configurable in a future update.)"
        )

    return _trace_function

_exec_context: dict = {}

def _run_with_trace(code_str: str, persistent: bool = False) -> Dict[str, Any]:
    """Run code with tracing enabled.

    When persistent=False (initial trace) a fresh exec_globals dict is created
    and saved into _exec_context so variables accumulate in-place.
    When persistent=True the saved dict is reused, giving the sub-run access to
    all variables and functions defined during the initial trace.
    """
    global _trace_steps, _step_stdout_positions, _output_capture, _exec_context
    _trace_steps = []
    _step_stdout_positions = []
    _output_capture = StringIO()

    if not persistent:
        _exec_context = {'__builtins__': __builtins__}

    sys.stdout = _output_capture

    try:
        compiled = compile(code_str, '<exec>', 'exec')
        sys.settrace(_trace_function)
        exec(compiled, _exec_context)
    finally:
        sys.settrace(None)
        sys.stdout = _original_stdout

    total_output = _output_capture.getvalue()
    for i, step in enumerate(_trace_steps):
        start = _step_stdout_positions[i]
        end = _step_stdout_positions[i + 1] if i + 1 < len(_step_stdout_positions) else len(total_output)
        step['output'] = total_output[start:end]

    return {
        'steps': _trace_steps,
        'output': total_output
    }

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

    def __init__(self, expr: str):
        self.expr = expr

    def eval(self):
        try:
            return eval(self.expr, {"__builtins__": {}}, {**V.SAFE_GLOBALS, **V.params})
        except Exception:
            return self.expr

def get_v_attr(self, name):
    value = object.__getattribute__(self, name)

    if isinstance(value, V):
        return value.eval()
    return value

VisualElem.__getattribute__ = get_v_attr
    

def update(params: Dict[str, VariableValue], scope: List[Tuple[str, int]]):
    pass

def _visual_code_trace(code: str, persistent: bool = False) -> str:

    _run_with_trace(code, persistent)

    code_trace: List[TraceStep] = list(_trace_steps)
    timeline = []

    next_params = {}
    for step in code_trace[::-1]:
        next_params.update(step['variables'])
        step['variables'].update({k: copy.deepcopy(v) for k, v in next_params.items()})

    for step in code_trace:
        _builder_cap = StringIO()
        sys.stdout = _builder_cap
        try:
            update(step['variables'], step['scope'])
        finally:
            sys.stdout = _original_stdout
        step['builder_output'] = _builder_cap.getvalue()
        V.params = step['variables']
        V.scope = step['scope']
        snapshot_json = _serialize_visual_builder()
        snapshot = json.loads(snapshot_json)
        timeline.append(snapshot)

    # When code is empty (or has no traceable lines) still return the
    # current visual-builder state as a single step so the panel renders.
    if not timeline:
        code_trace = [{'variables': {}, 'scope': [], 'output': '', 'builder_output': ''}]
        timeline = [json.loads(_serialize_visual_builder())]

    # Serialize raw Python values to JSON-safe VariableValue dicts for TypeScript.
    for step in code_trace:
        step['variables'] = _serialize_variables_for_ts(step['variables'])

    return json.dumps({
        'code_timeline': code_trace,
        'visual_timeline': timeline,
        'handlers': _serialize_handlers(),
    })

def _prepare_and_trace_debug_call(expression: str, line_offset: int) -> str:
    """
    Define `debug_call()` in _exec_context with line numbers shifted to match
    the position of the injected function in the displayed combined code, then
    trace it persistently.
    """
    import ast as _ast
    func_source = f"def debug_call():\n    {expression}"
    tree = _ast.parse(func_source)
    _ast.increment_lineno(tree, line_offset)
    exec(compile(tree, '<exec>', 'exec'), _exec_context)
    return _visual_code_trace('debug_call()', True)