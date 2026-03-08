export interface VariableValue {
  type: string;
  value: unknown;
}

export interface TraceStep {
  variables: Record<string, VariableValue>;
  scope: Array<[string, number]>;
}

let codeTimeline: TraceStep[] = [];

export function setCodeTimeline(steps: TraceStep[]): void {
  codeTimeline = steps;
}

export function getCodeStepAt(time: number): TraceStep | undefined {
  if (!Number.isFinite(time)) return undefined;
  return codeTimeline[Math.max(0, Math.floor(time))];
}

export function getCodeTimelineLength(): number {
  return codeTimeline.length;
}
