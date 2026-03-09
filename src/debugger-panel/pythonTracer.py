import sys
import json
from io import StringIO
from types import FrameType
from typing import Any, Dict, List, Tuple, Optional, Set, TypedDict, Literal, TextIO


class VariableValue(TypedDict):
    type: str
    value: Any

class TraceStep(TypedDict):
    variables: Dict[str, VariableValue]
    scope: List[Tuple[str, int]]

class TraceResult(TypedDict):
    steps: List[TraceStep]
    output: str

_trace_steps: List[TraceStep] = []
_output_capture = StringIO()
_original_stdout = sys.stdout

def _capture_variables(
    frame: FrameType,
    exclude_vars: Optional[Set[str]] = None
) -> Dict[str, VariableValue]:
    """Capture variables from a frame, converting to our format."""
    if exclude_vars is None:
        exclude_vars = set()

    result: Dict[str, VariableValue] = {}
    local_vars = frame.f_locals.copy()

    for name, value in local_vars.items():
        if name.startswith('_'):
            continue
        if name in exclude_vars:
            continue

        if isinstance(value, bool):
            result[name] = {'type': 'int', 'value': 1 if value else 0}
        elif isinstance(value, int):
            result[name] = {'type': 'int', 'value': value}
        elif isinstance(value, float):
            result[name] = {'type': 'float', 'value': value}
        elif isinstance(value, str):
            result[name] = {'type': 'str', 'value': value}
        elif isinstance(value, list):
            if len(value) > 0 and all(isinstance(row, list) for row in value):
                if all(isinstance(x, (int, float, bool)) for row in value for x in row):
                    int_values = [[int(x) if isinstance(x, (int, float)) else (1 if x else 0) for x in row] for row in value]
                    result[name] = {'type': 'arr2d[int]', 'value': int_values}
                elif all(isinstance(x, str) for row in value for x in row):
                    result[name] = {'type': 'arr2d[str]', 'value': value}
            elif all(isinstance(x, (int, float, bool)) for x in value):
                int_values = [int(x) if isinstance(x, (int, float)) else (1 if x else 0) for x in value]
                result[name] = {'type': 'arr[int]', 'value': int_values}
            elif all(isinstance(x, str) for x in value):
                result[name] = {'type': 'arr[str]', 'value': value}

    return result

TraceEvent = Literal["call", "line", "return", "exception", "opcode"]

def _trace_function(
    frame: FrameType,
    event: TraceEvent,
    arg: Any
):
    """Trace function called for each line of code."""
    global _trace_steps

    if event != 'line':
        return _trace_function

    code = frame.f_code

    if code.co_filename not in ('<exec>', '<string>'):
        return _trace_function

    if code.co_name.startswith('_'):
        return _trace_function

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

    return _trace_function

_exec_context: dict = {}

def _run_with_trace(code_str: str, persistent: bool = False) -> TraceResult:
    """Run code with tracing enabled.

    When persistent=False (initial trace) a fresh exec_globals dict is created
    and saved into _exec_context so variables accumulate in-place.
    When persistent=True the saved dict is reused, giving the sub-run access to
    all variables and functions defined during the initial trace.
    """
    global _trace_steps, _output_capture, _exec_context
    _trace_steps = []
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

    return {
        'steps': _trace_steps,
        'output': _output_capture.getvalue()
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
            params = {k: v['value'] for k, v in V.params.items()}
            return eval(self.expr, {"__builtins__": {}}, {**V.SAFE_GLOBALS, **params})
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
        step['variables'].update(next_params)

    for step in code_trace:
        update(step['variables'], step['scope'])
        V.params = step['variables']
        V.scope = step['scope']
        snapshot_json = _serialize_visual_builder()
        snapshot = json.loads(snapshot_json)
        timeline.append(snapshot)

    # When code is empty (or has no traceable lines) still return the
    # current visual-builder state as a single step so the panel renders.
    if not timeline:
        code_trace = [{'variables': {}, 'scope': []}]
        timeline = [json.loads(_serialize_visual_builder())]

    return json.dumps({
        'code_timeline': code_trace,
        'visual_timeline': timeline,
        'handlers': _serialize_handlers(),
    })