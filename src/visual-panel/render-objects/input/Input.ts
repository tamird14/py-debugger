import { registerVisualElement } from "../../types/elementRegistry";
import type { RenderableObjectData } from "../../types/grid";
import type { ObjDoc } from "../../../api/visualBuilder";
import { rgbToHex } from "../../../api/visualBuilder";
import { BasicShape } from "../BasicShape";

export class InputElem extends BasicShape {
  value: string;
  placeholder: string;

  constructor(el: any) {
    super('input', el);
    this.color = el.color ?? [99, 102, 241];
    this.value = el.value ?? '';
    this.placeholder = el.placeholder ?? '';
  }

  draw(): RenderableObjectData {
    return {
      elementInfo: this,
      style: { color: rgbToHex(this.color, '#6366f1'), opacity: this.alpha },
      shapeProps: { width: this.width, height: this.height },
    };
  }
}

export const INPUT_SCHEMA: ObjDoc = {
  objName: 'Input',
  docstring: 'A text-input box on the grid. In interactive mode, clicking it opens an inline text field; pressing Enter calls input_changed(text).',
  properties: [
    { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col).', default: '(0, 0)' },
    { name: 'width', type: 'int', description: 'Width in grid cells.', default: '3' },
    { name: 'height', type: 'int', description: 'Height in grid cells.', default: '1' },
    { name: 'color', type: 'tuple[int, int, int]', description: 'RGB fill color.', default: '(99, 102, 241)' },
    { name: 'value', type: 'str', description: 'Current text value.', default: '""' },
    { name: 'placeholder', type: 'str', description: 'Placeholder text shown when value is empty.', default: '""' },
    { name: 'visible', type: 'bool', description: 'Show or hide the element.', default: 'True' },
    { name: 'z', type: 'int', description: 'Depth layer.', default: '0' },
  ],
  methods: [
    { name: 'input_changed', signature: 'input_changed(text: str)', docstring: 'Called when the user submits text. Override to add custom logic. Default sets self.value = text.' },
    { name: 'get_input', signature: 'get_input() -> str', docstring: 'Return the current text value.' },
    { name: 'delete', signature: 'delete()', docstring: 'Remove this element from the canvas.' },
  ],
};

registerVisualElement('input', InputElem, INPUT_SCHEMA);
