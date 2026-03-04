import { useState, useCallback, useRef, useMemo } from 'react';
import type {
  CellPosition,
  CellData,
  VariableDictionary,
  PositionBinding,
  SizeValue,
  OccupantInfo,
  ArrayCellSize,
} from '../types/grid';
import type { VisualBuilderElement } from '../types/visualBuilder';
import { cellKey, createHardcodedBinding, getArrayOffset, getAccumulatedArrayOffset, resolveSizeValue } from '../types/grid';
import { evaluateExpression, getExpressionVariables } from '../utils/expressionEvaluator';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;

// Object storage - keyed by objectId, stores the object definition
interface GridObject {
  id: string;
  data: CellData;
  positionBinding: PositionBinding;
  zOrder: number;
}

/**
 * Collect per-cell sizes for an array from the objects map.
 * Returns an array of { width, height } ordered by cell index.
 * For value arrays (no elementConfig), all cells are 1x1.
 */
function collectArrayCellSizes(arrayId: string, objectsMap: Map<string, GridObject>): ArrayCellSize[] {
  const cells: { index: number; width: number; height: number }[] = [];
  for (const [, obj] of objectsMap) {
    if (obj.data.arrayInfo?.id === arrayId) {
      const cfg = obj.data.arrayInfo.elementConfig;
      cells.push({
        index: obj.data.arrayInfo.index,
        width: cfg?.width ?? 1,
        height: cfg?.height ?? 1,
      });
    }
  }
  cells.sort((a, b) => a.index - b.index);
  return cells.map(c => ({ width: c.width, height: c.height }));
}

export function useGridState() {
  const [objects, setObjects] = useState<Map<string, GridObject>>(new Map());
  const [zoom, setZoomLevel] = useState(1);

  const zOrderCounter = useRef(0);

  const isSizeResizable = useCallback((w: SizeValue | undefined, h: SizeValue | undefined): boolean => {
    const noVars = (v: SizeValue | undefined) => {
      if (v === undefined || typeof v === 'number') return true;
      if (v.type === 'fixed') return true;
      return getExpressionVariables(v.expression).length === 0;
    };
    return noVars(w) && noVars(h);
  }, []);

  const resolvePositionWithErrors = useCallback(
    (binding: PositionBinding, vars: VariableDictionary): { position: CellPosition; error?: string } => {
      const resolveComponent = (component: PositionBinding['row']): { value: number; error?: string } => {
        if (component.type === 'fixed' || component.type === 'hardcoded') {
          return { value: component.value };
        }
        if (component.type === 'variable') {
          const variable = vars[component.varName];
          if (!variable || (variable.type !== 'int' && variable.type !== 'float')) {
            return { value: 0, error: `Variable "${component.varName}" not available` };
          }
          return { value: variable.value };
        }
        if (component.type === 'expression') {
          try {
            return { value: evaluateExpression(component.expression, vars) };
          } catch (error) {
            return {
              value: 0,
              error: error instanceof Error ? error.message : 'Expression error',
            };
          }
        }
        return { value: 0 };
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

  const currentVariables = useMemo((): VariableDictionary => ({}), []);

  const renderLabelText = useCallback((template: string, vars: VariableDictionary): string => {
    return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_match, varName) => {
      const value = vars[varName];
      if (!value) return `{${varName}}`;
      if (value.type === 'arr[int]') return `[${value.value.join(', ')}]`;
      if (value.type === 'float' || value.type === 'int') return `${value.value}`;
      return `${(value as { value: string }).value}`;
    });
  }, []);

  // Compute cell positions from objects and current variables.
  // Array cells take priority so they are never overwritten by a shape/label; displaced single objects go in overlayCells.
  // Also builds occupancyMap: for every covered cell, an array of all occupants (sorted by z-order).
  const { cells, overlayCells, occupancyMap } = useMemo((): {
    cells: Map<string, CellData>;
    overlayCells: Map<string, CellData>;
    occupancyMap: Map<string, OccupantInfo[]>;
  } => {
    const cellMap = new Map<string, CellData>();
    const overlayMap = new Map<string, CellData>();
    const occMap = new Map<string, OccupantInfo[]>();
    const sortedObjects = Array.from(objects.values()).sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0));

    const addOccupant = (row: number, col: number, info: OccupantInfo) => {
      const key = cellKey(row, col);
      const list = occMap.get(key);
      if (list) list.push(info);
      else occMap.set(key, [info]);
    };

    const panelPositions = new Map<string, { position: CellPosition; error?: string }>();
    for (const obj of sortedObjects) {
      if (!obj.data.panel) continue;
      if (obj.data.panel?.id) {
        const resolved = resolvePositionWithErrors(obj.positionBinding, currentVariables);
        panelPositions.set(obj.data.panel.id, {
          position: resolved.position,
          error: resolved.error,
        });
      }
    }

    // Populate occupancy for panels
    for (const obj of sortedObjects) {
      if (!obj.data.panel?.id) continue;
      const panelInfo = panelPositions.get(obj.data.panel.id);
      if (!panelInfo) continue;
      const pw = resolveSizeValue(obj.data.panel.width, currentVariables, evaluateExpression);
      const ph = resolveSizeValue(obj.data.panel.height, currentVariables, evaluateExpression);
      for (let r = 0; r < ph; r++) {
        for (let c = 0; c < pw; c++) {
          addOccupant(panelInfo.position.row + r, panelInfo.position.col + c, {
            cellData: obj.data,
            originRow: panelInfo.position.row,
            originCol: panelInfo.position.col,
            isPanel: true,
            zOrder: obj.zOrder,
          });
        }
      }
    }

    const setOrOverlay = (key: string, cellData: CellData) => {
      if (cellMap.has(key)) overlayMap.set(key, cellData);
      else cellMap.set(key, cellData);
    };

    // Pass 1: set all array cells first so they are never overwritten
    for (const obj of sortedObjects) {
      if (obj.data.panel || !obj.data.arrayInfo) continue;
      const resolved = resolvePositionWithErrors(obj.positionBinding, currentVariables);
      let position = resolved.position;
      let invalidReason = resolved.error;
      if (obj.data.panelId) {
        const panelInfo = panelPositions.get(obj.data.panelId);
        if (panelInfo) {
          position = { row: position.row + panelInfo.position.row, col: position.col + panelInfo.position.col };
          if (panelInfo.error) invalidReason = panelInfo.error;
        } else invalidReason = `Panel "${obj.data.panelId}" not found`;
      }
      position = { row: Math.max(0, Math.min(49, position.row)), col: Math.max(0, Math.min(49, position.col)) };

      const arrayId = obj.data.arrayInfo.id;
      const arrayObjects: GridObject[] = [];
      for (const [, o] of objects) {
        if (o.data.arrayInfo?.id === arrayId) arrayObjects.push(o);
      }
      arrayObjects.sort((a, b) => (a.data.arrayInfo?.index || 0) - (b.data.arrayInfo?.index || 0));

      const cellSizes = collectArrayCellSizes(arrayId, objects);

      for (let i = 0; i < arrayObjects.length; i++) {
        const arrayObj = arrayObjects[i];
        const direction = arrayObj.data.arrayInfo?.direction || 'right';
        const offset = cellSizes.length > 0 && cellSizes.some(s => s.width > 1 || s.height > 1)
          ? getAccumulatedArrayOffset(direction, i, cellSizes)
          : getArrayOffset(direction, i);
        const cellPos = { row: position.row + offset.rowDelta, col: position.col + offset.colDelta };

        const elemCfg = arrayObj.data.arrayInfo?.elementConfig;
        if (elemCfg?.visible === false) {
          continue;
        }

        let cellData: CellData = { ...arrayObj.data };
        if (cellData.arrayInfo?.varName) {
          const arrVar = currentVariables[cellData.arrayInfo.varName];
          if (arrVar && (arrVar.type === 'arr[int]' || arrVar.type === 'arr[str]')) {
            const newValue = arrVar.value[cellData.arrayInfo.index];
            if (newValue !== undefined) {
              cellData = { ...cellData, arrayInfo: { ...cellData.arrayInfo!, value: newValue } };
            } else {
              cellData = { ...cellData, invalidReason: `Index ${cellData.arrayInfo.index} out of bounds` };
            }
          } else {
            cellData = { ...cellData, invalidReason: `Array "${cellData.arrayInfo.varName}" not available` };
          }
        }
        cellData = { ...cellData, positionBinding: obj.positionBinding };
        const resolvedCellData = { ...cellData, invalidReason: cellData.invalidReason || invalidReason };
        cellMap.set(cellKey(cellPos.row, cellPos.col), resolvedCellData);

        const cellW = elemCfg?.width ?? 1;
        const cellH = elemCfg?.height ?? 1;
        for (let r = 0; r < cellH; r++) {
          for (let c = 0; c < cellW; c++) {
            addOccupant(cellPos.row + r, cellPos.col + c, {
              cellData: resolvedCellData,
              originRow: position.row,
              originCol: position.col,
              isPanel: false,
              zOrder: obj.zOrder,
            });
          }
        }
      }
    }

    // Pass 1b: set all 2D array cells (anchor cell row=0,col=0 drives the position)
    for (const obj of sortedObjects) {
      if (obj.data.panel || !obj.data.array2dInfo) continue;
      if (obj.data.array2dInfo.row !== 0 || obj.data.array2dInfo.col !== 0) continue;

      const resolved = resolvePositionWithErrors(obj.positionBinding, currentVariables);
      let position = resolved.position;
      let invalidReason = resolved.error;
      if (obj.data.panelId) {
        const panelInfo = panelPositions.get(obj.data.panelId);
        if (panelInfo) {
          position = { row: position.row + panelInfo.position.row, col: position.col + panelInfo.position.col };
          if (panelInfo.error) invalidReason = panelInfo.error;
        } else {
          invalidReason = `Panel "${obj.data.panelId}" not found`;
        }
      }
      position = { row: Math.max(0, Math.min(49, position.row)), col: Math.max(0, Math.min(49, position.col)) };

      const arrayId = obj.data.array2dInfo.id;
      const array2dObjects: GridObject[] = [];
      for (const [, o] of objects) {
        if (o.data.array2dInfo?.id === arrayId) array2dObjects.push(o);
      }

      for (const cellObj of array2dObjects) {
        const info = cellObj.data.array2dInfo!;
        const cellPos = {
          row: Math.min(49, position.row + info.row),
          col: Math.min(49, position.col + info.col),
        };

        let cellData: CellData = { ...cellObj.data };
        if (info.varName) {
          const arrVar = currentVariables[info.varName];
          if (arrVar && (arrVar.type === 'arr2d[int]' || arrVar.type === 'arr2d[str]')) {
            const newValue = (arrVar.value as (number | string)[][])[info.row]?.[info.col];
            if (newValue !== undefined) {
              cellData = { ...cellData, array2dInfo: { ...info, value: newValue } };
            } else {
              cellData = { ...cellData, invalidReason: `Index [${info.row}][${info.col}] out of bounds` };
            }
          } else {
            cellData = { ...cellData, invalidReason: `Array "${info.varName}" not available` };
          }
        }
        cellData = { ...cellData, positionBinding: obj.positionBinding };
        const resolvedCellData = { ...cellData, invalidReason: cellData.invalidReason || invalidReason };
        cellMap.set(cellKey(cellPos.row, cellPos.col), resolvedCellData);
        addOccupant(cellPos.row, cellPos.col, {
          cellData: resolvedCellData,
          originRow: position.row,
          originCol: position.col,
          isPanel: false,
          zOrder: obj.zOrder,
        });
      }
    }

    // Pass 2: non-array objects; if cell already occupied by array, put in overlay
    for (const obj of sortedObjects) {
      if (obj.data.panel || obj.data.arrayInfo || obj.data.array2dInfo) continue;
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

      let resolvedCellData: CellData;
      let objW = 1;
      let objH = 1;

      if (obj.data.label) {
        const renderedText = renderLabelText(obj.data.label.text, currentVariables);
        const labelW = resolveSizeValue(obj.data.label.width, currentVariables, evaluateExpression) || 1;
        const labelH = resolveSizeValue(obj.data.label.height, currentVariables, evaluateExpression) || 1;
        objW = labelW;
        objH = labelH;
        resolvedCellData = {
          ...obj.data,
          label: { ...obj.data.label, text: renderedText, width: labelW, height: labelH },
          positionBinding: obj.positionBinding,
          sizeResizable: isSizeResizable(obj.data.label.width, obj.data.label.height),
          invalidReason,
        };
        setOrOverlay(cellKey(position.row, position.col), resolvedCellData);
      } else {
        const shapeW = resolveSizeValue(obj.data.shapeProps?.width, currentVariables, evaluateExpression) ?? 1;
        const shapeH = resolveSizeValue(obj.data.shapeProps?.height, currentVariables, evaluateExpression) ?? 1;
        objW = shapeW;
        objH = shapeH;
        const rawW: SizeValue = obj.data.shapeProps?.width ?? 1;
        const rawH: SizeValue = obj.data.shapeProps?.height ?? 1;
        resolvedCellData = {
          ...obj.data,
          shapeProps: { ...obj.data.shapeProps, width: shapeW, height: shapeH },
          shapeSizeBinding: { width: rawW, height: rawH },
          invalidReason,
          positionBinding: obj.positionBinding,
          sizeResizable: isSizeResizable(obj.data.shapeProps?.width, obj.data.shapeProps?.height),
        };
        setOrOverlay(cellKey(position.row, position.col), resolvedCellData);
      }

      // Populate occupancy for all covered cells
      for (let r = 0; r < objH; r++) {
        for (let c = 0; c < objW; c++) {
          addOccupant(position.row + r, position.col + c, {
            cellData: resolvedCellData,
            originRow: position.row,
            originCol: position.col,
            isPanel: false,
            zOrder: obj.zOrder,
          });
        }
      }
    }

    // Sort each occupancy list by z-order (lowest first, highest = topmost last)
    for (const [, list] of occMap) {
      if (list.length > 1) list.sort((a, b) => a.zOrder - b.zOrder);
    }

    return { cells: cellMap, overlayCells: overlayMap, occupancyMap: occMap };
  }, [objects, currentVariables, renderLabelText, isSizeResizable, resolvePositionWithErrors]);

  const panels = useMemo(() => {
    const result: Array<{
      id: string;
      row: number;
      col: number;
      width: number;
      height: number;
      title?: string;
      invalidReason?: string;
      sizeResizable: boolean;
    }> = [];

    for (const [, obj] of objects) {
      if (!obj.data.panel) continue;
      const resolved = resolvePositionWithErrors(obj.positionBinding, currentVariables);
      const position = resolved.position;
      const width = resolveSizeValue(obj.data.panel.width, currentVariables, evaluateExpression);
      const height = resolveSizeValue(obj.data.panel.height, currentVariables, evaluateExpression);
      const invalidReason = resolved.error ?? undefined;
      result.push({
        id: obj.data.panel.id,
        row: position.row,
        col: position.col,
        width,
        height,
        title: obj.data.panel.title,
        invalidReason,
        sizeResizable: isSizeResizable(obj.data.panel.width, obj.data.panel.height),
      });
    }

    return result;
  }, [objects, currentVariables, isSizeResizable, resolvePositionWithErrors]);

  const zoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomLevel((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  }, []);

  const setZoom = useCallback((value: number) => {
    setZoomLevel(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)));
  }, []);

  const VB_PREFIX = 'vb-';

  const loadVisualBuilderObjects = useCallback((elements: VisualBuilderElement[]) => {
    setObjects((prev) => {
      const next = new Map(prev);
      for (const [id] of next) {
        if (id.startsWith(VB_PREFIX)) next.delete(id);
      }

      const panelIdMap = new Map<string, { gridId: string; origin: CellPosition }>();
      let idx = 0;
      let z = zOrderCounter.current++;

      // First pass: add panels and record their positions
      for (const el of elements) {
        if (el.type !== 'panel') continue;
        const [row, col] = el.position;
        const width = el.width ?? 5;
        const height = el.height ?? 5;
        const gridId = `${VB_PREFIX}panel-${idx++}`;
        panelIdMap.set(gridId, { gridId, origin: { row, col } });
        next.set(gridId, {
          id: gridId,
          data: {
            objectId: gridId,
            panel: { id: gridId, width, height, title: el.name },
            shapeProps: { width, height },
            zOrder: z,
          },
          positionBinding: createHardcodedBinding({ row, col }),
          zOrder: z++,
        });
      }

      // Map serialized panelId from Python (e.g. "panel-1") to our grid panel id
      const serializedPanelIdToGridId = new Map<string, string>();
      let panelIndex = 0;
      for (const el of elements) {
        if (el.type === 'panel') {
          serializedPanelIdToGridId.set(`panel-${panelIndex + 1}`, `${VB_PREFIX}panel-${panelIndex}`);
          panelIndex++;
        }
      }

      // Second pass: add non-panel elements
      for (const el of elements) {
        if (el.type === 'panel') continue;
        const gridId = `${VB_PREFIX}${idx++}`;
        let row = el.position[0];
        let col = el.position[1];
        let panelId: string | undefined;
        if (el.panelId) {
          const gridPanelId = serializedPanelIdToGridId.get(el.panelId) ?? el.panelId;
          const info = panelIdMap.get(gridPanelId);
          if (info) {
            row = row + info.origin.row;
            col = col + info.origin.col;
            panelId = gridPanelId;
          }
        }
        const pos: CellPosition = { row, col };
        const targetPosition = panelId ? { row: el.position[0], col: el.position[1] } : pos;
        const binding = createHardcodedBinding(targetPosition);

        if ('draw' in el && typeof (el as Record<string, unknown>).draw === 'function') {
          const drawResult = (el as Record<string, unknown> & { draw: (i: number, prefix: string) => Record<string, unknown> }).draw(idx, VB_PREFIX);

          if ('cells' in drawResult) {
            const { cells: drawCells, nextIdx } = drawResult as { cells: Array<{ cellId: string; data: CellData }>; nextIdx: number };
            for (const cell of drawCells) {
              next.set(cell.cellId, {
                id: cell.cellId,
                data: { ...cell.data, objectId: cell.cellId, panelId, zOrder: z },
                positionBinding: binding,
                zOrder: z++,
              });
            }
            idx = nextIdx;
          } else {
            next.set(gridId, {
              id: gridId,
              data: { ...(drawResult as CellData), objectId: gridId, panelId, zOrder: z },
              positionBinding: binding,
              zOrder: z++,
            });
          }
        }
      }

      return next;
    });
  }, []);

  return {
    cells,
    overlayCells,
    zoom,
    occupancyMap,
    zoomIn,
    zoomOut,
    setZoom,
    panels,
    loadVisualBuilderObjects,
  };
}
