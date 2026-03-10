// ── Builder output ───────────────────────────────────────────────────────────
// Static output captured once when exec(visualBuilderCode) runs.
let _builderOutput = '';

export function setBuilderOutput(text: string): void {
  _builderOutput = text;
}

export function getBuilderOutput(): string {
  return _builderOutput;
}

// ── Debugger output stream ────────────────────────────────────────────────────
// Output from all finished trace/debug-call segments, including their markers.
let _committedOutput = '';
// Per-step output deltas for the currently active trace or debug call.
let _currentStepOutputs: string[] = [];

/** Replace the current segment's per-step deltas (called after each trace/debug-call run). */
export function setCurrentStepOutputs(outputs: string[]): void {
  _currentStepOutputs = outputs;
}

/**
 * Append a marker line to the committed output (e.g. at the start of a debug call).
 * A leading newline is added when there is already committed content so the marker
 * always starts on its own line.
 */
export function appendMarker(text: string): void {
  if (_committedOutput && !_committedOutput.endsWith('\n')) {
    _committedOutput += '\n';
  }
  _committedOutput += text + '\n';
}

/**
 * Seal the current segment: join all its step outputs, optionally append an end marker,
 * then move everything into _committedOutput and clear the current segment.
 */
export function commitCurrentSegment(endMarker?: string): void {
  const segmentOutput = _currentStepOutputs.join('');
  if (segmentOutput) {
    if (_committedOutput && !_committedOutput.endsWith('\n')) {
      _committedOutput += '\n';
    }
    _committedOutput += segmentOutput;
  }
  if (endMarker) {
    if (_committedOutput && !_committedOutput.endsWith('\n')) {
      _committedOutput += '\n';
    }
    _committedOutput += endMarker + '\n';
  }
  _currentStepOutputs = [];
}

/**
 * Returns the debugger stream text: everything committed so far plus the
 * current segment's output up to (and including) the given step index.
 */
export function getTerminalOutput(currentStep: number): string {
  return _committedOutput + _currentStepOutputs.slice(0, currentStep + 1).join('');
}

// ── Click / event output ──────────────────────────────────────────────────────
// Output captured from visual-builder click handlers, accumulated across events.
let _clickOutputs: string[] = [];

export function appendClickOutput(text: string): void {
  if (text) _clickOutputs.push(text);
}

export function getClickOutput(): string {
  return _clickOutputs.join('');
}

// ── Reset ─────────────────────────────────────────────────────────────────────
export function clearAll(): void {
  _builderOutput = '';
  _committedOutput = '';
  _currentStepOutputs = [];
  _clickOutputs = [];
}
