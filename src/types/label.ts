import { registerVisualElement } from "./elementRegistry";
import type { ClassDoc, VisualBuilderElement } from "./visualBuilder";
import { rgbToHex } from "./visualBuilder";

interface CellStyle {
  color?: string;
  opacity?: number;
  fontSize?: number;
}

export class Label implements VisualBuilderElement {
  type: 'label' = 'label';
  position: [number, number];
  visible: boolean = true;
  label?: string;
  width?: number;
  height?: number;
  color?: [number, number, number];
  fontSize?: number;
  alpha: number;
  panelId?: string;

  constructor(el: VisualBuilderElement) {
    this.position = el.position;
    this.visible = el.visible ?? true;
    this.label = el.label;
    this.width = el.width ?? 1;
    this.height = el.height ?? 1;
    this.color = el.color;
    this.fontSize = el.fontSize;
    this.alpha = el.alpha ?? 1;
    this.panelId = el.panelId;
    
  }

  draw() {
    const style: CellStyle = { opacity: this.alpha };
    if (this.color) style.color = rgbToHex(this.color);
    if (this.fontSize != null) style.fontSize = this.fontSize;

    return {
      label_info: this,
      bounds: { width: this.width, height: this.height },
      label: { text: this.label ?? '' },
      ...(Object.keys(style).length > 0 && { style }),
    };
  }
}

export const LABEL_SCHEMA: ClassDoc = {
  className: 'Label',
  constructorParams: 'label: str = ""',
  docstring: 'Text label. Use {var_name} in the text to interpolate variable values.',
  properties: [
    { name: 'label', type: 'str', description: 'Display text. Use {var} for variable interpolation.' },
    { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col).' },
    { name: 'width', type: 'int', description: 'Width in grid cells.' },
    { name: 'height', type: 'int', description: 'Height in grid cells.' },
    { name: 'font_size', type: 'int', description: 'Font size in pixels.' },
    { name: 'color', type: 'tuple[int, int, int]', description: 'RGB text color.' },
    { name: 'visible', type: 'bool', description: 'Show or hide the label.' },
  ],
};

registerVisualElement('label', Label, LABEL_SCHEMA);