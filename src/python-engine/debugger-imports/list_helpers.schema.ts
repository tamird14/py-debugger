import type { ObjDoc } from '../../api/visualBuilder';

export const LIST_HELPERS_SCHEMA: ObjDoc = {
  objName: 'import list_helpers',
  docstring: 'Utility helpers for list/array algorithm debugging. Add `import list_helpers` at the top of your debugger code.',
  properties: [
    { name: 'swap(lst, i, j)', type: '', description: 'Swap lst[i] and lst[j] in place.' },
  ],
};
