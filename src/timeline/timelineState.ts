import type { VisualBuilderElementBase } from '../api/visualBuilder';
import { getConstructor } from '../visual-panel/types/elementRegistry';

let timeline: VisualBuilderElementBase[][] = [];
let maxTime = 0;

export function clearTimeline() {
  timeline = [];
  maxTime = 0;
}

export function hydrateTimelineFromJson(timelineJson: string): VisualBuilderElementBase[] {
  const raw = JSON.parse(timelineJson) as VisualBuilderElementBase[][];

  timeline = raw.map((snapshot) =>
    snapshot.map((el) => {
      const entry = getConstructor(el.type);
      if (entry) {
        return new entry(el);
      }
      return el;
    }),
  );

  maxTime = timeline.length > 0 ? timeline.length - 1 : 0;
  return timeline[0] ?? [];
}

export function getTimeline(): VisualBuilderElementBase[][] {
  return timeline;
}

export function getMaxTime(): number {
  return maxTime;
}

export function getStateAt(time: number): VisualBuilderElementBase[] | undefined {
  if (!Number.isFinite(time)) return undefined;
  const t = Math.max(0, Math.min(maxTime, Math.floor(time)));
  return timeline[t];
}

