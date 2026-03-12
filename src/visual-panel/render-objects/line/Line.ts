import { registerVisualElement } from '../../types/elementRegistry';
import type { RenderableObjectData } from '../../types/grid';
import type { ObjDoc, VisualBuilderElementBase } from '../../../api/visualBuilder';
import { rgbToHex } from '../../../api/visualBuilder';

export class Line implements VisualBuilderElementBase {
  type = 'line' as const;
  position: [number, number];
  visible: boolean;
  alpha: number;
  panelId?: string;

  z: number;
  start: [number, number];
  end: [number, number];
  color: [number, number, number];
  strokeWeight: number;
  startOffset: [number, number];
  endOffset: [number, number];
  startCap: 'none' | 'arrow';
  endCap: 'none' | 'arrow';

  constructor(el: any) {
    this.position = el.position ?? [0, 0];
    this.visible = el.visible ?? true;
    this.alpha = el.alpha ?? 1;
    this.z = el.z ?? 0;
    this.panelId = el.panelId;
    this.start = el.start ?? [0, 0];
    this.end = el.end ?? [1, 1];
    this.color = el.color ?? [239, 68, 68];
    this.strokeWeight = el.strokeWeight ?? 2;
    this.startOffset = el.startOffset ?? [0.5, 0.5];
    this.endOffset = el.endOffset ?? [0.5, 0.5];
    this.startCap = el.startCap === 'arrow' ? 'arrow' : 'none';
    this.endCap = el.endCap === 'none' ? 'none' : 'arrow';
  }

  get hexColor(): string {
    return rgbToHex(this.color, '#ef4444');
  }

  draw(): RenderableObjectData {
    return {
      elementInfo: this,
      shapeProps: { width: 1, height: 1 },
    };
  }
}

export const LINE_SCHEMA: ObjDoc = {
  objName: 'Line',
  docstring: 'A line from the center of one cell to another, with optional arrowheads.',
  properties: [
    { name: 'start', type: 'tuple[int, int]', description: 'Start cell (row, col).', default: '(0, 0)' },
    { name: 'end', type: 'tuple[int, int]', description: 'End cell (row, col).', default: '(1, 1)' },
    { name: 'color', type: 'tuple[int, int, int]', description: 'RGB color (0-255 per channel).', default: '(239, 68, 68)' },
    { name: 'stroke_weight', type: 'float', description: 'Line thickness in pixels.', default: '2' },
    { name: 'start_offset', type: 'tuple[float, float]', description: 'Offset within start cell; (0,0)=top-left, (1,1)=bottom-right.', default: '(0.5, 0.5)' },
    { name: 'end_offset', type: 'tuple[float, float]', description: 'Offset within end cell; (0,0)=top-left, (1,1)=bottom-right.', default: '(0.5, 0.5)' },
    { name: 'start_cap', type: "'none' | 'arrow'", description: 'Cap style at the start endpoint.', default: "'none'" },
    { name: 'end_cap', type: "'none' | 'arrow'", description: 'Cap style at the end endpoint.', default: "'arrow'" },
  ],
};

registerVisualElement('line', Line, LINE_SCHEMA);
