import { useState, useCallback, useRef, useMemo } from 'react';
import type {
  CellPosition,
  CellData,
  VariableDictionary,
  PositionBinding,
  SizeValue,
  OccupantInfo,
} from '../types/grid';
import type { VisualBuilderElementBase } from '../../api/visualBuilder';
import { cellKey, createHardcodedBinding, resolveSizeValue } from '../types/grid';
import { evaluateExpression } from '../../code-builder/expressionEvaluator';
import type { ArrayDrawResult } from '../types/arrayShapes';
import { PanelCell } from '../views/PanelView';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;

interface GridObject {
  id: string;
  data: CellData;
  positionBinding: PositionBinding;
  zOrder: number;
}

export function useGridState() {
  const [objects, setObjects] = useState<Map<string, GridObject>>(new Map());
  const [zoom, setZoomLevel] = useState(1);

  const zOrderCounter = useRef(0);

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

  const panelAutoSizes = useMemo(() => {
    const sizes = new Map<string, { width: number; height: number }>();

    for (const [, obj] of objects) {
      if (!obj.data.panel) continue;
      const panelId = obj.data.panel.id;

      let maxRow = 0;
      let maxCol = 0;

      for (const [, child] of objects) {
        if (child.data.panelId !== panelId) continue;
        const childPos = resolvePositionWithErrors(child.positionBinding, currentVariables).position;

        if (child.data.panel) {
          const nestedSize = sizes.get(child.data.panel.id);
          const w = nestedSize?.width ?? (typeof child.data.panel.width === 'number' ? child.data.panel.width : 1);
          const h = nestedSize?.height ?? (typeof child.data.panel.height === 'number' ? child.data.panel.height : 1);
          maxRow = Math.max(maxRow, childPos.row + h);
          maxCol = Math.max(maxCol, childPos.col + w);
        } else if (child.data.label) {
          const w = resolveSizeValue(child.data.label.width, currentVariables, evaluateExpression) || 1;
          const h = resolveSizeValue(child.data.label.height, currentVariables, evaluateExpression) || 1;
          maxRow = Math.max(maxRow, childPos.row + h);
          maxCol = Math.max(maxCol, childPos.col + w);
        } else {
          const w = resolveSizeValue(child.data.shapeProps?.width, currentVariables, evaluateExpression) ?? 1;
          const h = resolveSizeValue(child.data.shapeProps?.height, currentVariables, evaluateExpression) ?? 1;
          maxRow = Math.max(maxRow, childPos.row + h);
          maxCol = Math.max(maxCol, childPos.col + w);
        }
      }

      sizes.set(panelId, { width: Math.max(1, maxCol), height: Math.max(1, maxRow) });
    }

    return sizes;
  }, [objects, currentVariables, resolvePositionWithErrors]);

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

    // Resolve panel positions (supports nesting: parent panels resolved before children)
    const panelPositions = new Map<string, { position: CellPosition; error?: string }>();
    for (const obj of sortedObjects) {
      if (!obj.data.panel?.id) continue;
      const resolved = resolvePositionWithErrors(obj.positionBinding, currentVariables);
      let position = resolved.position;
      let error = resolved.error;
      if (obj.data.panelId) {
        const parentPos = panelPositions.get(obj.data.panelId);
        if (parentPos) {
          position = {
            row: position.row + parentPos.position.row,
            col: position.col + parentPos.position.col,
          };
          if (parentPos.error) error = parentPos.error;
        }
      }
      panelPositions.set(obj.data.panel.id, { position, error });
    }

    // Populate occupancy for panels
    for (const obj of sortedObjects) {
      if (!obj.data.panel?.id) continue;
      const panelInfo = panelPositions.get(obj.data.panel.id);
      if (!panelInfo) continue;
      const autoSize = panelAutoSizes.get(obj.data.panel.id);
      const pw = autoSize?.width ?? 1;
      const ph = autoSize?.height ?? 1;
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

    // Unified pass: all non-panel objects (array cells are now panel children like any other object)
    for (const obj of sortedObjects) {
      if (obj.data.panel) continue;
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
          if (panelInfo.error) invalidReason = panelInfo.error;
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

      if (obj.data.arrayInfo) {
        let cellData: CellData = { ...obj.data };
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
        resolvedCellData = {
          ...cellData,
          positionBinding: obj.positionBinding,
          invalidReason: cellData.invalidReason || invalidReason,
        };
        setOrOverlay(cellKey(position.row, position.col), resolvedCellData);
      } else if (obj.data.array2dInfo) {
        let cellData: CellData = { ...obj.data };
        const info = obj.data.array2dInfo;
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
        resolvedCellData = {
          ...cellData,
          positionBinding: obj.positionBinding,
          invalidReason: cellData.invalidReason || invalidReason,
        };
        setOrOverlay(cellKey(position.row, position.col), resolvedCellData);
      } else if (obj.data.label) {
        const renderedText = renderLabelText(obj.data.label.text, currentVariables);
        const labelW = resolveSizeValue(obj.data.label.width, currentVariables, evaluateExpression) || 1;
        const labelH = resolveSizeValue(obj.data.label.height, currentVariables, evaluateExpression) || 1;
        objW = labelW;
        objH = labelH;
        resolvedCellData = {
          ...obj.data,
          label: { ...obj.data.label, text: renderedText, width: labelW, height: labelH },
          positionBinding: obj.positionBinding,
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
        };
        setOrOverlay(cellKey(position.row, position.col), resolvedCellData);
      }

      for (let r = 0; r < objH; r++) {
        for (let c = 0; c < objW; c++) {
          addOccupant(position.row + r, position.col + c, {
            cellData: resolvedCellData!,
            originRow: position.row,
            originCol: position.col,
            isPanel: false,
            zOrder: obj.zOrder,
          });
        }
      }
    }

    for (const [, list] of occMap) {
      if (list.length > 1) list.sort((a, b) => a.zOrder - b.zOrder);
    }

    return { cells: cellMap, overlayCells: overlayMap, occupancyMap: occMap };
  }, [objects, currentVariables, panelAutoSizes, renderLabelText, resolvePositionWithErrors]);

  const panels = useMemo(() => {
    const result: Array<{
      id: string;
      row: number;
      col: number;
      width: number;
      height: number;
      title?: string;
      arrayType?: '1d' | '2d';
      invalidReason?: string;
    }> = [];

    // Resolve positions with nesting support (same logic as cell computation)
    const positions = new Map<string, { position: CellPosition; error?: string }>();
    for (const [, obj] of objects) {
      if (!obj.data.panel) continue;
      const resolved = resolvePositionWithErrors(obj.positionBinding, currentVariables);
      let position = resolved.position;
      let error = resolved.error;
      if (obj.data.panelId) {
        const parentPos = positions.get(obj.data.panelId);
        if (parentPos) {
          position = {
            row: position.row + parentPos.position.row,
            col: position.col + parentPos.position.col,
          };
          if (parentPos.error) error = parentPos.error;
        }
      }
      positions.set(obj.data.panel.id, { position, error });
    }

    for (const [, obj] of objects) {
      if (!obj.data.panel) continue;
      const posInfo = positions.get(obj.data.panel.id);
      if (!posInfo) continue;
      const autoSize = panelAutoSizes.get(obj.data.panel.id);
      result.push({
        id: obj.data.panel.id,
        row: posInfo.position.row,
        col: posInfo.position.col,
        width: autoSize?.width ?? 1,
        height: autoSize?.height ?? 1,
        title: obj.data.panel.title,
        arrayType: obj.data.panel.arrayType,
        invalidReason: posInfo.error ?? undefined,
      });
    }

    return result;
  }, [objects, currentVariables, panelAutoSizes, resolvePositionWithErrors]);

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

  const loadVisualBuilderObjects = useCallback((elements: VisualBuilderElementBase[]) => {
    setObjects((prev) => {
      const next = new Map(prev);
      for (const [id] of next) {
        if (id.startsWith(VB_PREFIX)) next.delete(id);
      }

      const panelIdMap = new Map<string, { gridId: string; origin: CellPosition }>();
      let idx = 0;
      let z = zOrderCounter.current++;

      // First pass: add regular panels and record their positions
      for (const el of elements) {
        if (el.type !== 'panel') continue;
        const [row, col] = el.position;
        const elAny = el as any;
        const width = elAny.width ?? 5;
        const height = elAny.height ?? 5;
        const gridId = `${VB_PREFIX}panel-${idx++}`;
        panelIdMap.set(gridId, { gridId, origin: { row, col } });
        const panelCell = new PanelCell({ id: gridId, title: elAny.name });
        next.set(gridId, {
          id: gridId,
          data: {
            objectId: gridId,
            elementInfo: panelCell as any,
            panel: { id: gridId, width, height, title: elAny.name },
            shapeProps: { width, height },
            zOrder: z,
          },
          positionBinding: createHardcodedBinding({ row, col }),
          zOrder: z++,
        });
      }

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
        let parentPanelId: string | undefined;
        if (el.panelId) {
          const gridPanelId = serializedPanelIdToGridId.get(el.panelId) ?? el.panelId;
          const info = panelIdMap.get(gridPanelId);
          if (info) {
            row = row + info.origin.row;
            col = col + info.origin.col;
            parentPanelId = gridPanelId;
          }
        }
        const pos: CellPosition = { row, col };
        const targetPosition = parentPanelId ? { row: el.position[0], col: el.position[1] } : pos;

        if ('draw' in el && typeof (el as Record<string, unknown>).draw === 'function') {
          const drawResult = (el as Record<string, unknown> & { draw: (i: number, prefix: string) => Record<string, unknown> }).draw(idx, VB_PREFIX);

          if ('panel' in drawResult && 'cells' in drawResult) {
            // Array panel draw result: { panel, panelOffset, cells, nextIdx }
            const { panel: panelInfo, panelOffset, cells: drawCells, nextIdx } =
              drawResult as unknown as ArrayDrawResult;

            const panelRow = el.position[0] + (panelOffset?.row ?? 0);
            const panelCol = el.position[1] + (panelOffset?.col ?? 0);

            const panelBinding = createHardcodedBinding({ row: panelRow, col: panelCol });

            const panelGridId = panelInfo.id;
            panelIdMap.set(panelGridId, { gridId: panelGridId, origin: { row: panelRow + (parentPanelId ? panelIdMap.get(parentPanelId)!.origin.row : 0), col: panelCol + (parentPanelId ? panelIdMap.get(parentPanelId)!.origin.col : 0) } });
            const arrayPanelCell = new PanelCell({ id: panelGridId, title: panelInfo.title });
            next.set(panelGridId, {
              id: panelGridId,
              data: {
                objectId: panelGridId,
                elementInfo: arrayPanelCell as any,
                panel: {
                  id: panelGridId,
                  width: panelInfo.width,
                  height: panelInfo.height,
                  title: panelInfo.title,
                  arrayType: panelInfo.arrayType,
                },
                shapeProps: { width: panelInfo.width, height: panelInfo.height },
                panelId: parentPanelId,
                zOrder: z,
              },
              positionBinding: panelBinding,
              zOrder: z++,
            });

            for (const cell of drawCells) {
              next.set(cell.cellId, {
                id: cell.cellId,
                data: { ...cell.data, objectId: cell.cellId, panelId: panelGridId, zOrder: z },
                positionBinding: createHardcodedBinding({ row: cell.position[0], col: cell.position[1] }),
                zOrder: z++,
              });
            }
            idx = nextIdx;
          } else if ('cells' in drawResult) {
            const { cells: drawCells, nextIdx } = drawResult as { cells: Array<{ cellId: string; data: CellData }>; nextIdx: number };
            const binding = createHardcodedBinding(targetPosition);
            for (const cell of drawCells) {
              next.set(cell.cellId, {
                id: cell.cellId,
                data: { ...cell.data, objectId: cell.cellId, panelId: parentPanelId, zOrder: z },
                positionBinding: binding,
                zOrder: z++,
              });
            }
            idx = nextIdx;
          } else {
            const binding = createHardcodedBinding(targetPosition);
            next.set(gridId, {
              id: gridId,
              data: { ...(drawResult as CellData), objectId: gridId, panelId: parentPanelId, zOrder: z },
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
