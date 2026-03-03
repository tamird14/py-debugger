import type { VisualBuilderElementBase } from "./visualBuilder";

export abstract class BasicShape implements VisualBuilderElementBase {
  type: string;
  position: [number, number];
  visible: boolean = true;
  alpha: number;
  panelId?: string;
  width: number;
  height: number;
  color?: [number, number, number];

  constructor(type: string, el: any) {
    this.type = type;
    this.position = el.position ?? [0, 0];
    this.visible = el.visible ?? true;
    this.alpha = el.alpha ?? 1;
    this.panelId = el.panelId;

    this.width = el.width ?? 1;
    this.height = el.height ?? 1;
    this.color = el.color ?? [1, 0, 0];
  }
}

export class Rect extends BasicShape {

  constructor(el: any) {
    super('rect', el);
    this.color = el.color ?? [1, 0, 0];
  }

  // Add a drawing method
  draw() {
    // return the object structure used in useGridState
    return {
      shape: 'rectangle',
      style: { color: this.color ? this.rgbToHex(this.color) : '#ef0bef', opacity: this.alpha },
      bounds: { width: this.width, height: this.height },
      basicShape: this,
    };
  }

  private rgbToHex(rgb?: [number, number, number]): string {
    if (!rgb) return '#e323c6';
    return '#' + rgb.map(x => Math.max(0, Math.min(255, Math.floor(x))).toString(16).padStart(2,'0')).join('');
  }
}

export class Circle extends BasicShape {

  constructor(el: any) {
    super('circle', el);
    this.color = el.color ?? [1, 0, 0];
  }

  draw() {
    return {
      shape: 'circle',
      style: { color: this.rgbToHex(this.color, '#3b82f6'), opacity: this.alpha },
      bounds: { width: this.width, height: this.height },
      basicShape: this,
    };
  }

  private rgbToHex(rgb?: [number, number, number], defaultColor: string = '#3b82f6') {
    if (!rgb) return defaultColor;
    return '#' + rgb.map(x => Math.max(0, Math.min(255, Math.floor(x))).toString(16).padStart(2,'0')).join('');
  }
}

export class Arrow extends BasicShape {
  orientation: 'up' | 'down' | 'left' | 'right';
  rotation: number;

  constructor(el: any) {
    super('circle', el);
    this.color = el.color ?? [1, 0, 0];
    this.orientation = (el.orientation as 'up' | 'down' | 'left' | 'right') ?? 'up';
    this.rotation = el.rotation ?? 0;
  }

  draw() {
    return {
      shape: 'arrow',
      style: { color: this.rgbToHex(this.color, '#10b981'), opacity: this.alpha },
      bounds: { width: this.width, height: this.height },
      shapeProps: {
        width: this.width,
        height: this.height,
        orientation: this.orientation,
        rotation: this.rotation,
      },
      basicShape: this,
    };
  }

  private rgbToHex(rgb?: [number, number, number], defaultColor: string = '#10b981') {
    if (!rgb) return defaultColor;
    return '#' + rgb.map(x => Math.max(0, Math.min(255, Math.floor(x))).toString(16).padStart(2,'0')).join('');
  }
}