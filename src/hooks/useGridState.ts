import { useState, useCallback, useRef, useMemo } from 'react';
import type {
  CellPosition,
  ShapeType,
  CellData,
  VariableDictionary,
  CellStyle,
  Timeline,
  PositionBinding,
  ShapeProps,
  PositionComponent,
} from '../types/grid';
import { cellKey, resolvePosition, createHardcodedBinding, getArrayOffset } from '../types/grid';
import { evaluateExpression } from '../utils/expressionEvaluator';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;

// Object storage - keyed by objectId, stores the object definition
interface GridObject {
  id: string;
  data: CellData;
  positionBinding: PositionBinding;
}

export interface GridObjectSnapshot {
  id: string;
  data: CellData;
  positionBinding: PositionBinding;
}

export function useGridState() {
  // Objects are stored by ID, not position (allows position binding)
  const [objects, setObjects] = useState<Map<string, GridObject>>(new Map());
  const [selectedCell, setSelectedCell] = useState<CellPosition | null>(null);
  const [zoom, setZoomLevel] = useState(1);

  // Timeline state
  const [timeline, setTimeline] = useState<Timeline>([]);
  const [currentStep, setCurrentStep] = useState(0);

  const objectIdCounter = useRef(0);
  const movePromptRef = useRef<{ key: string; inFlight: boolean }>({ key: '', inFlight: false });
  const panelPromptRef = useRef<{ key: string; inFlight: boolean }>({ key: '', inFlight: false });

  const resolvePositionWithErrors = useCallback(
    (binding: PositionBinding, vars: VariableDictionary): { position: CellPosition; error?: string } => {
      const resolveComponent = (component: PositionBinding['row']): { value: number; error?: string } => {
        if (component.type === 'hardcoded') {
          return { value: component.value };
        }
        if (component.type === 'variable') {
          const variable = vars[component.varName];
          if (!variable || (variable.type !== 'int' && variable.type !== 'float')) {
            return { value: 0, error: `Variable "${component.varName}" not available` };
          }
          return { value: variable.value };
        }
        try {
          return { value: evaluateExpression(component.expression, vars) };
        } catch (error) {
          return {
            value: 0,
            error: error instanceof Error ? error.message : 'Expression error',
          };
        }
      };

      const rowResult = resolveComponent(binding.row);
      const colResult = resolveComponent(binding.col);
      const row = Math.max(0, Math.min(49, Math.floor(rowResult.value)));
      const col = Math.max(0, Math.min(49, Math.floor(colResult.value)));
      return {
        position: { row, col },
        error: rowResult.error || colResult.error,
      };
    },
    []
  );

  const resolveObjectPosition = useCallback(
    (
      obj: GridObject,
      objectsMap: Map<string, GridObject>,
      vars: VariableDictionary
    ): CellPosition => {
      let pos = resolvePosition(obj.positionBinding, vars, evaluateExpression);
      if (obj.data.panelId) {
        for (const [, panelObj] of objectsMap) {
          if (panelObj.data.panel?.id === obj.data.panelId) {
            const panelPos = resolvePosition(panelObj.positionBinding, vars, evaluateExpression);
            pos = { row: pos.row + panelPos.row, col: pos.col + panelPos.col };
            break;
          }
        }
      }
      return {
        row: Math.max(0, Math.min(49, pos.row)),
        col: Math.max(0, Math.min(49, pos.col)),
      };
    },
    []
  );

  // Current variables from timeline
  const currentVariables = useMemo((): VariableDictionary => {
    if (timeline.length === 0) return {};
    return timeline[Math.min(currentStep, timeline.length - 1)] || {};
  }, [timeline, currentStep]);

  const getPanelContextAt = useCallback(
    (position: CellPosition): { id: string; origin: CellPosition; width: number; height: number } | null => {
      for (const [, obj] of objects) {
        if (!obj.data.panel) continue;
        const origin = resolvePosition(obj.positionBinding, currentVariables, evaluateExpression);
        const width = obj.data.panel.width;
        const height = obj.data.panel.height;
        if (
          position.row >= origin.row &&
          position.row < origin.row + height &&
          position.col >= origin.col &&
          position.col < origin.col + width
        ) {
          return { id: obj.data.panel.id, origin, width, height };
        }
      }
      return null;
    },
    [objects, currentVariables]
  );

  const stepCount = timeline.length;

  const renderLabelText = useCallback((template: string, vars: VariableDictionary): string => {
    return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_match, varName) => {
      const value = vars[varName];
      if (!value) return `{${varName}}`;
      if (value.type === 'arr[int]') return `[${value.value.join(', ')}]`;
      if (value.type === 'float' || value.type === 'int') return `${value.value}`;
      return `${(value as { value: string }).value}`;
    });
  }, []);

  // Compute cell positions from objects and current variables
  const cells = useMemo((): Map<string, CellData> => {
    const cellMap = new Map<string, CellData>();

    const panelPositions = new Map<string, { position: CellPosition; error?: string }>();
    for (const [, obj] of objects) {
      if (obj.data.panel?.id) {
        const resolved = resolvePositionWithErrors(obj.positionBinding, currentVariables);
        panelPositions.set(obj.data.panel.id, {
          position: resolved.position,
          error: resolved.error,
        });
      }
    }

    for (const [, obj] of objects) {
      if (obj.data.panel) {
        continue;
      }
      const resolved = resolvePositionWithErrors(obj.positionBinding, currentVariables);
      let position = resolved.position;
      let invalidReason = resolved.error;

      if (obj.data.panelId) {
        const panelInfo = panelPositions.get(obj.data.panelId);
        if (panelInfo) {
          position = {
            row: position.row + panelInfo.position.row,
            col: position.col + panelInfo.position.col,
          };
          if (panelInfo.error) {
            invalidReason = panelInfo.error;
          }
        } else {
          invalidReason = `Panel "${obj.data.panelId}" not found`;
        }
      }
      position = {
        row: Math.max(0, Math.min(49, position.row)),
        col: Math.max(0, Math.min(49, position.col)),
      };

      // Handle arrays - they span multiple cells
      if (obj.data.arrayInfo) {
        const arrayId = obj.data.arrayInfo.id;
        // Find all objects in this array
        const arrayObjects: GridObject[] = [];
        for (const [, o] of objects) {
          if (o.data.arrayInfo?.id === arrayId) {
            arrayObjects.push(o);
          }
        }
        // Sort by index
        arrayObjects.sort((a, b) => (a.data.arrayInfo?.index || 0) - (b.data.arrayInfo?.index || 0));

        // Place each array cell
        for (let i = 0; i < arrayObjects.length; i++) {
          const arrayObj = arrayObjects[i];
          const direction = arrayObj.data.arrayInfo?.direction || 'right';
          const offset = getArrayOffset(direction, i);
          const cellPos = { row: position.row + offset.rowDelta, col: position.col + offset.colDelta };

          // Update array values from current variables if this is a variable-bound array
          let cellData = { ...arrayObj.data };
          if (cellData.arrayInfo?.varName) {
            const arrVar = currentVariables[cellData.arrayInfo.varName];
            if (arrVar && (arrVar.type === 'arr[int]' || arrVar.type === 'arr[str]')) {
              const newValue = arrVar.value[cellData.arrayInfo.index];
              if (newValue !== undefined) {
                cellData = {
                  ...cellData,
                  arrayInfo: {
                    ...cellData.arrayInfo,
                    value: newValue,
                  },
                };
              } else {
                cellData = { ...cellData, invalidReason: `Index ${cellData.arrayInfo.index} out of bounds` };
              }
            } else {
              cellData = { ...cellData, invalidReason: `Array "${cellData.arrayInfo.varName}" not available` };
            }
          }

          // Share position binding across array cells for dragging and context menu
          cellData = { ...cellData, positionBinding: obj.positionBinding };

          cellMap.set(cellKey(cellPos.row, cellPos.col), {
            ...cellData,
            invalidReason: cellData.invalidReason || invalidReason,
          });
        }
      } else if (obj.data.intVar) {
        // Update int variable value from current variables
        let cellData = { ...obj.data, positionBinding: obj.positionBinding };
        const intVar = currentVariables[obj.data.intVar.name];
        if (intVar && intVar.type === 'int') {
          cellData = {
            ...cellData,
            intVar: {
              ...cellData.intVar!,
              value: intVar.value,
            },
          };
        } else if (intVar && intVar.type === 'float') {
          cellData = {
            ...cellData,
            intVar: {
              ...cellData.intVar!,
              value: Math.floor(intVar.value),
            },
          };
        } else {
          cellData = { ...cellData, invalidReason: `Variable "${obj.data.intVar.name}" not available` };
        }
        cellMap.set(cellKey(position.row, position.col), {
          ...cellData,
          invalidReason: cellData.invalidReason || invalidReason,
        });
      } else if (obj.data.label) {
        const renderedText = renderLabelText(obj.data.label.text, currentVariables);
        const cellData = {
          ...obj.data,
          label: { ...obj.data.label, text: renderedText },
          positionBinding: obj.positionBinding,
        };
        cellMap.set(cellKey(position.row, position.col), {
          ...cellData,
          invalidReason,
        });
      } else {
        // Shapes - just place at resolved position
        cellMap.set(cellKey(position.row, position.col), {
          ...obj.data,
          invalidReason,
          positionBinding: obj.positionBinding,
        });
      }
    }

    return cellMap;
  }, [objects, currentVariables, renderLabelText]);

  const panels = useMemo(() => {
    const result: Array<{
      id: string;
      row: number;
      col: number;
      width: number;
      height: number;
      title?: string;
      invalidReason?: string;
    }> = [];

    for (const [, obj] of objects) {
      if (!obj.data.panel) continue;
      const resolved = resolvePositionWithErrors(obj.positionBinding, currentVariables);
      const position = resolved.position;
      result.push({
        id: obj.data.panel.id,
        row: position.row,
        col: position.col,
        width: obj.data.panel.width,
        height: obj.data.panel.height,
        title: obj.data.panel.title,
        invalidReason: resolved.error,
      });
    }

    return result;
  }, [objects, currentVariables]);

  // Helper function to generate unique object ID
  const generateObjectId = useCallback(() => {
    return `obj-${objectIdCounter.current++}`;
  }, []);

  // Helper function to clear objects at positions
  const clearOverlappingObjects = useCallback((
    objectsMap: Map<string, GridObject>,
    row: number,
    startCol: number,
    length: number,
    variables: VariableDictionary
  ): Map<string, GridObject> => {
    const next = new Map(objectsMap);
    const objectsToClear = new Set<string>();

    // Find objects that would be at the target positions
    for (const [id, obj] of next) {
      const pos = resolveObjectPosition(obj, next, variables);

      if (obj.data.panel) {
        // Panels are containers; do not clear them when placing children.
        continue;
      }
      if (obj.data.arrayInfo) {
        // For arrays, check if any cell overlaps
        const arrayId = obj.data.arrayInfo.id;
        let arrayLength = 0;
        let isFirstCell = true;
        const direction = obj.data.arrayInfo.direction || 'right';

        for (const [, o] of next) {
          if (o.data.arrayInfo?.id === arrayId) {
            arrayLength++;
            if (o.data.arrayInfo.index < obj.data.arrayInfo.index) {
              isFirstCell = false;
            }
          }
        }

        if (isFirstCell) {
          // Check if array overlaps with target range
          for (let i = 0; i < arrayLength; i++) {
            const offset = getArrayOffset(direction, i);
            const arrayRow = pos.row + offset.rowDelta;
            const arrayCol = pos.col + offset.colDelta;
            for (let j = 0; j < length; j++) {
              if (arrayRow === row && arrayCol === startCol + j) {
                // If overlapping with arr[0], clear entire array
                if (i === 0 || obj.data.arrayInfo.index === 0) {
                  objectsToClear.add(arrayId);
                }
              }
            }
          }
        }
      } else {
        // Single cell objects or shapes/labels with width/height
        const width = obj.data.label?.width || obj.data.shapeProps?.width || 1;
        const height = obj.data.label?.height || obj.data.shapeProps?.height || 1;
        for (let r = 0; r < height; r++) {
          for (let c = 0; c < width; c++) {
            for (let j = 0; j < length; j++) {
              if (pos.row + r === row && pos.col + c === startCol + j) {
                objectsToClear.add(id);
              }
            }
          }
        }
      }
    }

    // Clear identified objects
    for (const [id, obj] of next) {
      if (objectsToClear.has(id) ||
          (obj.data.arrayInfo && objectsToClear.has(obj.data.arrayInfo.id))) {
        next.delete(id);
      }
    }

    return next;
  }, []);

  const selectCell = useCallback((position: CellPosition | null) => {
    setSelectedCell(position);
  }, []);

  const setShape = useCallback((position: CellPosition, shape: ShapeType, panelContext?: { id: string; origin: CellPosition }) => {
    const objectId = generateObjectId();
    const targetPosition = panelContext
      ? { row: position.row - panelContext.origin.row, col: position.col - panelContext.origin.col }
      : position;
    setObjects((prev) => {
      const next = clearOverlappingObjects(prev, position.row, position.col, 1, currentVariables);
      next.set(objectId, {
        id: objectId,
        data: { shape, objectId, shapeProps: { width: 1, height: 1 }, panelId: panelContext?.id },
        positionBinding: createHardcodedBinding(targetPosition),
      });
      return next;
    });
  }, [generateObjectId, clearOverlappingObjects, currentVariables]);

  const clearCell = useCallback((position: CellPosition) => {
    setObjects((prev) => {
      const next = new Map(prev);

      // Find object at this position
      for (const [id, obj] of next) {
        const pos = resolveObjectPosition(obj, next, currentVariables);

        if (obj.data.arrayInfo) {
          // Check if this position is part of this array
          const arrayId = obj.data.arrayInfo.id;
          let arrayLength = 0;
          const direction = obj.data.arrayInfo.direction || 'right';
          for (const [, o] of next) {
            if (o.data.arrayInfo?.id === arrayId) arrayLength++;
          }

          for (let i = 0; i < arrayLength; i++) {
            const offset = getArrayOffset(direction, i);
            if (pos.row + offset.rowDelta === position.row && pos.col + offset.colDelta === position.col) {
              // Clear entire array
              for (const [oid, o] of next) {
                if (o.data.arrayInfo?.id === arrayId) {
                  next.delete(oid);
                }
              }
              return next;
            }
          }
        } else {
          const width = obj.data.label?.width || obj.data.shapeProps?.width || 1;
          const height = obj.data.label?.height || obj.data.shapeProps?.height || 1;
          for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
              if (pos.row + r === position.row && pos.col + c === position.col) {
                next.delete(id);
                return next;
              }
            }
          }
        }
      }

      return next;
    });
  }, [currentVariables]);

  const addArray = useCallback((position: CellPosition, length: number, panelContext?: { id: string; origin: CellPosition }) => {
    const arrayId = `array-${objectIdCounter.current++}`;
    const targetPosition = panelContext
      ? { row: position.row - panelContext.origin.row, col: position.col - panelContext.origin.col }
      : position;

    setObjects((prev) => {
      const next = clearOverlappingObjects(prev, position.row, position.col, length, currentVariables);
      const binding = createHardcodedBinding(targetPosition);

      for (let i = 0; i < length; i++) {
        const objectId = generateObjectId();
        next.set(objectId, {
          id: objectId,
          data: {
            objectId,
            arrayInfo: {
              id: arrayId,
              index: i,
              value: 0,
              direction: 'right',
            },
            panelId: panelContext?.id,
          },
          positionBinding: binding, // All array cells share the same binding (first cell position)
        });
      }
      return next;
    });
  }, [generateObjectId, clearOverlappingObjects, currentVariables]);

  const addLabel = useCallback((position: CellPosition, text: string, width: number, height: number, panelContext?: { id: string; origin: CellPosition }) => {
    const objectId = generateObjectId();
    const targetPosition = panelContext
      ? { row: position.row - panelContext.origin.row, col: position.col - panelContext.origin.col }
      : position;
    setObjects((prev) => {
      const next = clearOverlappingObjects(prev, position.row, position.col, width, currentVariables);
      next.set(objectId, {
        id: objectId,
        data: {
          objectId,
          label: {
            text,
            width,
            height,
          },
          panelId: panelContext?.id,
        },
        positionBinding: createHardcodedBinding(targetPosition),
      });
      return next;
    });
  }, [generateObjectId, clearOverlappingObjects, currentVariables]);

  const addPanel = useCallback((position: CellPosition, width: number, height: number, title?: string) => {
    const objectId = generateObjectId();
    const panelId = `panel-${objectIdCounter.current++}`;
    setObjects((prev) => {
      const next = clearOverlappingObjects(prev, position.row, position.col, width, currentVariables);
      next.set(objectId, {
        id: objectId,
        data: {
          objectId,
          panel: {
            id: panelId,
            width,
            height,
            title,
          },
          shapeProps: { width, height },
        },
        positionBinding: createHardcodedBinding(position),
      });
      return next;
    });
  }, [generateObjectId, clearOverlappingObjects, currentVariables]);

  const loadTimeline = useCallback((newTimeline: Timeline) => {
    setTimeline(newTimeline);
    setCurrentStep(0);
  }, []);

  // Keep loadVariables for backward compatibility - wraps single dict in array
  const loadVariables = useCallback((dict: VariableDictionary) => {
    setTimeline([dict]);
    setCurrentStep(0);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, timeline.length - 1));
  }, [timeline.length]);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const goToStep = useCallback((step: number) => {
    setCurrentStep(Math.max(0, Math.min(step, timeline.length - 1)));
  }, [timeline.length]);

  const placeIntVariable = useCallback((position: CellPosition, name: string, value: number, panelContext?: { id: string; origin: CellPosition }) => {
    const objectId = generateObjectId();
    const targetPosition = panelContext
      ? { row: position.row - panelContext.origin.row, col: position.col - panelContext.origin.col }
      : position;
    setObjects((prev) => {
      const next = clearOverlappingObjects(prev, position.row, position.col, 1, currentVariables);
      next.set(objectId, {
        id: objectId,
        data: {
          objectId,
          intVar: { name, value, display: 'name-value' },
          panelId: panelContext?.id,
        },
        positionBinding: createHardcodedBinding(targetPosition),
      });
      return next;
    });
  }, [generateObjectId, clearOverlappingObjects, currentVariables]);

  const placeArrayVariable = useCallback((position: CellPosition, name: string, values: Array<number | string>, panelContext?: { id: string; origin: CellPosition }) => {
    const arrayId = `array-${objectIdCounter.current++}`;
    const targetPosition = panelContext
      ? { row: position.row - panelContext.origin.row, col: position.col - panelContext.origin.col }
      : position;

    setObjects((prev) => {
      const next = clearOverlappingObjects(prev, position.row, position.col, values.length, currentVariables);
      const binding = createHardcodedBinding(targetPosition);

      for (let i = 0; i < values.length; i++) {
        const objectId = generateObjectId();
        next.set(objectId, {
          id: objectId,
          data: {
            objectId,
            arrayInfo: {
              id: arrayId,
              index: i,
              value: values[i],
              varName: name,
              direction: 'right',
            },
            panelId: panelContext?.id,
          },
          positionBinding: binding,
        });
      }
      return next;
    });
  }, [generateObjectId, clearOverlappingObjects, currentVariables]);

  const setCellValue = useCallback((position: CellPosition, value: string | number) => {
    setObjects((prev) => {
      const next = new Map(prev);

      for (const [, obj] of next) {
        const pos = resolveObjectPosition(obj, next, currentVariables);

        if (obj.data.arrayInfo) {
          // Find which index this position corresponds to
          const arrayId = obj.data.arrayInfo.id;
          let found = false;
          const direction = obj.data.arrayInfo.direction || 'right';

          for (const [oid, o] of next) {
            if (o.data.arrayInfo?.id === arrayId) {
              const idx = o.data.arrayInfo.index;
              const offset = getArrayOffset(direction, idx);
              if (pos.row + offset.rowDelta === position.row && pos.col + offset.colDelta === position.col) {
                next.set(oid, {
                  ...o,
                  data: {
                    ...o.data,
                    arrayInfo: {
                      ...o.data.arrayInfo!,
                      value,
                    },
                  },
                });
                found = true;
                break;
              }
            }
          }
          if (found) break;
        }
      }

      return next;
    });
  }, [currentVariables]);

  const getCellData = useCallback(
    (row: number, col: number): CellData | undefined => {
      return cells.get(cellKey(row, col));
    },
    [cells]
  );

  const zoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomLevel((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  }, []);

  const setZoom = useCallback((value: number) => {
    setZoomLevel(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)));
  }, []);

  const updateCellStyle = useCallback((position: CellPosition, style: Partial<CellStyle>) => {
    setObjects((prev) => {
      const next = new Map(prev);

      for (const [id, obj] of next) {
        const pos = resolveObjectPosition(obj, next, currentVariables);

        if (obj.data.arrayInfo) {
          // Check if this position is part of this array
          const arrayId = obj.data.arrayInfo.id;
          let arrayLength = 0;
          const direction = obj.data.arrayInfo.direction || 'right';
          for (const [, o] of next) {
            if (o.data.arrayInfo?.id === arrayId) arrayLength++;
          }

          for (let i = 0; i < arrayLength; i++) {
            const offset = getArrayOffset(direction, i);
            if (pos.row + offset.rowDelta === position.row && pos.col + offset.colDelta === position.col) {
              // Update style for all cells in array
              for (const [oid, o] of next) {
                if (o.data.arrayInfo?.id === arrayId) {
                  next.set(oid, {
                    ...o,
                    data: {
                      ...o.data,
                      style: { ...o.data.style, ...style },
                    },
                  });
                }
              }
              return next;
            }
          }
        } else if (pos.row === position.row && pos.col === position.col) {
          next.set(id, {
            ...obj,
            data: {
              ...obj.data,
              style: { ...obj.data.style, ...style },
            },
          });
          return next;
        }
      }

      return next;
    });
  }, [currentVariables]);

  const setPositionBinding = useCallback((position: CellPosition, binding: PositionBinding) => {
    const getPanelInfo = (panelId?: string) => {
      if (!panelId) return null;
      for (const [, pobj] of objects) {
        if (pobj.data.panel?.id === panelId) {
          const origin = resolvePosition(pobj.positionBinding, currentVariables, evaluateExpression);
          return {
            id: panelId,
            origin,
            width: pobj.data.panel.width,
            height: pobj.data.panel.height,
          };
        }
      }
      return null;
    };

    const findTarget = () => {
      for (const [id, obj] of objects) {
        const pos = resolveObjectPosition(obj, objects, currentVariables);
        if (obj.data.arrayInfo) {
          const arrayId = obj.data.arrayInfo.id;
          let arrayLength = 0;
          const direction = obj.data.arrayInfo.direction || 'right';
          for (const [, o] of objects) {
            if (o.data.arrayInfo?.id === arrayId) arrayLength++;
          }
          for (let i = 0; i < arrayLength; i++) {
            const offset = getArrayOffset(direction, i);
            if (pos.row + offset.rowDelta === position.row && pos.col + offset.colDelta === position.col) {
              return { id, obj, arrayId };
            }
          }
        } else if (pos.row === position.row && pos.col === position.col) {
          return { id, obj };
        }
      }
      return null;
    };

    const target = findTarget();
    if (!target) return;

    const panelInfo = getPanelInfo(target.obj.data.panelId);
    let nextBinding = binding;
    if (panelInfo && binding.row.type === 'hardcoded' && binding.col.type === 'hardcoded') {
      const rowValue = binding.row.value - panelInfo.origin.row;
      const colValue = binding.col.value - panelInfo.origin.col;
      nextBinding = createHardcodedBinding({
        row: Math.max(0, rowValue),
        col: Math.max(0, colValue),
      });
      const outOfBounds =
        rowValue < 0 ||
        colValue < 0 ||
        rowValue >= panelInfo.height ||
        colValue >= panelInfo.width;
      if (outOfBounds) {
        const promptKey = `${panelInfo.id}:${rowValue},${colValue}`;
        if (panelPromptRef.current.inFlight && panelPromptRef.current.key === promptKey) {
          return;
        }
        panelPromptRef.current = { key: promptKey, inFlight: true };
        const extend = window.confirm('Target is outside the panel. Extend the panel to include it?');
        panelPromptRef.current = { key: promptKey, inFlight: false };
        if (!extend) return;
        setObjects((prev) => {
          const next = new Map(prev);
          for (const [pid, pobj] of next) {
            if (pobj.data.panel?.id === panelInfo.id) {
              const newWidth = Math.max(panelInfo.width, colValue + 1);
              const newHeight = Math.max(panelInfo.height, rowValue + 1);
              next.set(pid, {
                ...pobj,
                data: {
                  ...pobj.data,
                  panel: {
                    ...pobj.data.panel,
                    width: newWidth,
                    height: newHeight,
                  },
                  shapeProps: { ...pobj.data.shapeProps, width: newWidth, height: newHeight },
                },
              });
              break;
            }
          }
          return next;
        });
      }
    }

    setObjects((prev) => {
      const next = new Map(prev);
      if (target.arrayId) {
        for (const [oid, o] of next) {
          if (o.data.arrayInfo?.id === target.arrayId) {
            next.set(oid, {
              ...o,
              positionBinding: nextBinding,
            });
          }
        }
      } else {
        next.set(target.id, {
          ...target.obj,
          positionBinding: nextBinding,
        });
      }
      return next;
    });
  }, [objects, currentVariables, resolveObjectPosition]);

  const updateShapeProps = useCallback((position: CellPosition, shapeProps: Partial<ShapeProps>) => {
    setObjects((prev) => {
      const next = new Map(prev);

      for (const [id, obj] of next) {
        const pos = resolveObjectPosition(obj, next, currentVariables);
        if (obj.data.arrayInfo) continue;

        if (pos.row === position.row && pos.col === position.col) {
          next.set(id, {
            ...obj,
            data: {
              ...obj.data,
              shapeProps: { ...obj.data.shapeProps, ...shapeProps },
            },
          });
          return next;
        }
      }

      return next;
    });
  }, [currentVariables]);

  const updateIntVarDisplay = useCallback((position: CellPosition, display: 'name-value' | 'value-only') => {
    setObjects((prev) => {
      const next = new Map(prev);

      for (const [id, obj] of next) {
        const pos = resolveObjectPosition(obj, next, currentVariables);
        if (obj.data.intVar && pos.row === position.row && pos.col === position.col) {
          next.set(id, {
            ...obj,
            data: {
              ...obj.data,
              intVar: {
                ...obj.data.intVar,
                display,
              },
            },
          });
          return next;
        }
      }

      return next;
    });
  }, [currentVariables]);

  const updateArrayDirection = useCallback((position: CellPosition, direction: 'right' | 'left' | 'down' | 'up') => {
    setObjects((prev) => {
      const next = new Map(prev);

      for (const [, obj] of next) {
        const pos = resolveObjectPosition(obj, next, currentVariables);
        if (!obj.data.arrayInfo) continue;

        const arrayId = obj.data.arrayInfo.id;
        let arrayLength = 0;
        for (const [, o] of next) {
          if (o.data.arrayInfo?.id === arrayId) arrayLength++;
        }

        for (let i = 0; i < arrayLength; i++) {
          const offset = getArrayOffset(obj.data.arrayInfo.direction || 'right', i);
          if (pos.row + offset.rowDelta === position.row && pos.col + offset.colDelta === position.col) {
            for (const [oid, o] of next) {
              if (o.data.arrayInfo?.id === arrayId) {
                next.set(oid, {
                  ...o,
                  data: {
                    ...o.data,
                    arrayInfo: {
                      ...o.data.arrayInfo!,
                      direction,
                    },
                  },
                });
              }
            }
            return next;
          }
        }
      }

      return next;
    });
  }, [currentVariables]);

  const setPanelForObject = useCallback((position: CellPosition, panelId: string | null) => {
    setObjects((prev) => {
      const next = new Map(prev);

      for (const [id, obj] of next) {
        const pos = resolveObjectPosition(obj, next, currentVariables);

        if (obj.data.arrayInfo) {
          const arrayId = obj.data.arrayInfo.id;
          let arrayLength = 0;
          const direction = obj.data.arrayInfo.direction || 'right';
          for (const [, o] of next) {
            if (o.data.arrayInfo?.id === arrayId) arrayLength++;
          }

          for (let i = 0; i < arrayLength; i++) {
            const offset = getArrayOffset(direction, i);
            if (pos.row + offset.rowDelta === position.row && pos.col + offset.colDelta === position.col) {
              for (const [oid, o] of next) {
                if (o.data.arrayInfo?.id === arrayId) {
                  next.set(oid, {
                    ...o,
                    data: {
                      ...o.data,
                      panelId: panelId || undefined,
                    },
                  });
                }
              }
              return next;
            }
          }
        } else if (pos.row === position.row && pos.col === position.col) {
          next.set(id, {
            ...obj,
            data: {
              ...obj.data,
              panelId: panelId || undefined,
            },
          });
          return next;
        }
      }

      return next;
    });
  }, [currentVariables, resolveObjectPosition]);

  const movePanel = useCallback((panelId: string, to: CellPosition) => {
    setObjects((prev) => {
      const next = new Map(prev);
      for (const [id, obj] of next) {
        if (obj.data.panel?.id === panelId) {
          next.set(id, {
            ...obj,
            positionBinding: createHardcodedBinding(to),
          });
          break;
        }
      }
      return next;
    });
  }, []);

  const updatePanel = useCallback((panelId: string, updates: { title?: string; width?: number; height?: number }) => {
    setObjects((prev) => {
      const next = new Map(prev);
      for (const [id, obj] of next) {
        if (obj.data.panel?.id === panelId) {
          const updatedPanel = { ...obj.data.panel };
          if (updates.title !== undefined) updatedPanel.title = updates.title;
          if (updates.width !== undefined) updatedPanel.width = updates.width;
          if (updates.height !== undefined) updatedPanel.height = updates.height;
          next.set(id, {
            ...obj,
            data: {
              ...obj.data,
              panel: updatedPanel,
              shapeProps: {
                ...obj.data.shapeProps,
                width: updatedPanel.width,
                height: updatedPanel.height,
              },
            },
          });
          break;
        }
      }
      return next;
    });
  }, []);

  const deletePanel = useCallback((panelId: string) => {
    setObjects((prev) => {
      const next = new Map(prev);
      // Remove panel object
      for (const [id, obj] of next) {
        if (obj.data.panel?.id === panelId) {
          next.delete(id);
          break;
        }
      }
      // Detach children from this panel (keep them but remove panelId reference)
      for (const [id, obj] of next) {
        if (obj.data.panelId === panelId) {
          next.set(id, {
            ...obj,
            data: {
              ...obj.data,
              panelId: undefined,
            },
          });
        }
      }
      return next;
    });
  }, []);

  const panelOptions = useMemo(() => {
    return Array.from(objects.values())
      .filter((obj) => obj.data.panel?.id)
      .map((obj) => ({
        id: obj.data.panel!.id,
        title: obj.data.panel!.title || obj.data.panel!.id,
      }));
  }, [objects]);

  const moveCell = useCallback((from: CellPosition, to: CellPosition) => {
    const findTarget = () => {
      for (const [id, obj] of objects) {
        // Skip panels -- they use their own drag system (movePanel)
        if (obj.data.panel) continue;

        const pos = resolveObjectPosition(obj, objects, currentVariables);
        if (obj.data.arrayInfo) {
          const arrayId = obj.data.arrayInfo.id;
          let arrayLength = 0;
          const direction = obj.data.arrayInfo.direction || 'right';
          for (const [, o] of objects) {
            if (o.data.arrayInfo?.id === arrayId) arrayLength++;
          }
          for (let i = 0; i < arrayLength; i++) {
            const offset = getArrayOffset(direction, i);
            if (pos.row + offset.rowDelta === from.row && pos.col + offset.colDelta === from.col) {
              return { id, obj, arrayId };
            }
          }
        } else if (pos.row === from.row && pos.col === from.col) {
          return { id, obj };
        }
      }
      return null;
    };

    const target = findTarget();
    if (!target) return;

    const panelContext = target.obj.data.panelId ? getPanelContextAt(from) : null;
    let relativeTarget = to;
    let extendPanel = false;
    let newPanelSize: { width: number; height: number } | null = null;
    let newPanelOrigin: CellPosition | null = null;
    let shiftRow = 0;
    let shiftCol = 0;

    if (panelContext) {
      relativeTarget = {
        row: to.row - panelContext.origin.row,
        col: to.col - panelContext.origin.col,
      };
      const outOfBounds =
        relativeTarget.row < 0 ||
        relativeTarget.col < 0 ||
        relativeTarget.row >= panelContext.height ||
        relativeTarget.col >= panelContext.width;
      if (outOfBounds) {
        const promptKey = `${panelContext.id}:${relativeTarget.row},${relativeTarget.col}`;
        if (movePromptRef.current.inFlight && movePromptRef.current.key === promptKey) {
          return;
        }
        movePromptRef.current = { key: promptKey, inFlight: true };
        const extend = window.confirm('Target is outside the panel. Extend the panel to include it?');
        movePromptRef.current = { key: promptKey, inFlight: false };
        if (!extend) return;
        extendPanel = true;
        const deltaRow = Math.min(0, relativeTarget.row);
        const deltaCol = Math.min(0, relativeTarget.col);
        shiftRow = -deltaRow;
        shiftCol = -deltaCol;
        const adjustedTarget = {
          row: relativeTarget.row + shiftRow,
          col: relativeTarget.col + shiftCol,
        };
        relativeTarget = adjustedTarget;
        newPanelOrigin = {
          row: panelContext.origin.row + deltaRow,
          col: panelContext.origin.col + deltaCol,
        };
        newPanelSize = {
          width: Math.max(panelContext.width + shiftCol, adjustedTarget.col + 1),
          height: Math.max(panelContext.height + shiftRow, adjustedTarget.row + 1),
        };
      }
    }

    setObjects((prev) => {
      const next = new Map(prev);

      const adjustComponent = (component: PositionComponent, delta: number): PositionComponent => {
        if (delta === 0) return component;
        if (component.type === 'hardcoded') {
          return { type: 'hardcoded', value: component.value + delta };
        }
        if (component.type === 'variable') {
          return { type: 'expression', expression: `${component.varName} + ${delta}` };
        }
        return { type: 'expression', expression: `(${component.expression}) + ${delta}` };
      };

      if (extendPanel && panelContext && newPanelSize && newPanelOrigin) {
        for (const [pid, pobj] of next) {
          if (pobj.data.panel?.id === panelContext.id) {
            next.set(pid, {
              ...pobj,
              data: {
                ...pobj.data,
                panel: {
                  ...pobj.data.panel,
                  width: newPanelSize.width,
                  height: newPanelSize.height,
                },
                shapeProps: { ...pobj.data.shapeProps, width: newPanelSize.width, height: newPanelSize.height },
              },
              positionBinding: createHardcodedBinding({
                row: Math.max(0, newPanelOrigin.row),
                col: Math.max(0, newPanelOrigin.col),
              }),
            });
            break;
          }
        }
        if (shiftRow !== 0 || shiftCol !== 0) {
          for (const [oid, o] of next) {
            if (o.data.panelId === panelContext.id) {
              const binding = o.positionBinding;
              next.set(oid, {
                ...o,
                positionBinding: {
                  row: adjustComponent(binding.row, shiftRow),
                  col: adjustComponent(binding.col, shiftCol),
                },
              });
            }
          }
        }
      }

      if (target.arrayId) {
        for (const [oid, o] of next) {
          if (o.data.arrayInfo?.id === target.arrayId) {
            next.set(oid, {
              ...o,
              positionBinding: createHardcodedBinding(relativeTarget),
            });
          }
        }
      } else {
        next.set(target.id, {
          ...target.obj,
          positionBinding: createHardcodedBinding(relativeTarget),
        });
      }
      return next;
    });
  }, [objects, currentVariables, getPanelContextAt, resolveObjectPosition]);

  // Get list of numeric variable names (int and float) for binding UI
  const intVariableNames = useMemo((): string[] => {
    return Object.entries(currentVariables)
      .filter(([, v]) => v.type === 'int' || v.type === 'float')
      .map(([name]) => name);
  }, [currentVariables]);

  const getObjectsSnapshot = useCallback((): GridObjectSnapshot[] => {
    return Array.from(objects.values()).map((obj) => ({
      id: obj.id,
      data: obj.data,
      positionBinding: obj.positionBinding,
    }));
  }, [objects]);

  const loadObjectsSnapshot = useCallback((snapshot: GridObjectSnapshot[]) => {
    const next = new Map<string, GridObject>();
    let maxId = -1;

    for (const obj of snapshot) {
      next.set(obj.id, {
        id: obj.id,
        data: obj.data,
        positionBinding: obj.positionBinding,
      });

      const idMatch = obj.id.match(/-(\d+)$/);
      if (idMatch) {
        maxId = Math.max(maxId, parseInt(idMatch[1], 10));
      }
      if (obj.data.arrayInfo?.id) {
        const arrayMatch = obj.data.arrayInfo.id.match(/-(\d+)$/);
        if (arrayMatch) {
          maxId = Math.max(maxId, parseInt(arrayMatch[1], 10));
        }
      }
    }

    objectIdCounter.current = maxId + 1;
    setObjects(next);
  }, []);

  return {
    cells,
    selectedCell,
    zoom,
    variables: currentVariables,
    timeline,
    currentStep,
    stepCount,
    intVariableNames,
    selectCell,
    setShape,
    clearCell,
    addArray,
    addLabel,
    addPanel,
    getPanelContextAt,
    setCellValue,
    getCellData,
    loadVariables,
    loadTimeline,
    nextStep,
    prevStep,
    goToStep,
    placeIntVariable,
    placeArrayVariable,
    zoomIn,
    zoomOut,
    setZoom,
    updateCellStyle,
    moveCell,
    setPositionBinding,
    updateShapeProps,
    updateArrayDirection,
    updateIntVarDisplay,
    setPanelForObject,
    movePanel,
    updatePanel,
    deletePanel,
    panelOptions,
    panels,
    getObjectsSnapshot,
    loadObjectsSnapshot,
  };
}
