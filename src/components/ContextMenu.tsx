import { useEffect, useRef, useState } from 'react';
import type { ShapeType, VariableDictionary, Variable, CellData, CellStyle, CellPosition, PositionBinding, PositionComponent } from '../types/grid';
import { Circle, Square, Arrow } from './shapes';
import { validateExpression } from '../utils/expressionEvaluator';

interface ContextMenuProps {
  position: { x: number; y: number };
  variables: VariableDictionary;
  cellData?: CellData;
  cellPosition?: CellPosition;
  intVariableNames: string[];
  onSelect: (shape: ShapeType | null) => void;
  onAddArray: (length: number) => void;
  onPlaceVariable: (name: string, variable: Variable) => void;
  onUpdateStyle: (style: Partial<CellStyle>) => void;
  onMoveCell: (newPosition: CellPosition) => void;
  onSetPositionBinding: (binding: PositionBinding) => void;
  onClose: () => void;
}

type MenuLevel = 'main' | 'add' | 'shapes' | 'variables' | 'array-input' | 'settings' | 'settings-color' | 'settings-thickness' | 'settings-position';

const PRESET_COLORS = [
  { name: 'Default', value: undefined },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
];

const LINE_WIDTHS = [1, 2, 3, 4, 5];

const shapeItems: { type: ShapeType; label: string; Icon: React.ComponentType }[] = [
  { type: 'circle', label: 'Circle', Icon: Circle },
  { type: 'square', label: 'Square', Icon: Square },
  { type: 'arrow', label: 'Arrow', Icon: Arrow },
];

export function ContextMenu({
  position,
  variables,
  cellData,
  cellPosition,
  intVariableNames,
  onSelect,
  onAddArray,
  onPlaceVariable,
  onUpdateStyle,
  onMoveCell: _onMoveCell,
  onSetPositionBinding,
  onClose,
}: ContextMenuProps) {
  void _onMoveCell; // Kept for backward compatibility
  const menuRef = useRef<HTMLDivElement>(null);
  const hasContent = !!(cellData?.shape || cellData?.arrayInfo || cellData?.intVar);
  const [menuLevel, setMenuLevel] = useState<MenuLevel>(hasContent ? 'settings' : 'main');
  const [arrayLength, setArrayLength] = useState('5');
  const inputRef = useRef<HTMLInputElement>(null);
  const rowInputRef = useRef<HTMLInputElement>(null);

  // Position binding state
  const currentBinding = cellData?.positionBinding;
  const [rowBindType, setRowBindType] = useState<'hardcoded' | 'variable' | 'expression'>(
    currentBinding?.row.type || 'hardcoded'
  );
  const [colBindType, setColBindType] = useState<'hardcoded' | 'variable' | 'expression'>(
    currentBinding?.col.type || 'hardcoded'
  );
  const [newRow, setNewRow] = useState(
    currentBinding?.row.type === 'hardcoded'
      ? currentBinding.row.value.toString()
      : cellPosition?.row.toString() || '0'
  );
  const [newCol, setNewCol] = useState(
    currentBinding?.col.type === 'hardcoded'
      ? currentBinding.col.value.toString()
      : cellPosition?.col.toString() || '0'
  );
  const [rowVarName, setRowVarName] = useState(
    currentBinding?.row.type === 'variable' ? currentBinding.row.varName : intVariableNames[0] || ''
  );
  const [colVarName, setColVarName] = useState(
    currentBinding?.col.type === 'variable' ? currentBinding.col.varName : intVariableNames[0] || ''
  );
  const [rowExpression, setRowExpression] = useState(
    currentBinding?.row.type === 'expression' ? currentBinding.row.expression : ''
  );
  const [colExpression, setColExpression] = useState(
    currentBinding?.col.type === 'expression' ? currentBinding.col.expression : ''
  );
  const [rowExprError, setRowExprError] = useState<string | null>(null);
  const [colExprError, setColExprError] = useState<string | null>(null);

  const variableEntries = Object.entries(variables);
  const intVariables = variableEntries.filter(([, v]) => v.type === 'int');
  const arrayVariables = variableEntries.filter(([, v]) => v.type === 'arr[int]');
  const hasVariables = variableEntries.length > 0;

  const currentColor = cellData?.style?.color;
  const currentLineWidth = cellData?.style?.lineWidth || 1;

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
    if (menuLevel === 'array-input' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
    if (menuLevel === 'settings-position' && rowInputRef.current) {
      rowInputRef.current.focus();
      rowInputRef.current.select();
    }
  }, [menuLevel]);

  const handleAddArray = () => {
    const length = parseInt(arrayLength, 10);
    if (length > 0 && length <= 50) {
      onAddArray(length);
      onClose();
    }
  };

  const handleApplyPositionBinding = () => {
    // Validate expressions before applying
    if (rowBindType === 'expression') {
      const error = validateExpression(rowExpression, variables);
      if (error) {
        setRowExprError(error);
        return;
      }
    }
    if (colBindType === 'expression') {
      const error = validateExpression(colExpression, variables);
      if (error) {
        setColExprError(error);
        return;
      }
    }

    let rowComponent: PositionComponent;
    if (rowBindType === 'expression') {
      rowComponent = { type: 'expression', expression: rowExpression };
    } else if (rowBindType === 'variable') {
      rowComponent = { type: 'variable', varName: rowVarName };
    } else {
      rowComponent = { type: 'hardcoded', value: Math.max(0, Math.min(49, parseInt(newRow, 10) || 0)) };
    }

    let colComponent: PositionComponent;
    if (colBindType === 'expression') {
      colComponent = { type: 'expression', expression: colExpression };
    } else if (colBindType === 'variable') {
      colComponent = { type: 'variable', varName: colVarName };
    } else {
      colComponent = { type: 'hardcoded', value: Math.max(0, Math.min(49, parseInt(newCol, 10) || 0)) };
    }

    onSetPositionBinding({ row: rowComponent, col: colComponent });
    onClose();
  };

  const getPositionDisplayText = (component: PositionComponent | undefined): string => {
    if (!component) return 'Not set';
    if (component.type === 'hardcoded') return component.value.toString();
    if (component.type === 'expression') return `=${component.expression}`;
    return `$${component.varName}`;
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
            onClick={() => setMenuLevel('array-input')}
          >
            <div className="w-6 h-6 flex items-center justify-center text-amber-500 font-mono text-xs font-bold">
              [...]
            </div>
            <span className="text-sm text-gray-700">Empty Array</span>
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
          {shapeItems.map(({ type, label, Icon }) => (
            <button
              key={type}
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left"
              onClick={() => {
                onSelect(type);
                onClose();
              }}
            >
              <div className="w-6 h-6">
                <Icon />
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
                      onPlaceVariable(name, variable);
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
                      onPlaceVariable(name, variable);
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

      {/* Array Input Menu */}
      {menuLevel === 'array-input' && (
        <>
          {renderBackButton('Add', 'add')}
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Empty Array
          </div>
          <div className="px-3 py-2">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="number"
                min="1"
                max="50"
                value={arrayLength}
                onChange={(e) => setArrayLength(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddArray();
                  }
                }}
                className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Length"
              />
              <button
                onClick={handleAddArray}
                className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
              >
                Add
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Length (1-50)</p>
          </div>
        </>
      )}

      {/* Settings Menu (when clicking on existing object) */}
      {menuLevel === 'settings' && (
        <>
          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-200">
            {getObjectTypeName()} Settings
          </div>
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
            onClick={() => setMenuLevel('settings-position')}
          >
            <div className="w-6 h-6 flex items-center justify-center text-gray-500 font-mono text-xs">
              ↔
            </div>
            <span className="text-sm text-gray-700">Move</span>
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
          <div className="max-h-48 overflow-y-auto">
            {PRESET_COLORS.map(({ name, value }) => (
              <button
                key={name}
                className={`w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 transition-colors text-left ${
                  currentColor === value ? 'bg-blue-50' : ''
                }`}
                onClick={() => {
                  onUpdateStyle({ color: value });
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
            {/* Current position display */}
            {currentBinding && (
              <div className="mb-3 p-2 bg-gray-50 rounded text-xs">
                <span className="text-gray-500">Current: </span>
                <span className="font-mono">
                  row={getPositionDisplayText(currentBinding.row)}, col={getPositionDisplayText(currentBinding.col)}
                </span>
              </div>
            )}

            {/* Row binding */}
            <div className="mb-3">
              <label className="text-xs text-gray-600 font-medium block mb-1">Row</label>
              <div className="flex items-center gap-2">
                <select
                  value={rowBindType}
                  onChange={(e) => {
                    setRowBindType(e.target.value as 'hardcoded' | 'variable' | 'expression');
                    setRowExprError(null);
                  }}
                  className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="hardcoded">Fixed</option>
                  <option value="variable">Variable</option>
                  <option value="expression">Expression</option>
                </select>
                {rowBindType === 'hardcoded' && (
                  <input
                    ref={rowInputRef}
                    type="number"
                    min="0"
                    max="49"
                    value={newRow}
                    onChange={(e) => setNewRow(e.target.value)}
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
                {rowBindType === 'variable' && (
                  <select
                    value={rowVarName}
                    onChange={(e) => setRowVarName(e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  >
                    {intVariableNames.length === 0 ? (
                      <option value="">No variables</option>
                    ) : (
                      intVariableNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))
                    )}
                  </select>
                )}
                {rowBindType === 'expression' && (
                  <input
                    type="text"
                    value={rowExpression}
                    onChange={(e) => {
                      setRowExpression(e.target.value);
                      setRowExprError(null);
                    }}
                    placeholder="e.g., i + 1"
                    className={`flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
                      rowExprError ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                )}
              </div>
              {rowExprError && (
                <p className="text-xs text-red-500 mt-1">{rowExprError}</p>
              )}
            </div>

            {/* Col binding */}
            <div className="mb-3">
              <label className="text-xs text-gray-600 font-medium block mb-1">Column</label>
              <div className="flex items-center gap-2">
                <select
                  value={colBindType}
                  onChange={(e) => {
                    setColBindType(e.target.value as 'hardcoded' | 'variable' | 'expression');
                    setColExprError(null);
                  }}
                  className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="hardcoded">Fixed</option>
                  <option value="variable">Variable</option>
                  <option value="expression">Expression</option>
                </select>
                {colBindType === 'hardcoded' && (
                  <input
                    type="number"
                    min="0"
                    max="49"
                    value={newCol}
                    onChange={(e) => setNewCol(e.target.value)}
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
                {colBindType === 'variable' && (
                  <select
                    value={colVarName}
                    onChange={(e) => setColVarName(e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  >
                    {intVariableNames.length === 0 ? (
                      <option value="">No variables</option>
                    ) : (
                      intVariableNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))
                    )}
                  </select>
                )}
                {colBindType === 'expression' && (
                  <input
                    type="text"
                    value={colExpression}
                    onChange={(e) => {
                      setColExpression(e.target.value);
                      setColExprError(null);
                    }}
                    placeholder="e.g., arr[j]"
                    className={`flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
                      colExprError ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                )}
              </div>
              {colExprError && (
                <p className="text-xs text-red-500 mt-1">{colExprError}</p>
              )}
            </div>

            <button
              onClick={handleApplyPositionBinding}
              className="w-full px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
            >
              Apply
            </button>
            <p className="text-xs text-gray-400 mt-1">
              {rowBindType === 'expression' || colBindType === 'expression'
                ? 'Expressions: +, -, *, /, ^, %, abs(), floor(), ceil(), round(), min(), max()'
                : rowBindType === 'variable' || colBindType === 'variable'
                ? 'Position will update when variable changes'
                : 'Fixed position (0-49)'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
