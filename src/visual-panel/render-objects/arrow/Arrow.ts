import { registerVisualElement } from "../../types/elementRegistry";
import type { ObjDoc } from "../../../api/visualBuilder";
import { rgbToHex } from "../../../api/visualBuilder";
import { BasicShape } from "../BasicShape";

export class Arrow extends BasicShape {
  orientation: 'up' | 'down' | 'left' | 'right';
  rotation: number;

  constructor(el: any) {
    super('arrow', el);
    this.color = el.color ?? [1, 0, 0];
    this.orientation = (el.orientation as 'up' | 'down' | 'left' | 'right') ?? 'up';
    this.rotation = el.rotation ?? 0;
  }

  draw() {
    return {
      elementInfo: this,
      style: { color: rgbToHex(this.color, '#10b981'), opacity: this.alpha },
      shapeProps: {
        width: this.width,
        height: this.height,
        orientation: this.orientation,
        rotation: this.rotation,
      },
    };
  }
}

export const ARROW_SCHEMA: ObjDoc = {
  objName: 'Arrow',
  docstring: 'An arrow shape on the grid. Points in the given orientation and can be rotated.',
  properties: [
    { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col) of the bounding box.', default: '(0, 0)' },
    { name: 'width', type: 'int', description: 'Width in grid cells.', default: '1' },
    { name: 'height', type: 'int', description: 'Height in grid cells.', default: '1' },
    { name: 'color', type: 'tuple[int, int, int]', description: 'RGB fill color (0-255 per channel).', default: '(16, 185, 129)' },
    { name: 'orientation', type: 'str', description: '"up", "down", "left", or "right".', default: '"up"' },
    { name: 'rotation', type: 'int', description: 'Additional rotation in degrees.', default: '0' },
    { name: 'visible', type: 'bool', description: 'Show or hide the arrow.', default: 'True' },
  ],
};

registerVisualElement('arrow', Arrow, ARROW_SCHEMA);
