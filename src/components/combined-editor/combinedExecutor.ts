import { loadPyodide } from '../../python-engine/code-builder/services/pythonExecutor';

import type { VisualBuilderElementBase } from '../../api/visualBuilder';
import VISUAL_BUILDER_PYTHON from './visualBuilder.py?raw';

export interface CombinedVariable {
  type: string;
  value: unknown;
}

export interface CombinedStep {
  visual: VisualBuilderElementBase[];
  variables: Record<string, CombinedVariable>;
}

export interface CombinedResult {
  success: boolean;
  timeline: CombinedStep[];
  error?: string;
  output?: string;
}

/**
 * Inject __record_snapshot__(dict(locals())) after each # @end line.
 * The original comment is preserved; the call is added on the next line
 * with the same indentation as the # @end line.
 */
function preprocess(code: string): string {
  return code
    .split('\n')
    .flatMap(line => {
      if (line.trim() === '# @end') {
        const indent = line.match(/^(\s*)/)?.[1] ?? '';
        return [line, `${indent}__record_snapshot__(dict(locals()))`];
      }
      return [line];
    })
    .join('\n');
}

function escapeTripleQuote(s: string): string {
  // Escape ''' so the string can be safely embedded in Python '''...'''
  return s.replace(/'''/g, "\\'\\'\\'");
}

const SNAPSHOT_HELPER = `
import json as _json

_combined_timeline = []

def __record_snapshot__(frame_locals):
    # Auto-update elements so var_name bindings reflect current locals
    for elem in VisualElem._registry:
        elem.update([], frame_locals)
    visual_json = _serialize_visual_builder()
    visual = _json.loads(visual_json)
    # Serialize variables: primitives, lists, 2d-lists only
    variables = {}
    for k, v in frame_locals.items():
        if k.startswith('_') or k == '__record_snapshot__':
            continue
        if isinstance(v, (int, float, str, bool)):
            variables[k] = {'type': type(v).__name__, 'value': v}
        elif isinstance(v, (list, tuple)):
            if len(v) == 0:
                variables[k] = {'type': 'list', 'value': []}
            elif isinstance(v[0], (list, tuple)):
                variables[k] = {'type': 'list2d', 'value': [list(row) for row in v]}
            else:
                variables[k] = {'type': 'list', 'value': list(v)}
    _combined_timeline.append({'visual': visual, 'variables': variables})
`;

/**
 * Execute combined Python code (with # @viz / # @end blocks) and return
 * a timeline of snapshots, one per # @end marker.
 */
export async function executeCombinedCode(code: string): Promise<CombinedResult> {
  try {
    const py = await loadPyodide();

    // Load visual builder classes and serialization helpers
    await py.runPythonAsync(VISUAL_BUILDER_PYTHON);

    // Reset element registry
    await py.runPythonAsync('VisualElem._registry = []');

    // Load snapshot helper (defines __record_snapshot__ and _combined_timeline)
    await py.runPythonAsync(SNAPSHOT_HELPER);

    // Preprocess user code
    const preprocessed = preprocess(code);
    const escaped = escapeTripleQuote(preprocessed);

    // Capture stdout
    await py.runPythonAsync(`
import sys as _sys
import io as _io
_stdout_capture = _io.StringIO()
_sys.stdout = _stdout_capture
`);

    try {
      await py.runPythonAsync(`exec('''${escaped}''', {
    **{k: v for k, v in globals().items() if not k.startswith('__')},
    '__builtins__': __builtins__,
    '__record_snapshot__': __record_snapshot__,
})`);
    } finally {
      await py.runPythonAsync(`_sys.stdout = _sys.__stdout__`);
    }

    const output: string = await py.runPythonAsync(`_stdout_capture.getvalue()`);
    const timelineJson: string = await py.runPythonAsync(`_json.dumps(_combined_timeline)`);
    const timeline = JSON.parse(timelineJson) as CombinedStep[];

    return { success: true, timeline, output };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    let cleanError = errorMessage;
    if (errorMessage.includes('PythonError:')) {
      cleanError = errorMessage.split('PythonError:')[1]?.trim() || errorMessage;
    }
    return { success: false, timeline: [], error: cleanError };
  }
}
