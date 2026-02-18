import sys
import json
from io import StringIO

_trace_steps = []
_output_capture = StringIO()
_original_stdout = sys.stdout

def _capture_variables(frame, exclude_vars=None):
    """Capture variables from a frame, converting to our format."""
    if exclude_vars is None:
        exclude_vars = set()

    result = {}
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
            if all(isinstance(x, (int, float, bool)) for x in value):
                int_values = [int(x) if isinstance(x, (int, float)) else (1 if x else 0) for x in value]
                result[name] = {'type': 'arr[int]', 'value': int_values}
            elif all(isinstance(x, str) for x in value):
                result[name] = {'type': 'arr[str]', 'value': value}

    return result

def _trace_function(frame, event, arg):
    """Trace function called for each line of code."""
    global _trace_steps

    if event != 'line':
        return _trace_function

    code = frame.f_code

    if code.co_filename != '<exec>' and code.co_filename != '<string>':
        return _trace_function

    if code.co_name.startswith('_'):
        return _trace_function

    line_no = frame.f_lineno
    variables = _capture_variables(frame, {'__builtins__', '__name__', '__doc__'})

    scope = []
    f = frame
    while f is not None:
        name = f.f_code.co_name
        if name.startswith('_'):
            f = f.f_back
            continue
        scope.insert(0, (name if name != '<module>' else '_main_', f.f_lineno))
        f = f.f_back

    _trace_steps.append({
        'line': line_no,
        'variables': variables,
        'scope': scope
    })

    return _trace_function

def _run_with_trace(code_str):
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
