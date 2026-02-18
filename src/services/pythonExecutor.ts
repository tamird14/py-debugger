import type { Timeline, VariableDictionary } from '../types/grid';
import TRACER_CODE from './pythonTracer.py?raw';
import ANALYZER_CODE from './pythonAnalyzer.py?raw';

// Types for execution results
/** Scope: list of [function_name, line_number] for the call stack (e.g. [["_main_", 5], ["foo", 12]]) */
export type ExecutionScope = Array<[string, number]>;

export interface ExecutionStep {
  lineNumber: number;
  variables: VariableDictionary;
  /** Call stack at this step: (function name, line number) from bottom to top. */
  scope?: ExecutionScope;
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
      scope: Array.isArray(step.scope) ? (step.scope as ExecutionScope) : undefined,
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

    await py.runPythonAsync(ANALYZER_CODE);

    const resultJson = await py.runPythonAsync(`
import json
json.dumps(analyze_variables('''${escapedCode.replace(/'''/g, "\\'\\'\\'")}'''))
`);

    return JSON.parse(resultJson);

  } catch (error) {
    console.error('Code analysis failed:', error);
    return [];
  }
}
