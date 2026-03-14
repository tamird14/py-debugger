import type { ObjDoc } from './visualBuilder';

export const FUNCTIONS_SCHEMA: ObjDoc[] = [
  {
    objName: 'update(params, scope)',
    docstring:
      'Called at every trace step of the debugger code. params is a dict mapping variable names to their current values (e.g. params["i"] == 3). scope is a list of (function_name, line_number) tuples from innermost to outermost call frame (e.g. [("bubble_sort", 5), ("<module>", 10)]).',
    properties: [
      { name: 'params', type: 'dict[str, Any]', description: 'Current variable values from the debugger code.' },
      { name: 'scope', type: 'list[tuple[str, int]]', description: 'Call stack as [(function_name, line_number), ...], innermost first.' },
    ],
  },
  {
    objName: 'function_call(function_name, **kwargs)',
    docstring: 'Called when the debugger code enters a function. Override in builder code to react to function calls (e.g. highlight a node when a recursive call begins).',
    properties: [
      { name: 'function_name', type: 'str', description: 'The function\'s __name__ (e.g. "my_func", "__init__").' },
      { name: '**kwargs', type: 'Any', description: 'The function\'s arguments (excluding self).' },
    ],
  },
  {
    objName: 'function_exit(function_name, value)',
    docstring: 'Called when a function in the debugger code returns. Override in builder code to react to return values.',
    properties: [
      { name: 'function_name', type: 'str', description: 'The function\'s __name__.' },
      { name: 'value', type: 'Any', description: 'For __init__: the constructed self object. For other functions: the return value.' },
    ],
  },
  {
    objName: 'V(expr, default=None)',
    docstring: 'Wrap a string expression to be evaluated lazily at each timeline step using the current debugger variable values. Use inside shape constructors so properties update automatically as you step through the trace.',
    properties: [
      { name: 'expr', type: 'str', description: 'Python expression referencing debugger variables (e.g. "arr[i]", "i + 1").' },
      { name: 'default', type: 'Any', description: 'Value returned when expr references an undefined variable. Defaults to None.' },
    ],
  },
  {
    objName: 'on_click(self, position)',
    docstring: 'Define on a shape subclass to handle click events in interactive mode. Return DebugCall(expr) or RunCall(expr) to trigger further execution.',
    properties: [
      { name: 'position', type: 'tuple[int, int]', description: 'Grid cell (row, col) that was clicked.' },
    ],
  },
  {
    objName: 'on_drag(self, position, drag_type)',
    docstring: 'Define on a shape subclass to handle drag events in interactive mode. Called repeatedly as the user drags across grid cells. Return DebugCall(expr) or RunCall(expr).',
    properties: [
      { name: 'position', type: 'tuple[int, int]', description: 'Grid cell (row, col) currently under the pointer.' },
      { name: 'drag_type', type: "'start' | 'mid' | 'end'", description: '"start" on mouse-down, "mid" on each cell entered during drag, "end" on mouse-up.' },
    ],
  },
  {
    objName: 'DebugCall(expression)',
    docstring: 'Return from an event handler to trigger a debugged sub-run of the given expression. Opens a new debug timeline the user can step through.',
    properties: [
      { name: 'expression', type: 'str', description: 'Python expression to execute and debug.' },
    ],
  },
  {
    objName: 'RunCall(expression)',
    docstring: 'Return from an event handler to execute the given expression silently and refresh the visual state. No new debug timeline is created.',
    properties: [
      { name: 'expression', type: 'str', description: 'Python expression to execute silently.' },
    ],
  },
];
