import { registerVisualElement } from "../../types/elementRegistry";
import type { ClassDoc } from "../../../api/visualBuilder";
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

export const ARROW_SCHEMA: ClassDoc = {
  className: 'Arrow',
  constructorParams: 'pos: tuple[int, int] = (0, 0)',
  docstring: 'An arrow shape on the grid. Points in the given orientation and can be rotated.',
  properties: [
    { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col) of the bounding box.' },
    { name: 'width', type: 'int', description: 'Width in grid cells.' },
    { name: 'height', type: 'int', description: 'Height in grid cells.' },
    { name: 'color', type: 'tuple[int, int, int]', description: 'RGB fill color (0-255 per channel).' },
    { name: 'orientation', type: 'str', description: '"up", "down", "left", or "right". Default "up".' },
    { name: 'rotation', type: 'int', description: 'Additional rotation in degrees. Default 0.' },
    { name: 'visible', type: 'bool', description: 'Show or hide the arrow.' },
  ],
};

registerVisualElement('arrow', Arrow, ARROW_SCHEMA);
