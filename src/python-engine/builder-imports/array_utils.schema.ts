import type { ObjDoc } from '../../api/visualBuilder';

export const ARRAY_UTILS_SCHEMA: ObjDoc = {
  objName: 'import array_utils',
  docstring: 'Utility helpers for array builder visualizations. Add `import array_utils` at the top of your builder code.',
  properties: [
    { name: 'highlight_range(arr_elem, lo, hi, color)', type: '', description: 'Set fill color on indices lo..hi (inclusive) of an Array element.', default: "color='orange'" },
  ],
};
