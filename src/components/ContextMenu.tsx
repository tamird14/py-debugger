import { useEffect, useMemo, useRef, useState } from 'react';
import type { ShapeType, VariableDictionary, Variable, CellData, CellStyle, CellPosition, PositionBinding, PositionComponent, ShapeProps, ArrowOrientation, NumericExpression, SizeValue } from '../types/grid';
import { Circle, Square, Arrow } from './shapes';
import { validateExpression } from '../utils/expressionEvaluator';

// Parse expression string to NumericExpression: pure integer -> fixed, else expression
function parseToNumericExpression(s: string, clamp?: { min: number; max: number }): NumericExpression {
  const trimmed = s.trim();
  const asInt = /^-?\d+$/.test(trimmed) ? parseInt(trimmed, 10) : NaN;
  if (!Number.isNaN(asInt)) {
    const v = clamp ? Math.max(clamp.min, Math.min(clamp.max, asInt)) : asInt;
    return { type: 'fixed', value: v };
  }
  return trimmed ? { type: 'expression', expression: trimmed } : { type: 'fixed', value: clamp?.min ?? 0 };
}

interface PanelSettingsData {
  id: string;
  row: number;
  col: number;
  width: number;
  height: number;
  title?: string;
}

type ValidateProposedOverTimeline = (proposed: {
  row?: PositionComponent;
  col?: PositionComponent;
  width?: SizeValue;
  height?: SizeValue;
}) => string | null;

interface ContextMenuProps {
  position: { x: number; y: number };
  variables: VariableDictionary;
  validateProposedOverTimeline?: ValidateProposedOverTimeline;
  cellData?: CellData;
  cellPosition?: CellPosition;
  intVariableNames: string[];
  onSelect: (shape: ShapeType | null, panelContext?: { id: string; origin: CellPosition }) => void;
  onAddLabel: (text: string, width: number, height: number, panelContext?: { id: string; origin: CellPosition }) => void;
  onAddPanel: (title: string, width: number, height: number) => void;
  onPlaceVariable: (name: string, variable: Variable, panelContext?: { id: string; origin: CellPosition }) => void;
  onUpdateStyle: (style: Partial<CellStyle>) => void;
  onMoveCell: (newPosition: CellPosition) => void;
  onSetPositionBinding: (binding: PositionBinding) => void;
  onUpdateShapeProps: (shapeProps: Partial<ShapeProps>) => void;
  onUpdateArrayDirection: (direction: 'right' | 'left' | 'down' | 'up') => void;
  onUpdateIntVarDisplay: (display: 'name-value' | 'value-only') => void;
  onSetPanelForObject: (panelId: string | null) => void;
  panelOptions: Array<{ id: string; title: string }>;
  panelContext?: { id: string; origin: CellPosition; width: number; height: number };
  panelSettingsData?: PanelSettingsData;
  onUpdatePanel?: (panelId: string, updates: { title?: string; width?: number; height?: number }) => void;
  onDeletePanel?: (panelId: string, keepChildren: boolean) => void;
  onClose: () => void;
}

type MenuLevel =
  | 'main'
  | 'add'
  | 'shapes'
  | 'variables'
  | 'label-input'
  | 'panel-input'
  | 'settings'
  | 'settings-color'
  | 'settings-thickness'
  | 'settings-position'
  | 'settings-size'
  | 'settings-rotation'
  | 'settings-orientation'
  | 'settings-array-direction'
  | 'settings-int-display'
  | 'settings-panel'
  | 'settings-font-size'
  | 'panel-settings'
  | 'panel-settings-title'
  | 'panel-settings-size';

const PRESET_COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
];

const LINE_WIDTHS = [1, 2, 3, 4, 5];

const DEFAULT_SHAPE_COLORS: Record<ShapeType, string> = {
  rectangle: '#22c55e',
  square: '#22c55e',
  circle: '#3b82f6',
  arrow: '#ef4444',
};

const shapeItems: { type: ShapeType; label: string; Icon: React.ComponentType<{ color?: string }>; defaultColor: string }[] = [
  { type: 'circle', label: 'Circle', Icon: Circle, defaultColor: DEFAULT_SHAPE_COLORS.circle },
  { type: 'rectangle', label: 'Rectangle', Icon: Square, defaultColor: DEFAULT_SHAPE_COLORS.rectangle },
  { type: 'arrow', label: 'Arrow', Icon: Arrow, defaultColor: DEFAULT_SHAPE_COLORS.arrow },
];

export function ContextMenu({
  position,
  variables,
  validateProposedOverTimeline,
  cellData,
  cellPosition,
  intVariableNames,
  onSelect,
  onAddLabel,
  onAddPanel,
  onPlaceVariable,
  onUpdateStyle,
  onMoveCell: _onMoveCell,
  onSetPositionBinding,
  onUpdateShapeProps,
  onUpdateArrayDirection,
  onUpdateIntVarDisplay,
  onSetPanelForObject,
  panelOptions,
  panelContext,
  panelSettingsData,
  onUpdatePanel,
  onDeletePanel,
  onClose,
}: ContextMenuProps) {
  void _onMoveCell; // Kept for backward compatibility
  const menuRef = useRef<HTMLDivElement>(null);
  const hasContent = !!(cellData?.shape || cellData?.arrayInfo || cellData?.intVar);
  const isPanelSettings = !!panelSettingsData;
  const [menuLevel, setMenuLevel] = useState<MenuLevel>(isPanelSettings ? 'panel-settings' : hasContent ? 'settings' : 'main');
  const [labelText, setLabelText] = useState('Label');
  const [labelWidth, setLabelWidth] = useState('3');
  const [labelHeight, setLabelHeight] = useState('1');
  const [panelTitle, setPanelTitle] = useState('Panel');
  const [panelWidth, setPanelWidth] = useState('6');
  const [panelHeight, setPanelHeight] = useState('4');

  // Panel settings (editing existing panel)
  const [editPanelTitle, setEditPanelTitle] = useState(panelSettingsData?.title || '');
  const [editPanelWidth, setEditPanelWidth] = useState((panelSettingsData?.width || 6).toString());
  const [editPanelHeight, setEditPanelHeight] = useState((panelSettingsData?.height || 4).toString());

  const rowInputRef = useRef<HTMLInputElement>(null);

  // Position binding state
  const currentBinding = cellData?.positionBinding;
  const [panelOverrideActive, setPanelOverrideActive] = useState(false);
  const [panelOverride, setPanelOverride] = useState<{ origin: CellPosition } | null>(null);
  useEffect(() => {
    if (panelContext && !panelOverrideActive) {
      setPanelOverride({ origin: panelContext.origin });
    }
  }, [panelContext, panelOverrideActive]);
  const getInitialExpr = (component: PositionComponent | undefined, fallback: string): string => {
    if (!component) return fallback;
    if (component.type === 'fixed' || component.type === 'hardcoded') return component.value.toString();
    if (component.type === 'variable') return component.varName;
    if (component.type === 'expression') return component.expression;
    return fallback;
  };
  const [rowExpression, setRowExpression] = useState(
    getInitialExpr(currentBinding?.row, cellPosition?.row.toString() || '0')
  );
  const [colExpression, setColExpression] = useState(
    getInitialExpr(currentBinding?.col, cellPosition?.col.toString() || '0')
  );
  const [rowExprError, setRowExprError] = useState<string | null>(null);
  const [colExprError, setColExprError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [variablePickerFor, setVariablePickerFor] = useState<'row' | 'col' | null>(null);
  const colInputRef = useRef<HTMLInputElement>(null);

  const insertVariableInto = (field: 'row' | 'col', varName: string) => {
    const ref = field === 'row' ? rowInputRef : colInputRef;
    const setter = field === 'row' ? setRowExpression : setColExpression;
    const current = field === 'row' ? rowExpression : colExpression;
    if (!ref.current) return;
    const el = ref.current;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const next = current.slice(0, start) + varName + current.slice(end);
    setter(next);
    setVariablePickerFor(null);
    setTimeout(() => { el.focus(); el.setSelectionRange(start + varName.length, start + varName.length); }, 0);
  };

  const insertVariableIntoSize = (field: 'width' | 'height', varName: string) => {
    const ref = field === 'width' ? widthInputRef : heightInputRef;
    const setter = field === 'width' ? setShapeWidth : setShapeHeight;
    const current = field === 'width' ? shapeWidth : shapeHeight;
    if (!ref.current) return;
    const el = ref.current;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const next = current.slice(0, start) + varName + current.slice(end);
    setter(next);
    setSizePickerFor(null);
    setTimeout(() => { el.focus(); el.setSelectionRange(start + varName.length, start + varName.length); }, 0);
  };

  const variableEntries = Object.entries(variables);
  const intVariables = variableEntries.filter(([, v]) => v.type === 'int' || v.type === 'float');
  const arrayVariables = variableEntries.filter(([, v]) => v.type === 'arr[int]' || v.type === 'arr[str]');
  const hasVariables = variableEntries.length > 0;
  const allVariableNames = useMemo(
    () => [...intVariableNames, ...arrayVariables.map(([n]) => n)],
    [intVariableNames, arrayVariables]
  );

  const getSizeInitial = (v: SizeValue | undefined): string => {
    if (v === undefined) return '1';
    if (typeof v === 'number') return String(v);
    if (v.type === 'fixed') return String(v.value);
    return v.expression;
  };

  const currentColor = cellData?.style?.color;
  const currentLineWidth = cellData?.style?.lineWidth || 1;
  const currentOpacity = cellData?.style?.opacity ?? 1;
  const [customColorValue, setCustomColorValue] = useState(currentColor || '#94a3b8');
  const [customOpacityValue, setCustomOpacityValue] = useState((currentOpacity * 100).toString());
  const arrowOrientation = (cellData?.shapeProps?.orientation || 'up') as ArrowOrientation;
  const [shapeWidth, setShapeWidth] = useState(
    getSizeInitial(cellData?.shapeSizeBinding?.width ?? cellData?.shapeProps?.width ?? 1)
  );
  const [shapeHeight, setShapeHeight] = useState(
    getSizeInitial(cellData?.shapeSizeBinding?.height ?? cellData?.shapeProps?.height ?? 1)
  );
  const [sizePickerFor, setSizePickerFor] = useState<'width' | 'height' | null>(null);
  const widthInputRef = useRef<HTMLInputElement>(null);
  const heightInputRef = useRef<HTMLInputElement>(null);
  const isUniformShape = cellData?.shape === 'circle';
  const [shapeRotation, setShapeRotation] = useState(
    (cellData?.shapeProps?.rotation || 0).toString()
  );
  const arrayDirection = cellData?.arrayInfo?.direction || 'right';
  const intDisplay = cellData?.intVar?.display || 'name-value';
  const [fontSizeValue, setFontSizeValue] = useState(
    (cellData?.style?.fontSize || 12).toString()
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (menuLevel !== 'main') {
          setMenuLevel('main');
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, menuLevel]);

  useEffect(() => {
    if (menuLevel === 'settings-size') {
      setShapeWidth(getSizeInitial(cellData?.shapeSizeBinding?.width ?? cellData?.shapeProps?.width ?? 1));
      setShapeHeight(getSizeInitial(cellData?.shapeSizeBinding?.height ?? cellData?.shapeProps?.height ?? 1));
    }
  }, [menuLevel]);

  useEffect(() => {
    if (menuLevel === 'settings-position' && rowInputRef.current) {
      rowInputRef.current.focus();
      rowInputRef.current.select();
    }
  }, [menuLevel]);

  const handleAddLabel = () => {
    const width = Math.max(1, parseInt(labelWidth, 10) || 1);
    const height = Math.max(1, parseInt(labelHeight, 10) || 1);
    onAddLabel(labelText, width, height, panelContext ? { id: panelContext.id, origin: panelContext.origin } : undefined);
    onClose();
  };

  const handleAddPanel = () => {
    const width = Math.max(1, parseInt(panelWidth, 10) || 1);
    const height = Math.max(1, parseInt(panelHeight, 10) || 1);
    onAddPanel(panelTitle, width, height);
    onClose();
  };

  const handleApplyPositionBinding = () => {
    setApplyError(null);
    const rowError = rowExpression.trim() && validateExpression(rowExpression, variables);
    const colError = colExpression.trim() && validateExpression(colExpression, variables);
    if (rowError) { setRowExprError(rowError); return; }
    if (colError) { setColExprError(colError); return; }

    let rowComponent: PositionComponent = parseToNumericExpression(rowExpression, { min: 0, max: 49 });
    let colComponent: PositionComponent = parseToNumericExpression(colExpression, { min: 0, max: 49 });
    const origin = panelOverride?.origin;
    if (origin && rowComponent.type === 'fixed' && colComponent.type === 'fixed') {
      rowComponent = { type: 'fixed', value: Math.max(0, rowComponent.value + origin.row) };
      colComponent = { type: 'fixed', value: Math.max(0, colComponent.value + origin.col) };
    }

    if (validateProposedOverTimeline) {
      const timelineError = validateProposedOverTimeline({ row: rowComponent, col: colComponent });
      if (timelineError) {
        setApplyError(timelineError);
        return;
      }
    }

    onSetPositionBinding({ row: rowComponent, col: colComponent });
    onClose();
  };

  const handleApplySize = () => {
    setApplyError(null);
    const widthExpr = parseToNumericExpression(shapeWidth, { min: 1, max: 50 });
    const heightExpr = isUniformShape ? widthExpr : parseToNumericExpression(shapeHeight, { min: 1, max: 50 });
    if (validateProposedOverTimeline) {
      const timelineError = validateProposedOverTimeline({ width: widthExpr, height: heightExpr });
      if (timelineError) {
        setApplyError(timelineError);
        return;
      }
    }
    onUpdateShapeProps({ width: widthExpr, height: heightExpr });
    onClose();
  };

  const getPositionDisplayText = (component: PositionComponent | undefined): string => {
    if (!component) return 'Not set';
    if (component.type === 'fixed' || component.type === 'hardcoded') return component.value.toString();
    if (component.type === 'expression') return component.expression;
    if (component.type === 'variable') return component.varName;
    return '?';
  };

  const getObjectTypeName = () => {
    if (cellData?.shape) return `Shape (${cellData.shape})`;
    if (cellData?.arrayInfo?.varName) return `Array (${cellData.arrayInfo.varName})`;
    if (cellData?.arrayInfo) return 'Empty Array';
    if (cellData?.intVar) return `Variable (${cellData.intVar.name})`;
    return 'Object';
  };

  // Adjust position to keep menu in viewport
  const adjustedPosition = {
    x: Math.min(position.x, window.innerWidth - 220),
    y: Math.min(position.y, window.innerHeight - 300),
  };

  const renderBackButton = (label: string, targetLevel: MenuLevel = 'main') => (
    <button
      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-100 transition-colors text-left text-sm text-gray-500 border-b border-gray-200"
      onClick={() => setMenuLevel(targetLevel)}
    >
      <span>←</span>
      <span>{label}</span>
    </button>
  );

  return (
    <div
      ref={menuRef}
      className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        minWidth: 180,
      }}
    >
      {/* Main Menu */}
      {menuLevel === 'main' && (
        <>
          <button
            className="w-full px-3 py-2 flex items-center gap-3 hover:bg-blue-50 transition-colors text-left"
            onClick={() => setMenuLevel('add')}
          >
            <div className="w-6 h-6 flex items-center justify-center text-blue-500 font-bold">
              +
            </div>
            <span className="text-sm text-gray-700">Add</span>
            <span className="ml-auto text-gray-400">→</span>
          </button>
          <div className="border-t border-gray-200 mt-1 pt-1">
            <button
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-red-50 transition-colors text-left"
              onClick={() => {
                onSelect(null);
                onClose();
              }}
            >
              <div className="w-6 h-6 flex items-center justify-center text-red-500 font-bold">
                ×
              </div>
              <span className="text-sm text-red-600">Clear</span>
            </button>
          </div>
        </>
      )}

      {/* Add Menu */}
      {menuLevel === 'add' && (
        <>
          {renderBackButton('Back')}
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Add
          </div>
          <button
            className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left"
            onClick={() => setMenuLevel('shapes')}
          >
            <div className="w-6 h-6 flex items-center justify-center">
              <Circle />
            </div>
            <span className="text-sm text-gray-700">Shape</span>
            <span className="ml-auto text-gray-400">→</span>
          </button>
          {hasVariables && (
            <button
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left"
              onClick={() => setMenuLevel('variables')}
            >
              <div className="w-6 h-6 flex items-center justify-center text-emerald-500 font-mono text-xs font-bold">
                var
              </div>
              <span className="text-sm text-gray-700">Variable</span>
              <span className="ml-auto text-gray-400">→</span>
            </button>
          )}
          <button
            className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left"
            onClick={() => setMenuLevel('label-input')}
          >
            <div className="w-6 h-6 flex items-center justify-center text-slate-500 font-mono text-xs font-bold">
              lbl
            </div>
            <span className="text-sm text-gray-700">Label</span>
            <span className="ml-auto text-gray-400">→</span>
          </button>
          <button
            className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left"
            onClick={() => setMenuLevel('panel-input')}
          >
            <div className="w-6 h-6 flex items-center justify-center text-slate-500 font-mono text-xs font-bold">
              pnl
            </div>
            <span className="text-sm text-gray-700">Panel</span>
            <span className="ml-auto text-gray-400">→</span>
          </button>
        </>
      )}

      {/* Shapes Menu */}
      {menuLevel === 'shapes' && (
        <>
          {renderBackButton('Add', 'add')}
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Shapes
          </div>
          {shapeItems.map(({ type, label, Icon, defaultColor }) => (
            <button
              key={type}
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left"
              onClick={() => {
                onSelect(type, panelContext ? { id: panelContext.id, origin: panelContext.origin } : undefined);
                onClose();
              }}
            >
              <div className="w-6 h-6">
                <Icon color={defaultColor} />
              </div>
              <span className="text-sm text-gray-700">{label}</span>
            </button>
          ))}
        </>
      )}

      {/* Variables Menu */}
      {menuLevel === 'variables' && (
        <>
          {renderBackButton('Add', 'add')}

          {/* Int Variables */}
          {intVariables.length > 0 && (
            <>
              <div className="px-3 py-1 text-xs font-semibold text-emerald-600 uppercase tracking-wide">
                Int Variables
              </div>
              <div className="max-h-32 overflow-y-auto">
                {intVariables.map(([name, variable]) => (
                  <button
                    key={name}
                    className="w-full px-3 py-2 flex items-center gap-3 hover:bg-emerald-50 transition-colors text-left"
                    onClick={() => {
                      onPlaceVariable(name, variable, panelContext ? { id: panelContext.id, origin: panelContext.origin } : undefined);
                      onClose();
                    }}
                  >
                    <div className="w-6 h-6 flex items-center justify-center rounded text-xs font-bold bg-emerald-100 text-emerald-700">
                      i
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-mono text-gray-800">{name}</span>
                      <span className="text-xs text-gray-400 ml-2">
                        = {(variable as { type: 'int'; value: number }).value}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Array Variables */}
          {arrayVariables.length > 0 && (
            <>
              <div className="px-3 py-1 text-xs font-semibold text-amber-600 uppercase tracking-wide mt-1">
                Array Variables
              </div>
              <div className="max-h-32 overflow-y-auto">
                {arrayVariables.map(([name, variable]) => (
                  <button
                    key={name}
                    className="w-full px-3 py-2 flex items-center gap-3 hover:bg-amber-50 transition-colors text-left"
                    onClick={() => {
                      onPlaceVariable(name, variable, panelContext ? { id: panelContext.id, origin: panelContext.origin } : undefined);
                      onClose();
                    }}
                  >
                    <div className="w-6 h-6 flex items-center justify-center rounded text-xs font-bold bg-amber-100 text-amber-700">
                      []
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-mono text-gray-800">{name}</span>
                      <span className="text-xs text-gray-400 ml-2">
                        [{(variable as { type: 'arr[int]'; value: number[] }).value.length}]
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Label Input Menu */}
      {menuLevel === 'label-input' && (
        <>
          {renderBackButton('Add', 'add')}
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Label
          </div>
          <div className="px-3 py-2 space-y-2">
            <input
              type="text"
              value={labelText}
              onChange={(e) => setLabelText(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              placeholder="Label text"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-12">Width</label>
              <input
                type="number"
                min="1"
                max="50"
                value={labelWidth}
                onChange={(e) => setLabelWidth(e.target.value)}
                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-12">Height</label>
              <input
                type="number"
                min="1"
                max="50"
                value={labelHeight}
                onChange={(e) => setLabelHeight(e.target.value)}
                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p className="text-xs text-gray-400">
              Use {'{var}'} to insert variables
            </p>
            <button
              onClick={handleAddLabel}
              className="w-full px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
            >
              Add
            </button>
          </div>
        </>
      )}

      {/* Panel Input Menu */}
      {menuLevel === 'panel-input' && (
        <>
          {renderBackButton('Add', 'add')}
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Panel
          </div>
          <div className="px-3 py-2 space-y-2">
            <input
              type="text"
              value={panelTitle}
              onChange={(e) => setPanelTitle(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              placeholder="Panel title"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-12">Width</label>
              <input
                type="number"
                min="1"
                max="50"
                value={panelWidth}
                onChange={(e) => setPanelWidth(e.target.value)}
                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-12">Height</label>
              <input
                type="number"
                min="1"
                max="50"
                value={panelHeight}
                onChange={(e) => setPanelHeight(e.target.value)}
                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleAddPanel}
              className="w-full px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
            >
              Add Panel
            </button>
          </div>
        </>
      )}

      {/* Settings Menu (when clicking on existing object) */}
      {menuLevel === 'settings' && (
        <>
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-200">
            {getObjectTypeName()} Settings
          </div>
          {cellData?.invalidReason && (
            <div className="px-3 py-2 text-xs text-red-600 border-b border-gray-200 bg-red-50">
              {cellData.invalidReason}
            </div>
          )}
          <button
            className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left"
            onClick={() => setMenuLevel('settings-color')}
          >
            <div
              className="w-6 h-6 rounded border border-gray-300"
              style={{ backgroundColor: currentColor || '#94a3b8' }}
            />
            <span className="text-sm text-gray-700">Color</span>
            <span className="ml-auto text-gray-400">→</span>
          </button>
          <button
            className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left"
            onClick={() => setMenuLevel('settings-thickness')}
          >
            <div className="w-6 h-6 flex items-center justify-center">
              <div
                className="w-4 bg-gray-600 rounded"
                style={{ height: currentLineWidth * 2 }}
              />
            </div>
            <span className="text-sm text-gray-700">Line Thickness</span>
            <span className="ml-auto text-gray-400">→</span>
          </button>
          <button
            className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left"
            onClick={() => { setApplyError(null); setMenuLevel('settings-position'); }}
          >
            <div className="w-6 h-6 flex items-center justify-center text-gray-500 font-mono text-xs">
              ↔
            </div>
            <span className="text-sm text-gray-700">Move</span>
            <span className="ml-auto text-gray-400">→</span>
          </button>
          {cellData?.shape && (
            <button
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left"
              onClick={() => { setApplyError(null); setMenuLevel('settings-size'); }}
            >
              <div className="w-6 h-6 flex items-center justify-center text-gray-500 font-mono text-xs">
                size
              </div>
              <span className="text-sm text-gray-700">Size</span>
              <span className="ml-auto text-gray-400">→</span>
            </button>
          )}
          {cellData?.shape && (
            <button
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left"
              onClick={() => setMenuLevel('settings-rotation')}
            >
              <div className="w-6 h-6 flex items-center justify-center text-gray-500 font-mono text-xs">
                rot
              </div>
              <span className="text-sm text-gray-700">Rotation</span>
              <span className="ml-auto text-gray-400">→</span>
            </button>
          )}
          {cellData?.shape === 'arrow' && (
            <button
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left"
              onClick={() => setMenuLevel('settings-orientation')}
            >
              <div className="w-6 h-6 flex items-center justify-center text-gray-500 font-mono text-xs">
                dir
              </div>
              <span className="text-sm text-gray-700">Orientation</span>
              <span className="ml-auto text-gray-400">→</span>
            </button>
          )}
          {cellData?.arrayInfo && (
            <button
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left"
              onClick={() => setMenuLevel('settings-array-direction')}
            >
              <div className="w-6 h-6 flex items-center justify-center text-gray-500 font-mono text-xs">
                dir
              </div>
              <span className="text-sm text-gray-700">Array Direction</span>
              <span className="ml-auto text-gray-400">→</span>
            </button>
          )}
          {cellData?.intVar && (
            <button
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left"
              onClick={() => setMenuLevel('settings-int-display')}
            >
              <div className="w-6 h-6 flex items-center justify-center text-gray-500 font-mono text-xs">
                txt
              </div>
              <span className="text-sm text-gray-700">Variable Display</span>
              <span className="ml-auto text-gray-400">→</span>
            </button>
          )}
          {!cellData?.panel && panelOptions.length > 0 && (
            <button
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left"
              onClick={() => setMenuLevel('settings-panel')}
            >
              <div className="w-6 h-6 flex items-center justify-center text-gray-500 font-mono text-xs">
                pnl
              </div>
              <span className="text-sm text-gray-700">Assign Panel</span>
              <span className="ml-auto text-gray-400">→</span>
            </button>
          )}
          {(cellData?.intVar || cellData?.arrayInfo) && (
            <button
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left"
              onClick={() => setMenuLevel('settings-font-size')}
            >
              <div className="w-6 h-6 flex items-center justify-center text-gray-500 font-mono text-xs">
                font
              </div>
              <span className="text-sm text-gray-700">Font Size</span>
              <span className="ml-auto text-gray-400">→</span>
            </button>
          )}
          <div className="border-t border-gray-200 mt-1 pt-1">
            <button
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-red-50 transition-colors text-left"
              onClick={() => {
                onSelect(null);
                onClose();
              }}
            >
              <div className="w-6 h-6 flex items-center justify-center text-red-500 font-bold">
                ×
              </div>
              <span className="text-sm text-red-600">Delete</span>
            </button>
          </div>
        </>
      )}

      {/* Color Settings */}
      {menuLevel === 'settings-color' && (
        <>
          {renderBackButton('Settings', 'settings')}
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Color
          </div>
          <div className="px-3 py-2 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={customColorValue}
                onChange={(e) => setCustomColorValue(e.target.value)}
                className="h-8 w-12 p-0 border border-gray-300 rounded"
              />
              <input
                type="text"
                value={customColorValue}
                onChange={(e) => setCustomColorValue(e.target.value)}
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-16">Opacity</label>
              <input
                type="range"
                min="0"
                max="100"
                value={customOpacityValue}
                onChange={(e) => setCustomOpacityValue(e.target.value)}
                className="flex-1"
              />
              <span className="text-xs text-gray-500 w-10 text-right">
                {customOpacityValue}%
              </span>
            </div>
            <button
              onClick={() => {
                const opacityValue = Math.min(100, Math.max(0, parseInt(customOpacityValue, 10) || 0));
                onUpdateStyle({ color: customColorValue, opacity: opacityValue / 100 });
                onClose();
              }}
              className="w-full px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
            >
              Apply
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {PRESET_COLORS.map(({ name, value }) => (
              <button
                key={name}
                className={`w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left ${
                  currentColor === value ? 'bg-blue-50' : ''
                }`}
                onClick={() => {
                  onUpdateStyle({ color: value, opacity: currentOpacity });
                  onClose();
                }}
              >
                <div
                  className="w-6 h-6 rounded border border-gray-300"
                  style={{ backgroundColor: value || '#94a3b8' }}
                />
                <span className="text-sm text-gray-700">{name}</span>
                {currentColor === value && (
                  <span className="ml-auto text-blue-500">✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Thickness Settings */}
      {menuLevel === 'settings-thickness' && (
        <>
          {renderBackButton('Settings', 'settings')}
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Line Thickness
          </div>
          {LINE_WIDTHS.map((width) => (
            <button
              key={width}
              className={`w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left ${
                currentLineWidth === width ? 'bg-blue-50' : ''
              }`}
              onClick={() => {
                onUpdateStyle({ lineWidth: width });
                onClose();
              }}
            >
              <div className="w-6 h-6 flex items-center justify-center">
                <div
                  className="w-4 bg-gray-600 rounded"
                  style={{ height: width * 2 }}
                />
              </div>
              <span className="text-sm text-gray-700">{width}px</span>
              {currentLineWidth === width && (
                <span className="ml-auto text-blue-500">✓</span>
              )}
            </button>
          ))}
        </>
      )}

      {/* Position Settings */}
      {menuLevel === 'settings-position' && (
        <>
          {renderBackButton('Settings', 'settings')}
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Position Settings
          </div>
          <div className="px-3 py-2">
            {panelContext && (
              <div className="mb-3 p-2 bg-blue-50 rounded text-xs text-blue-700">
                Editing relative to panel origin (0,0).
                <button
                  className="ml-2 underline"
                  onClick={() => {
                    setPanelOverrideActive(true);
                    setPanelOverride(null);
                  }}
                >
                  Use global grid
                </button>
              </div>
            )}
            {/* Current position display */}
            {currentBinding && (
              <div className="mb-3 p-2 bg-gray-50 rounded text-xs">
                <span className="text-gray-500">Current: </span>
                <span className="font-mono">
                  row={getPositionDisplayText(currentBinding.row)}, col={getPositionDisplayText(currentBinding.col)}
                </span>
              </div>
            )}

            {/* Row: single expression input + variable helper */}
            <div className="mb-3">
              <label className="text-xs text-gray-600 font-medium block mb-1">Row</label>
              <div className="flex items-center gap-1">
                <input
                  ref={rowInputRef}
                  type="text"
                  value={rowExpression}
                  onChange={(e) => { setRowExpression(e.target.value); setRowExprError(null); }}
                  placeholder="e.g. 0, i, i + 1"
                  className={`flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
                    rowExprError ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                <button
                  type="button"
                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
                  onClick={() => setVariablePickerFor((v) => (v === 'row' ? null : 'row'))}
                  title="Insert variable"
                >
                  var
                </button>
              </div>
              {variablePickerFor === 'row' && (
                <div className="mt-1 p-1 border border-gray-200 rounded max-h-24 overflow-y-auto">
                  {allVariableNames.length === 0 ? (
                    <p className="text-xs text-gray-500">No variables</p>
                  ) : (
                    allVariableNames.map((name) => (
                      <button
                        key={name}
                        type="button"
                        className="block w-full text-left px-2 py-0.5 text-sm font-mono hover:bg-blue-50"
                        onClick={() => insertVariableInto('row', name)}
                      >
                        {name}
                      </button>
                    ))
                  )}
                </div>
              )}
              {rowExprError && <p className="text-xs text-red-500 mt-1">{rowExprError}</p>}
            </div>

            {/* Column: single expression input + variable helper */}
            <div className="mb-3">
              <label className="text-xs text-gray-600 font-medium block mb-1">Column</label>
              <div className="flex items-center gap-1">
                <input
                  ref={colInputRef}
                  type="text"
                  value={colExpression}
                  onChange={(e) => { setColExpression(e.target.value); setColExprError(null); }}
                  placeholder="e.g. 0, j, len(arr)"
                  className={`flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
                    colExprError ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                <button
                  type="button"
                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
                  onClick={() => setVariablePickerFor((v) => (v === 'col' ? null : 'col'))}
                  title="Insert variable"
                >
                  var
                </button>
              </div>
              {variablePickerFor === 'col' && (
                <div className="mt-1 p-1 border border-gray-200 rounded max-h-24 overflow-y-auto">
                  {allVariableNames.length === 0 ? (
                    <p className="text-xs text-gray-500">No variables</p>
                  ) : (
                    allVariableNames.map((name) => (
                      <button
                        key={name}
                        type="button"
                        className="block w-full text-left px-2 py-0.5 text-sm font-mono hover:bg-blue-50"
                        onClick={() => insertVariableInto('col', name)}
                      >
                        {name}
                      </button>
                    ))
                  )}
                </div>
              )}
              {colExprError && <p className="text-xs text-red-500 mt-1">{colExprError}</p>}
            </div>

            {applyError && <p className="text-xs text-red-500 mt-1">{applyError}</p>}
            <button
              onClick={handleApplyPositionBinding}
              className="w-full px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
            >
              Apply
            </button>
            <p className="text-xs text-gray-400 mt-1">
              Number or expression (e.g. i+1, len(arr)). Use var to insert variables.
            </p>
          </div>
        </>
      )}

      {/* Size Settings - expression inputs + variable helper */}
      {menuLevel === 'settings-size' && (
        <>
          {renderBackButton('Settings', 'settings')}
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Shape Size
          </div>
          <div className="px-3 py-2 space-y-2">
            {isUniformShape ? (
              <div className="mb-2">
                <label className="text-xs text-gray-600 font-medium block mb-1">
                  {cellData?.shape === 'circle' ? 'Radius (expression)' : 'Size (expression)'}
                </label>
                <div className="flex items-center gap-1">
                  <input
                    ref={widthInputRef}
                    type="text"
                    value={shapeWidth}
                    onChange={(e) => { setShapeWidth(e.target.value); setShapeHeight(e.target.value); }}
                    placeholder="e.g. 2, len(arr)"
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
                    onClick={() => setSizePickerFor((v) => (v === 'width' ? null : 'width'))}
                    title="Insert variable"
                  >
                    var
                  </button>
                </div>
                {sizePickerFor === 'width' && (
                  <div className="mt-1 p-1 border border-gray-200 rounded max-h-24 overflow-y-auto">
                    {allVariableNames.length === 0 ? (
                      <p className="text-xs text-gray-500">No variables</p>
                    ) : (
                      allVariableNames.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className="block w-full text-left px-2 py-0.5 text-sm font-mono hover:bg-blue-50"
                          onClick={() => {
                            if (!widthInputRef.current) return;
                            const el = widthInputRef.current;
                            const start = el.selectionStart ?? 0;
                            const end = el.selectionEnd ?? 0;
                            const next = shapeWidth.slice(0, start) + name + shapeWidth.slice(end);
                            setShapeWidth(next);
                            setShapeHeight(next);
                            setSizePickerFor(null);
                            setTimeout(() => { el.focus(); el.setSelectionRange(start + name.length, start + name.length); }, 0);
                          }}
                        >
                          {name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="mb-2">
                  <label className="text-xs text-gray-600 font-medium block mb-1">Width (expression)</label>
                  <div className="flex items-center gap-1">
                    <input
                      ref={widthInputRef}
                      type="text"
                      value={shapeWidth}
                      onChange={(e) => setShapeWidth(e.target.value)}
                      placeholder="e.g. 2, len(arr)"
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
                      onClick={() => setSizePickerFor((v) => (v === 'width' ? null : 'width'))}
                      title="Insert variable"
                    >
                      var
                    </button>
                  </div>
                  {sizePickerFor === 'width' && (
                    <div className="mt-1 p-1 border border-gray-200 rounded max-h-24 overflow-y-auto">
                      {allVariableNames.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className="block w-full text-left px-2 py-0.5 text-sm font-mono hover:bg-blue-50"
                          onClick={() => insertVariableIntoSize('width', name)}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mb-2">
                  <label className="text-xs text-gray-600 font-medium block mb-1">Height (expression)</label>
                  <div className="flex items-center gap-1">
                    <input
                      ref={heightInputRef}
                      type="text"
                      value={shapeHeight}
                      onChange={(e) => setShapeHeight(e.target.value)}
                      placeholder="e.g. 1, len(arr)"
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
                      onClick={() => setSizePickerFor((v) => (v === 'height' ? null : 'height'))}
                      title="Insert variable"
                    >
                      var
                    </button>
                  </div>
                  {sizePickerFor === 'height' && (
                    <div className="mt-1 p-1 border border-gray-200 rounded max-h-24 overflow-y-auto">
                      {allVariableNames.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className="block w-full text-left px-2 py-0.5 text-sm font-mono hover:bg-blue-50"
                          onClick={() => insertVariableIntoSize('height', name)}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
            {applyError && <p className="text-xs text-red-500 mt-1">{applyError}</p>}
            <button
              onClick={handleApplySize}
              className="w-full px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
            >
              Apply
            </button>
          </div>
        </>
      )}

      {/* Rotation Settings */}
      {menuLevel === 'settings-rotation' && (
        <>
          {renderBackButton('Settings', 'settings')}
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Shape Rotation
          </div>
          <div className="px-3 py-2 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-16">Degrees</label>
              <input
                type="number"
                value={shapeRotation}
                onChange={(e) => setShapeRotation(e.target.value)}
                className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => {
                const rotationValue = parseFloat(shapeRotation) || 0;
                onUpdateShapeProps({ rotation: rotationValue });
                onClose();
              }}
              className="w-full px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
            >
              Apply
            </button>
          </div>
        </>
      )}

      {/* Orientation Settings */}
      {menuLevel === 'settings-orientation' && (
        <>
          {renderBackButton('Settings', 'settings')}
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Arrow Orientation
          </div>
          <div className="px-3 py-2">
            <select
              value={arrowOrientation}
              onChange={(e) => {
                onUpdateShapeProps({ orientation: e.target.value as ArrowOrientation });
                onClose();
              }}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="up">Up</option>
              <option value="right">Right</option>
              <option value="down">Down</option>
              <option value="left">Left</option>
            </select>
          </div>
        </>
      )}

      {/* Array Direction Settings */}
      {menuLevel === 'settings-array-direction' && (
        <>
          {renderBackButton('Settings', 'settings')}
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Array Direction
          </div>
          <div className="px-3 py-2">
            <select
              value={arrayDirection}
              onChange={(e) => {
                onUpdateArrayDirection(e.target.value as 'right' | 'left' | 'down' | 'up');
                onClose();
              }}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="right">Right</option>
              <option value="left">Left</option>
              <option value="down">Down</option>
              <option value="up">Up</option>
            </select>
          </div>
        </>
      )}

      {/* Variable Display Settings */}
      {menuLevel === 'settings-int-display' && (
        <>
          {renderBackButton('Settings', 'settings')}
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Variable Display
          </div>
          <div className="px-3 py-2">
            <select
              value={intDisplay}
              onChange={(e) => {
                onUpdateIntVarDisplay(e.target.value as 'name-value' | 'value-only');
                onClose();
              }}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="name-value">name=value</option>
              <option value="value-only">value only</option>
            </select>
          </div>
        </>
      )}

      {/* Font Size Settings */}
      {menuLevel === 'settings-font-size' && (
        <>
          {renderBackButton('Settings', 'settings')}
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Font Size
          </div>
          <div className="px-3 py-2 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-12">Size</label>
              <input
                type="number"
                min="8"
                max="32"
                value={fontSizeValue}
                onChange={(e) => setFontSizeValue(e.target.value)}
                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-500">px</span>
            </div>
            <button
              onClick={() => {
                const sizeValue = Math.min(32, Math.max(8, parseInt(fontSizeValue, 10) || 12));
                onUpdateStyle({ fontSize: sizeValue });
                onClose();
              }}
              className="w-full px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
            >
              Apply
            </button>
          </div>
        </>
      )}

      {/* Panel Assignment Settings */}
      {menuLevel === 'settings-panel' && (
        <>
          {renderBackButton('Settings', 'settings')}
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Assign Panel
          </div>
          <div className="px-3 py-2">
            <select
              value={cellData?.panelId || ''}
              onChange={(e) => {
                const nextPanel = e.target.value || null;
                onSetPanelForObject(nextPanel);
                onClose();
              }}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">None</option>
              {panelOptions.map((panel) => (
                <option key={panel.id} value={panel.id}>
                  {panel.title}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Panel Settings (right-click on panel title) */}
      {menuLevel === 'panel-settings' && panelSettingsData && (
        <>
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-200">
            Panel: {panelSettingsData.title || panelSettingsData.id}
          </div>
          <button
            className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left"
            onClick={() => setMenuLevel('panel-settings-title')}
          >
            <div className="w-6 h-6 flex items-center justify-center text-gray-500 font-mono text-xs">
              Aa
            </div>
            <span className="text-sm text-gray-700">Title</span>
            <span className="ml-auto text-xs text-gray-400 font-mono">{panelSettingsData.title || '(none)'}</span>
            <span className="text-gray-400">→</span>
          </button>
          <button
            className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left"
            onClick={() => setMenuLevel('panel-settings-size')}
          >
            <div className="w-6 h-6 flex items-center justify-center text-gray-500 font-mono text-xs">
              ⇔
            </div>
            <span className="text-sm text-gray-700">Size</span>
            <span className="ml-auto text-xs text-gray-400 font-mono">{panelSettingsData.width}×{panelSettingsData.height}</span>
            <span className="text-gray-400">→</span>
          </button>
          <div className="border-t border-gray-200 mt-1 pt-1">
            <button
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-red-50 transition-colors text-left"
              onClick={() => {
                onDeletePanel?.(panelSettingsData.id, false);
                onClose();
              }}
            >
              <div className="w-6 h-6 flex items-center justify-center text-red-500 font-bold">
                ×
              </div>
              <span className="text-sm text-red-600">Delete Panel & All Objects</span>
            </button>
            <button
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-amber-50 transition-colors text-left"
              onClick={() => {
                onDeletePanel?.(panelSettingsData.id, true);
                onClose();
              }}
            >
              <div className="w-6 h-6 flex items-center justify-center text-amber-500 font-bold">
                ⊘
              </div>
              <span className="text-sm text-amber-600">Delete Panel Only (Keep Objects)</span>
            </button>
          </div>
        </>
      )}

      {/* Panel Settings - Title */}
      {menuLevel === 'panel-settings-title' && panelSettingsData && (
        <>
          {renderBackButton('Panel Settings', 'panel-settings')}
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Panel Title
          </div>
          <div className="px-3 py-2 space-y-2">
            <input
              type="text"
              value={editPanelTitle}
              onChange={(e) => setEditPanelTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onUpdatePanel?.(panelSettingsData.id, { title: editPanelTitle });
                  onClose();
                }
              }}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              placeholder="Panel title"
              autoFocus
            />
            <button
              onClick={() => {
                onUpdatePanel?.(panelSettingsData.id, { title: editPanelTitle });
                onClose();
              }}
              className="w-full px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
            >
              Apply
            </button>
          </div>
        </>
      )}

      {/* Panel Settings - Size */}
      {menuLevel === 'panel-settings-size' && panelSettingsData && (
        <>
          {renderBackButton('Panel Settings', 'panel-settings')}
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Panel Size
          </div>
          <div className="px-3 py-2 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-12">Width</label>
              <input
                type="number"
                min="1"
                max="50"
                value={editPanelWidth}
                onChange={(e) => setEditPanelWidth(e.target.value)}
                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-12">Height</label>
              <input
                type="number"
                min="1"
                max="50"
                value={editPanelHeight}
                onChange={(e) => setEditPanelHeight(e.target.value)}
                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => {
                const width = Math.max(1, parseInt(editPanelWidth, 10) || 1);
                const height = Math.max(1, parseInt(editPanelHeight, 10) || 1);
                onUpdatePanel?.(panelSettingsData.id, { width, height });
                onClose();
              }}
              className="w-full px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
            >
              Apply
            </button>
          </div>
        </>
      )}
    </div>
  );
}
