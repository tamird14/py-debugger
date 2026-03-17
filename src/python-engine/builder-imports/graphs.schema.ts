import type { ObjDoc } from '../../api/visualBuilder';

export const GRAPHS_SCHEMA: ObjDoc = {
  objName: 'import graphs',
  docstring: 'Tree layout utilities. Add `import graphs` at the top of your builder code.',
  properties: [
    {
      name: 'compute_rel_positions(tree, root)',
      type: '',
      description:
        'Compute relative x-offsets for each node in a binary tree for rendering. ' +
        'tree is a dict mapping node → (left_child, right_child) or (None, None) for leaves. ' +
        'root is the root node key. ' +
        'Returns a dict {node: x_delta} where x_delta is a float offset from the parent node.',
    },
  ],
};
