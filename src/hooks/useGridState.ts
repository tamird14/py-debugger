import { useState, useCallback, useRef, useMemo } from 'react';
import type {
  CellPosition,
  ShapeType,
  CellData,
  VariableDictionary,
  CellStyle,
  Timeline,
  PositionBinding,
} from '../types/grid';
import { cellKey, resolvePosition, createHardcodedBinding } from '../types/grid';
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

export function useGridState() {
  // Objects are stored by ID, not position (allows position binding)
  const [objects, setObjects] = useState<Map<string, GridObject>>(new Map());
  const [selectedCell, setSelectedCell] = useState<CellPosition | null>(null);
  const [zoom, setZoomLevel] = useState(1);

  // Timeline state
  const [timeline, setTimeline] = useState<Timeline>([]);
  const [currentStep, setCurrentStep] = useState(0);

  const objectIdCounter = useRef(0);

  // Current variables from timeline
  const currentVariables = useMemo((): VariableDictionary => {
    if (timeline.length === 0) return {};
    return timeline[Math.min(currentStep, timeline.length - 1)] || {};
  }, [timeline, currentStep]);

  const stepCount = timeline.length;

  // Compute cell positions from objects and current variables
  const cells = useMemo((): Map<string, CellData> => {
    const cellMap = new Map<string, CellData>();

    for (const [, obj] of objects) {
      const position = resolvePosition(obj.positionBinding, currentVariables, evaluateExpression);

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
          const cellPos = { row: position.row, col: position.col + i };

          // Update array values from current variables if this is a variable-bound array
          let cellData = { ...arrayObj.data };
          if (cellData.arrayInfo?.varName) {
            const arrVar = currentVariables[cellData.arrayInfo.varName];
            if (arrVar && arrVar.type === 'arr[int]') {
              const newValue = arrVar.value[cellData.arrayInfo.index];
              if (newValue !== undefined) {
                cellData = {
                  ...cellData,
                  arrayInfo: {
                    ...cellData.arrayInfo,
                    value: newValue,
                  },
                };
              }
            }
          }

          // Only place the first cell of the array with position binding
          if (i === 0) {
            cellData = { ...cellData, positionBinding: obj.positionBinding };
          }

          cellMap.set(cellKey(cellPos.row, cellPos.col), cellData);
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
        }
        cellMap.set(cellKey(position.row, position.col), cellData);
      } else {
        // Shapes - just place at resolved position
        cellMap.set(cellKey(position.row, position.col), {
          ...obj.data,
          positionBinding: obj.positionBinding,
        });
      }
    }

    return cellMap;
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
      const pos = resolvePosition(obj.positionBinding, variables, evaluateExpression);

      if (obj.data.arrayInfo) {
        // For arrays, check if any cell overlaps
        const arrayId = obj.data.arrayInfo.id;
        let arrayLength = 0;
        let isFirstCell = true;

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
            const arrayCol = pos.col + i;
            for (let j = 0; j < length; j++) {
              if (pos.row === row && arrayCol === startCol + j) {
                // If overlapping with arr[0], clear entire array
                if (i === 0 || obj.data.arrayInfo.index === 0) {
                  objectsToClear.add(arrayId);
                }
              }
            }
          }
        }
      } else {
        // Single cell objects
        for (let j = 0; j < length; j++) {
          if (pos.row === row && pos.col === startCol + j) {
            objectsToClear.add(id);
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

  const setShape = useCallback((position: CellPosition, shape: ShapeType) => {
    const objectId = generateObjectId();
    setObjects((prev) => {
      const next = clearOverlappingObjects(prev, position.row, position.col, 1, currentVariables);
      next.set(objectId, {
        id: objectId,
        data: { shape, objectId },
        positionBinding: createHardcodedBinding(position),
      });
      return next;
    });
  }, [generateObjectId, clearOverlappingObjects, currentVariables]);

  const clearCell = useCallback((position: CellPosition) => {
    setObjects((prev) => {
      const next = new Map(prev);

      // Find object at this position
      for (const [id, obj] of next) {
        const pos = resolvePosition(obj.positionBinding, currentVariables, evaluateExpression);

        if (obj.data.arrayInfo) {
          // Check if this position is part of this array
          const arrayId = obj.data.arrayInfo.id;
          let arrayLength = 0;
          for (const [, o] of next) {
            if (o.data.arrayInfo?.id === arrayId) arrayLength++;
          }

          for (let i = 0; i < arrayLength; i++) {
            if (pos.row === position.row && pos.col + i === position.col) {
              // Clear entire array
              for (const [oid, o] of next) {
                if (o.data.arrayInfo?.id === arrayId) {
                  next.delete(oid);
                }
              }
              return next;
            }
          }
        } else if (pos.row === position.row && pos.col === position.col) {
          next.delete(id);
          return next;
        }
      }

      return next;
    });
  }, [currentVariables]);

  const addArray = useCallback((position: CellPosition, length: number) => {
    const arrayId = `array-${objectIdCounter.current++}`;

    setObjects((prev) => {
      const next = clearOverlappingObjects(prev, position.row, position.col, length, currentVariables);
      const binding = createHardcodedBinding(position);

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
            },
          },
          positionBinding: binding, // All array cells share the same binding (first cell position)
        });
      }
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

  const placeIntVariable = useCallback((position: CellPosition, name: string, value: number) => {
    const objectId = generateObjectId();
    setObjects((prev) => {
      const next = clearOverlappingObjects(prev, position.row, position.col, 1, currentVariables);
      next.set(objectId, {
        id: objectId,
        data: {
          objectId,
          intVar: { name, value },
        },
        positionBinding: createHardcodedBinding(position),
      });
      return next;
    });
  }, [generateObjectId, clearOverlappingObjects, currentVariables]);

  const placeArrayVariable = useCallback((position: CellPosition, name: string, values: number[]) => {
    const arrayId = `array-${objectIdCounter.current++}`;

    setObjects((prev) => {
      const next = clearOverlappingObjects(prev, position.row, position.col, values.length, currentVariables);
      const binding = createHardcodedBinding(position);

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
            },
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
        const pos = resolvePosition(obj.positionBinding, currentVariables, evaluateExpression);

        if (obj.data.arrayInfo) {
          // Find which index this position corresponds to
          const arrayId = obj.data.arrayInfo.id;
          let found = false;

          for (const [oid, o] of next) {
            if (o.data.arrayInfo?.id === arrayId) {
              const idx = o.data.arrayInfo.index;
              if (pos.row === position.row && pos.col + idx === position.col) {
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
        const pos = resolvePosition(obj.positionBinding, currentVariables, evaluateExpression);

        if (obj.data.arrayInfo) {
          // Check if this position is part of this array
          const arrayId = obj.data.arrayInfo.id;
          let arrayLength = 0;
          for (const [, o] of next) {
            if (o.data.arrayInfo?.id === arrayId) arrayLength++;
          }

          for (let i = 0; i < arrayLength; i++) {
            if (pos.row === position.row && pos.col + i === position.col) {
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
    setObjects((prev) => {
      const next = new Map(prev);

      for (const [id, obj] of next) {
        const pos = resolvePosition(obj.positionBinding, currentVariables, evaluateExpression);

        if (obj.data.arrayInfo) {
          // Check if this position is part of this array
          const arrayId = obj.data.arrayInfo.id;
          let arrayLength = 0;
          for (const [, o] of next) {
            if (o.data.arrayInfo?.id === arrayId) arrayLength++;
          }

          for (let i = 0; i < arrayLength; i++) {
            if (pos.row === position.row && pos.col + i === position.col) {
              // Update binding for all cells in array
              for (const [oid, o] of next) {
                if (o.data.arrayInfo?.id === arrayId) {
                  next.set(oid, {
                    ...o,
                    positionBinding: binding,
                  });
                }
              }
              return next;
            }
          }
        } else if (pos.row === position.row && pos.col === position.col) {
          next.set(id, {
            ...obj,
            positionBinding: binding,
          });
          return next;
        }
      }

      return next;
    });
  }, [currentVariables]);

  const moveCell = useCallback((from: CellPosition, to: CellPosition) => {
    // Update the position binding to new hardcoded position
    setPositionBinding(from, createHardcodedBinding(to));
  }, [setPositionBinding]);

  // Get list of int variable names for binding UI
  const intVariableNames = useMemo((): string[] => {
    return Object.entries(currentVariables)
      .filter(([, v]) => v.type === 'int')
      .map(([name]) => name);
  }, [currentVariables]);

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
  };
}
