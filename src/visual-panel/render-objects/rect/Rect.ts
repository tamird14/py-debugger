import { registerVisualElement } from "../../types/elementRegistry";
import type { RenderableObjectData } from "../../types/grid";
import type { ClassDoc } from "../../../api/visualBuilder";
import { rgbToHex } from "../../../api/visualBuilder";
import { BasicShape } from "../BasicShape";

export class Rect extends BasicShape {

  constructor(el: any) {
    super('rect', el);
    this.color = el.color ?? [1, 0, 0];
  }

  draw(): RenderableObjectData {
    return {
      elementInfo: this,
      style: { color: rgbToHex(this.color, '#ef0bef'), opacity: this.alpha },
      shapeProps: { width: this.width, height: this.height },
    };
  }
}

export const RECT_SCHEMA: ClassDoc = {
  className: 'Rect',
  constructorParams: 'pos: tuple[int, int] = (0, 0)',
  docstring: 'A rectangle shape on the grid.',
  properties: [
    { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col) of the rectangle.' },
    { name: 'width', type: 'int', description: 'Width in grid cells.' },
    { name: 'height', type: 'int', description: 'Height in grid cells.' },
    { name: 'color', type: 'tuple[int, int, int]', description: 'RGB fill color (0-255 per channel).' },
    { name: 'visible', type: 'bool', description: 'Show or hide the rectangle.' },
  ],
};

registerVisualElement('rect', Rect, RECT_SCHEMA);
