import type { Timeline, VariableDictionary } from '../types/grid';

// Types for execution results
export interface ExecutionStep {
  lineNumber: number;
  variables: VariableDictionary;
}

export interface ExecutionResult {
  success: boolean;
  timeline: Timeline;
  steps: ExecutionStep[];
  error?: string;
  output: string;
}

export interface VariableInfo {
  name: string;
  type: string;
  scope: string;
}

// Pyodide instance - will be loaded lazily
let pyodide: any = null;
let isLoading = false;
let loadPromise: Promise<any> | null = null;

// Load Pyodide directly from CDN
export async function loadPyodide(): Promise<any> {
  if (pyodide) return pyodide;

  if (isLoading && loadPromise) {
    return loadPromise;
  }

  isLoading = true;

  loadPromise = (async () => {
    // Load Pyodide script from CDN
    const PYODIDE_VERSION = '0.26.4';
    const cdnUrl = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

    // Check if script already loaded
    if (!(window as any).loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${cdnUrl}pyodide.js`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Pyodide script'));
        document.head.appendChild(script);
      });
    }

    // Now load Pyodide
    pyodide = await (window as any).loadPyodide({
      indexURL: cdnUrl,
    });

    isLoading = false;
    return pyodide;
  })();

  return loadPromise;
}

// Check if Pyodide is loaded
export function isPyodideLoaded(): boolean {
  return pyodide !== null;
}

// Python code to instrument and trace execution
const TRACER_CODE = `
import sys
import json
from io import StringIO

# Store for execution trace
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
        # Skip private/internal variables
        if name.startswith('_'):
            continue
        if name in exclude_vars:
            continue

        # Handle different types
        if isinstance(value, bool):
            result[name] = {'type': 'int', 'value': 1 if value else 0}
        elif isinstance(value, int):
            result[name] = {'type': 'int', 'value': value}
        elif isinstance(value, float):
            result[name] = {'type': 'float', 'value': value}
        elif isinstance(value, str):
            result[name] = {'type': 'str', 'value': value}
        elif isinstance(value, list):
            # Check if it's a list of numbers
            if all(isinstance(x, (int, float, bool)) for x in value):
                int_values = [int(x) if isinstance(x, (int, float)) else (1 if x else 0) for x in value]
                result[name] = {'type': 'arr[int]', 'value': int_values}
            elif all(isinstance(x, str) for x in value):
                result[name] = {'type': 'arr[str]', 'value': value}

    return result

def _trace_function(frame, event, arg):
    """Trace function called for each line of code."""
    global _trace_steps

    # Only trace 'line' events in the main module
    if event != 'line':
        return _trace_function

    # Get the code object
    code = frame.f_code

    # Skip internal modules and tracer code
    if code.co_filename != '<exec>' and code.co_filename != '<string>':
        return _trace_function

    # Skip if we're in a function defined in our tracer
    if code.co_name.startswith('_'):
        return _trace_function

    line_no = frame.f_lineno
    variables = _capture_variables(frame, {'__builtins__', '__name__', '__doc__'})

    _trace_steps.append({
        'line': line_no,
        'variables': variables
    })

    return _trace_function

def _run_with_trace(code_str):
    """Run code with tracing enabled."""
    global _trace_steps, _output_capture
    _trace_steps = []
    _output_capture = StringIO()

    # Redirect stdout
    sys.stdout = _output_capture

    try:
        # Compile the code
        compiled = compile(code_str, '<exec>', 'exec')

        # Set up tracing
        sys.settrace(_trace_function)

        # Execute
        exec_globals = {'__builtins__': __builtins__}
        exec(compiled, exec_globals)

    finally:
        # Disable tracing
        sys.settrace(None)
        # Restore stdout
        sys.stdout = _original_stdout

    # Get final output
    output = _output_capture.getvalue()

    return {
        'steps': _trace_steps,
        'output': output
    }
`;

// Convert Python trace result to our Timeline format
function convertToTimeline(steps: any[]): { timeline: Timeline; executionSteps: ExecutionStep[] } {
  const timeline: Timeline = [];
  const executionSteps: ExecutionStep[] = [];

  // Capture the first value each variable gets to use as defaults
  const firstValues: VariableDictionary = {};
  for (const step of steps) {
    if (step?.variables && typeof step.variables === 'object') {
      for (const [name, value] of Object.entries(step.variables)) {
        if (!(name in firstValues)) {
          firstValues[name] = value as VariableDictionary[string];
        }
      }
    }
  }

  // Track last known variables to carry forward when no changes
  let lastVars: VariableDictionary = { ...firstValues };

  for (const step of steps) {
    // Merge current step variables with last known state
    // This ensures we always have the full variable state at each step
    const currentVars = { ...lastVars, ...step.variables };

    // Always record the execution step for line highlighting
    executionSteps.push({
      lineNumber: step.line,
      variables: currentVars,
    });

    // Add every step to the timeline so we can see all execution
    timeline.push(currentVars);

    // Update last known variables
    if (Object.keys(step.variables).length > 0) {
      lastVars = currentVars;
    }
  }

  // If no steps, add an empty state
  if (timeline.length === 0) {
    timeline.push({ ...firstValues });
  }

  return { timeline, executionSteps };
}

// Execute Python code and return timeline
export async function executePythonCode(code: string): Promise<ExecutionResult> {
  try {
    // Load Pyodide if not loaded
    const py = await loadPyodide();

    // First, run the tracer setup code
    await py.runPythonAsync(TRACER_CODE);

    // Escape the user code for Python string
    const escapedCode = code
      .replace(/\\/g, '\\\\')
      .replace(/"""/g, '\\"\\"\\"')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n');

    // Run the user code with tracing
    const resultJson = await py.runPythonAsync(`
import json
result = _run_with_trace('''${escapedCode.replace(/'''/g, "\\'\\'\\'")}''')
json.dumps(result)
`);

    const result = JSON.parse(resultJson);
    const { timeline, executionSteps } = convertToTimeline(result.steps);

    return {
      success: true,
      timeline,
      steps: executionSteps,
      output: result.output || '',
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Try to extract Python error
    let cleanError = errorMessage;
    if (errorMessage.includes('PythonError:')) {
      cleanError = errorMessage.split('PythonError:')[1]?.trim() || errorMessage;
    }

    return {
      success: false,
      timeline: [],
      steps: [],
      error: cleanError,
      output: '',
    };
  }
}

// Get list of variables used in code (for display purposes)
export async function analyzeCode(code: string): Promise<VariableInfo[]> {
  try {
    const py = await loadPyodide();

    const escapedCode = code
      .replace(/\\/g, '\\\\')
      .replace(/"""/g, '\\"\\"\\"')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n');

    const resultJson = await py.runPythonAsync(`
import ast
import json

def analyze_variables(code_str):
    try:
        tree = ast.parse(code_str)
    except SyntaxError:
        return []

    variables = []
    seen = set()

    class ScopeVisitor(ast.NodeVisitor):
        def __init__(self):
            self.scope_stack = []

        def current_scope(self):
            return self.scope_stack[-1] if self.scope_stack else 'global'

        def visit_FunctionDef(self, node):
            self.scope_stack.append(node.name)
            self.generic_visit(node)
            self.scope_stack.pop()

        def visit_AsyncFunctionDef(self, node):
            self.scope_stack.append(node.name)
            self.generic_visit(node)
            self.scope_stack.pop()

        def visit_Name(self, node):
            if isinstance(node.ctx, ast.Store) and not node.id.startswith('_'):
                scope = self.current_scope()
                key = (node.id, scope)
                if key not in seen:
                    variables.append({
                        'name': node.id,
                        'type': 'unknown',
                        'scope': scope
                    })
                    seen.add(key)

    ScopeVisitor().visit(tree)
    return variables

json.dumps(analyze_variables('''${escapedCode.replace(/'''/g, "\\'\\'\\'")}'''))
`);

    return JSON.parse(resultJson);

  } catch (error) {
    console.error('Code analysis failed:', error);
    return [];
  }
}
