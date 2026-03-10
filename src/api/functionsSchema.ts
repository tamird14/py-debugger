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
    objName: 'on_click(self, position)',
    docstring: 'Define on a shape subclass to handle click events. Return DebugCall(expr) to trigger a debugged sub-run.',
    properties: [
      { name: 'position', type: 'tuple[int, int]', description: 'Grid cell (row, col) that was clicked.' },
    ],
  },
  {
    objName: 'DebugCall(expression)',
    docstring: 'Return from on_click to trigger a debugged sub-run of the given expression.',
    properties: [
      { name: 'expression', type: 'str', description: 'Python expression to execute and debug.' },
    ],
  },
];
