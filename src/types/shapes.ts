import { registerVisualElement } from "./elementRegistry";
import type { CellData } from "./grid";
import type { ClassDoc, VisualBuilderElementBase } from "./visualBuilder";
import { rgbToHex } from "./visualBuilder";

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

// ========================= Rect Shape =========================

export class Rect extends BasicShape {

  constructor(el: any) {
    super('rect', el);
    this.color = el.color ?? [1, 0, 0];
  }

  // Add a drawing method
  draw(): CellData {
    // return the object structure used in useGridState
    return {
      shape: 'rectangle',
      elementInfo: this,
      style: { color: rgbToHex(this.color, '#ef0bef'), opacity: this.alpha },
      bounds: { width: this.width, height: this.height },
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

// ========================= Circle Shape =========================

export class Circle extends BasicShape {

  constructor(el: any) {
    super('circle', el);
    this.color = el.color ?? [1, 0, 0];
  }

  draw() {
    return {
      shape: 'circle',
      style: { color: rgbToHex(this.color, '#3b82f6'), opacity: this.alpha },
      bounds: { width: this.width, height: this.height },
      basicShape: this,
    };
  }
}

export const CIRCLE_SCHEMA: ClassDoc = {
  className: 'Circle',
  constructorParams: 'pos: tuple[int, int] = (0, 0)',
  docstring: 'A circle (or ellipse) shape on the grid.',
  properties: [
    { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col) of the bounding box.' },
    { name: 'width', type: 'int', description: 'Width in grid cells.' },
    { name: 'height', type: 'int', description: 'Height in grid cells.' },
    { name: 'color', type: 'tuple[int, int, int]', description: 'RGB fill color (0-255 per channel).' },
    { name: 'visible', type: 'bool', description: 'Show or hide the circle.' },
  ],
};

registerVisualElement('circle', Circle, CIRCLE_SCHEMA);

// ========================= Arrow Shape =========================

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
      style: { color: rgbToHex(this.color, '#10b981'), opacity: this.alpha },
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