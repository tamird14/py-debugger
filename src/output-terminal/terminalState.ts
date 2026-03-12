export type LineSource = 'debugger' | 'builder' | 'marker' | 'error';

export interface TerminalLine {
  text: string;
  source: LineSource;
}

function toLines(text: string, source: LineSource): TerminalLine[] {
  if (!text) return [];
  const parts = text.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts.map((t) => ({ text: t, source }));
}

function ensureNewline(s: string): string {
  return s && !s.endsWith('\n') ? s + '\n' : s;
}

// ── Static builder output ─────────────────────────────────────────────────────
// Captured once when exec(visualBuilderCode) runs.
let _builderInitOutput = '';

export function setBuilderOutput(text: string): void {
  _builderInitOutput = text;
  _notify();
}
export function getBuilderOutput(): string {
  return _builderInitOutput;
}

// ── Current segment ───────────────────────────────────────────────────────────
// Per-step deltas for the segment currently being navigated.
let _currentDebuggerSteps: string[] = [];
let _currentBuilderSteps: string[] = [];

export function setCurrentStepOutputs(outputs: string[]): void {
  _currentDebuggerSteps = outputs;
  _notify();
}
export function setBuilderStepOutputs(outputs: string[]): void {
  _currentBuilderSteps = outputs;
  _notify();
}

// ── Committed output (past segments) ─────────────────────────────────────────
// Debugger tab: plain concatenated string of all past debugger output + markers.
let _committedDebugger = '';
// Builder tab: plain concatenated string of all past builder-step output + click output.
let _committedBuilder = '';
// Combined tab: structured lines with source, ready to render with colours.
let _committedCombinedLines: TerminalLine[] = [];

/**
 * Append a marker line (e.g. '----- end trace -----') to the debugger and
 * combined committed streams.
 */
export function appendMarker(text: string): void {
  _committedDebugger = ensureNewline(_committedDebugger) + text + '\n';
  _committedCombinedLines.push({ text, source: 'marker' });
  _notify();
}

/**
 * Append click-handler output immediately (before the debug call it may trigger).
 * Goes into both the builder stream and the combined stream.
 */
export function appendClickOutput(text: string): void {
  if (!text) return;
  _committedBuilder = ensureNewline(_committedBuilder) + text;
  _committedCombinedLines.push(...toLines(text, 'builder'));
  _notify();
}

/**
 * Append an error to the terminal in red (combined tab) and as plain text in
 * the builder stream. Use this for any execution error: click handlers,
 * builder code, debugger code, etc.
 */
export function appendError(text: string): void {
  if (!text) return;
  _committedBuilder = ensureNewline(_committedBuilder) + text + '\n';
  _committedCombinedLines.push(...toLines(text, 'error'));
  _notify();
}

/**
 * Seal the current segment: interleave debugger + builder step outputs into
 * the committed streams, then optionally add an end marker.
 */
export function commitCurrentSegment(endMarker?: string): void {
  // Debugger stream: flat concat
  _committedDebugger = ensureNewline(_committedDebugger) + _currentDebuggerSteps.join('');

  // Builder stream: flat concat of per-step builder output
  const builderSegment = _currentBuilderSteps.join('');
  if (builderSegment) {
    _committedBuilder = ensureNewline(_committedBuilder) + builderSegment;
  }

  // Combined stream: interleave step by step
  const len = Math.max(_currentDebuggerSteps.length, _currentBuilderSteps.length);
  for (let i = 0; i < len; i++) {
    _committedCombinedLines.push(...toLines(_currentDebuggerSteps[i] ?? '', 'debugger'));
    _committedCombinedLines.push(...toLines(_currentBuilderSteps[i] ?? '', 'builder'));
  }

  if (endMarker) {
    _committedDebugger = ensureNewline(_committedDebugger) + endMarker + '\n';
    _committedCombinedLines.push({ text: endMarker, source: 'marker' });
  }

  _currentDebuggerSteps = [];
  _currentBuilderSteps = [];
  _notify();
}

// ── Getters ───────────────────────────────────────────────────────────────────

/** Debugger tab: plain text, reactive to currentStep. */
export function getDebuggerOutput(currentStep: number): string {
  return _committedDebugger + _currentDebuggerSteps.slice(0, currentStep + 1).join('');
}

/** Builder tab: plain text of init + committed builder steps + current builder steps. */
export function getBuilderStepOutput(currentStep: number): string {
  return _committedBuilder + _currentBuilderSteps.slice(0, currentStep + 1).join('');
}

/**
 * Combined tab: structured lines — committed combined + current segment
 * interleaved up to currentStep.
 */
export function getCombinedLines(currentStep: number): TerminalLine[] {
  const lines = [..._committedCombinedLines];
  const len = Math.min(
    currentStep + 1,
    Math.max(_currentDebuggerSteps.length, _currentBuilderSteps.length),
  );
  for (let i = 0; i < len; i++) {
    lines.push(...toLines(_currentDebuggerSteps[i] ?? '', 'debugger'));
    lines.push(...toLines(_currentBuilderSteps[i] ?? '', 'builder'));
  }
  return lines;
}

export function clearAll(): void {
  _builderInitOutput = '';
  _committedDebugger = '';
  _committedBuilder = '';
  _committedCombinedLines = [];
  _currentDebuggerSteps = [];
  _currentBuilderSteps = [];
  _notify();
}

// ── Change notification ────────────────────────────────────────────────────
let _version = 0;
const _listeners = new Set<() => void>();

function _notify(): void {
  _version++;
  _listeners.forEach((fn) => fn());
}

export function subscribeTerminal(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getTerminalVersion(): number {
  return _version;
}
