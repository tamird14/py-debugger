import { registerVisualElement } from "../../types/elementRegistry";
import type { ObjDoc, VisualBuilderElementBase } from "../../../api/visualBuilder";
import { rgbToHex } from "../../../api/visualBuilder";

interface CellStyle {
  color?: string;
  opacity?: number;
  fontSize?: number;
}

export class Label implements VisualBuilderElementBase {
  type: 'label' = 'label';
  position: [number, number];
  visible: boolean = true;
  label?: string;
  width?: number;
  height?: number;
  color?: [number, number, number];
  fontSize?: number;
  alpha: number;
  z: number;
  panelId?: string;

  constructor(el: any) {
    this.position = el.position;
    this.visible = el.visible ?? true;
    this.label = el.label;
    this.width = el.width ?? 1;
    this.height = el.height ?? 1;
    this.color = el.color;
    this.fontSize = el.fontSize;
    this.alpha = el.alpha ?? 1;
    this.z = el.z ?? 0;
    this.panelId = el.panelId;
    
  }

  draw() {
    const style: CellStyle = { opacity: this.alpha };
    if (this.color) style.color = rgbToHex(this.color);
    if (this.fontSize != null) style.fontSize = this.fontSize;

    return {
      elementInfo: this as any,
      shapeProps: { width: this.width, height: this.height },
      ...(Object.keys(style).length > 0 && { style }),
    };
  }
}

export const LABEL_SCHEMA: ObjDoc = {
  objName: 'Label',
  docstring: 'Text label.',
  properties: [
    { name: 'label', type: 'str', description: 'Display text.', default: '""' },
    { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col).', default: '(0, 0)' },
    { name: 'width', type: 'int', description: 'Width in grid cells.', default: '1' },
    { name: 'height', type: 'int', description: 'Height in grid cells.', default: '1' },
    { name: 'font_size', type: 'int', description: 'Font size in pixels.', default: '14' },
    { name: 'color', type: 'tuple[int, int, int] | None', description: 'RGB text color.', default: 'None' },
    { name: 'visible', type: 'bool', description: 'Show or hide the label.', default: 'True' },
  ],
};

registerVisualElement('label', Label, LABEL_SCHEMA);
