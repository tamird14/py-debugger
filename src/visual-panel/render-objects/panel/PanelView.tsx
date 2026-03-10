import type { ObjDoc } from '../../../api/visualBuilder';
import { registerRenderer } from '../../views/rendererRegistry';
import { useTheme } from '../../../contexts/ThemeContext';
import type { CellStyle } from '../../types/grid';

export class PanelCell {
  type = 'panel' as const;
  id: string;
  title?: string;
  style?: CellStyle;

  constructor(opts: { id: string; title?: string; style?: CellStyle }) {
    this.id = opts.id;
    this.title = opts.title;
    this.style = opts.style;
  }
}

interface PanelCellViewProps {
  panel: PanelCell;
}

export function PanelCellView({ panel }: PanelCellViewProps) {
  const { darkMode } = useTheme();
  const titleColor = panel.style?.color || (darkMode ? '#cbd5e1' : '#64748b');

  return (
    <div className="absolute inset-0 border-2 border-dashed border-slate-400 dark:border-slate-500 bg-slate-50/50 dark:bg-slate-800/50">
      {panel.title && (
        <span
          className="absolute -top-3 left-1 text-[10px] font-mono bg-slate-50 dark:bg-slate-800 px-1"
          style={{ color: titleColor }}
        >
          {panel.title}
        </span>
      )}
    </div>
  );
}

registerRenderer<PanelCell>('panel', (element) => (
  <PanelCellView panel={element as PanelCell} />
));

export const PANEL_SCHEMA: ObjDoc = {
  objName: 'Panel',
  docstring: 'Container for grouping visual elements. Use add(elem) and remove(elem) to manage children.',
  properties: [
    { name: 'name', type: 'str', description: 'Panel title.', default: '"Panel"' },
    { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col).', default: '(0, 0)' },
    { name: 'width', type: 'int', description: 'Width in grid cells.', default: '5' },
    { name: 'height', type: 'int', description: 'Height in grid cells.', default: '5' },
    { name: 'visible', type: 'bool', description: 'Whether the panel is shown.', default: 'True' },
  ],
  methods: [
    { name: 'add', signature: 'add(elem: VisualElem)', docstring: 'Add a visual element to this panel.' },
    { name: 'remove', signature: 'remove(elem: VisualElem)', docstring: 'Remove a visual element from this panel.' },
  ],
};
