import type { VisualBuilderElement } from "./visualBuilder";

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
    if (this.color) style.color = this.rgbToHex(this.color);
    if (this.fontSize != null) style.fontSize = this.fontSize;

    return {
      label_info: this,
      bounds: { width: this.width, height: this.height },
      label: { text: this.label ?? '' },
      ...(Object.keys(style).length > 0 && { style }),
    };
  }

  private rgbToHex(rgb?: [number, number, number], defaultColor: string = '#000000') {
    if (!rgb) return defaultColor;
    return '#' + rgb.map(x => Math.max(0, Math.min(255, Math.floor(x))).toString(16).padStart(2,'0')).join('');
  }

}