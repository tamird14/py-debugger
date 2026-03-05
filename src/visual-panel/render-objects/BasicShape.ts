import type { VisualBuilderElementBase } from "../../api/visualBuilder";

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
