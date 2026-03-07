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
    print(f'{frame} , {event}')

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

def _run_with_trace(code_str: str) -> TraceResult:
    """Run code with tracing enabled."""
    global _trace_steps, _output_capture
    _trace_steps = []
    _output_capture = StringIO()

    sys.stdout = _output_capture

    try:
        compiled = compile(code_str, '<exec>', 'exec')
        sys.settrace(_trace_function)
        exec_globals = {'__builtins__': __builtins__}
        exec(compiled, exec_globals)
    finally:
        sys.settrace(None)
        sys.stdout = _original_stdout

    output = _output_capture.getvalue()

    return {
        'steps': _trace_steps,
        'output': output
    }


def update(params: Dict[str, VariableValue], scope: List[Tuple[str, int]]):
    pass

def _visual_code_trace(code: str) -> str:

    _run_with_trace

    timeline = []

    for step in _trace_steps:
        update(step['variables'], step['scope'])
        snapshot_json = _serialize_visual_builder()
        snapshot = json.loads(snapshot_json)
        timeline.append(snapshot)

    return json.dumps({
        'code_timeline': _trace_steps,
        'visual_timeline': timeline
    })