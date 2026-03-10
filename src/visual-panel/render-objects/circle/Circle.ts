import { registerVisualElement } from "../../types/elementRegistry";
import type { ObjDoc } from "../../../api/visualBuilder";
import { rgbToHex } from "../../../api/visualBuilder";
import { BasicShape } from "../BasicShape";

export class Circle extends BasicShape {

  constructor(el: any) {
    super('circle', el);
    this.color = el.color ?? [1, 0, 0];
  }

  draw() {
    return {
      elementInfo: this,
      style: { color: rgbToHex(this.color, '#3b82f6'), opacity: this.alpha },
      shapeProps: { width: this.width, height: this.height },
    };
  }
}

export const CIRCLE_SCHEMA: ObjDoc = {
  objName: 'Circle',
  docstring: 'A circle (or ellipse) shape on the grid.',
  properties: [
    { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col) of the bounding box.', default: '(0, 0)' },
    { name: 'width', type: 'int', description: 'Width in grid cells.', default: '1' },
    { name: 'height', type: 'int', description: 'Height in grid cells.', default: '1' },
    { name: 'color', type: 'tuple[int, int, int]', description: 'RGB fill color (0-255 per channel).', default: '(59, 130, 246)' },
    { name: 'visible', type: 'bool', description: 'Show or hide the circle.', default: 'True' },
  ],
};

registerVisualElement('circle', Circle, CIRCLE_SCHEMA);
