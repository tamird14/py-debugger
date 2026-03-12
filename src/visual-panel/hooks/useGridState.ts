import { useState, useCallback, useRef, useMemo } from 'react';
import type {
  CellPosition,
  RenderableObjectData,
  OccupantInfo,
  PanelStyle,
} from '../types/grid';
import type { VisualBuilderElementBase } from '../../api/visualBuilder';
import { cellKey } from '../types/grid';
import { type ArrayDrawResult, PanelCell } from '../render-objects';
import { hasHandler } from '../handlersState';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;

interface GridObject {
  id: string;
  data: RenderableObjectData;
  position: CellPosition;
  zOrder: number;
}

export function useGridState() {
  const [objects, setObjects] = useState<Map<string, GridObject>>(new Map());
  const [zoom, setZoomLevel] = useState(1);

  const zOrderCounter = useRef(0);

  const panelAutoSizes = useMemo(() => {
    const sizes = new Map<string, { width: number; height: number }>();

    for (const [, obj] of objects) {
      if (!obj.data.panel) continue;
      const panelId = obj.data.panel.id;

      let maxRow = 0;
      let maxCol = 0;

      for (const [, child] of objects) {
        if (child.data.panelId !== panelId) continue;
        const childPos = child.position;

        let w = 1;
        let h = 1;

        if (child.data.panel) {
          const nestedSize = sizes.get(child.data.panel.id);
          w = nestedSize?.width ?? child.data.panel.width ?? 1;
          h = nestedSize?.height ?? child.data.panel.height ?? 1;
        } else {
          w = child.data.shapeProps?.width ?? 1;
          h = child.data.shapeProps?.height ?? 1;
        }

        maxRow = Math.max(maxRow, childPos.row + h);
        maxCol = Math.max(maxCol, childPos.col + w);
      }

      sizes.set(panelId, { width: Math.max(1, maxCol), height: Math.max(1, maxRow) });
    }

    return sizes;
  }, [objects]);

  const { cells, overlayCells, occupancyMap } = useMemo((): {
    cells: Map<string, RenderableObjectData>;
    overlayCells: Map<string, RenderableObjectData>;
    occupancyMap: Map<string, OccupantInfo[]>;
  } => {
    const cellMap = new Map<string, RenderableObjectData>();
    const overlayMap = new Map<string, RenderableObjectData>();
    const occMap = new Map<string, OccupantInfo[]>();
    const sortedObjects = Array.from(objects.values()).sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0));

    const addOccupant = (row: number, col: number, info: OccupantInfo) => {
      const key = cellKey(row, col);
      const list = occMap.get(key);
      if (list) list.push(info);
      else occMap.set(key, [info]);
    };

    // Resolve panel positions (supports nesting: parent panels resolved before children)
    const panelPositions = new Map<string, CellPosition>();
    for (const obj of sortedObjects) {
      if (!obj.data.panel?.id) continue;
      let position = { ...obj.position };
      if (obj.data.panelId) {
        const parentPos = panelPositions.get(obj.data.panelId);
        if (parentPos) {
          position = {
            row: position.row + parentPos.row,
            col: position.col + parentPos.col,
          };
        }
      }
      panelPositions.set(obj.data.panel.id, position);
    }

    // Populate occupancy for panels
    for (const obj of sortedObjects) {
      if (!obj.data.panel?.id) continue;
      const panelPos = panelPositions.get(obj.data.panel.id);
      if (!panelPos) continue;
      const autoSize = panelAutoSizes.get(obj.data.panel.id);
      const pw = autoSize?.width ?? 1;
      const ph = autoSize?.height ?? 1;
      for (let r = 0; r < ph; r++) {
        for (let c = 0; c < pw; c++) {
          addOccupant(panelPos.row + r, panelPos.col + c, {
            cellData: obj.data,
            originRow: panelPos.row,
            originCol: panelPos.col,
            isPanel: true,
            zOrder: obj.zOrder,
          });
        }
      }
    }

    const setOrOverlay = (key: string, cellData: RenderableObjectData) => {
      if (!cellMap.has(key)) {
        cellMap.set(key, cellData);
      } else {
        let n = 0;
        while (overlayMap.has(`${key},${n}`)) n++;
        overlayMap.set(`${key},${n}`, cellData);
      }
    };

    // Unified pass: all non-panel objects
    for (const obj of sortedObjects) {
      if (obj.data.panel) continue;
      let position = { ...obj.position };
      let invalidReason: string | undefined;

      if (obj.data.panelId) {
        const panelPos = panelPositions.get(obj.data.panelId);
        if (panelPos) {
          position = {
            row: position.row + panelPos.row,
            col: position.col + panelPos.col,
          };
        } else {
          invalidReason = `Panel "${obj.data.panelId}" not found`;
        }
      }
      position = {
        row: Math.max(0, Math.min(49, position.row)),
        col: Math.max(0, Math.min(49, position.col)),
      };

      const objW = obj.data.shapeProps?.width ?? 1;
      const objH = obj.data.shapeProps?.height ?? 1;
      const resolvedRenderableObjectData: RenderableObjectData = {
        ...obj.data,
        invalidReason,
      };
      setOrOverlay(cellKey(position.row, position.col), resolvedRenderableObjectData);

      for (let r = 0; r < objH; r++) {
        for (let c = 0; c < objW; c++) {
          addOccupant(position.row + r, position.col + c, {
            cellData: resolvedRenderableObjectData,
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
  }, [objects, panelAutoSizes]);

  const panels = useMemo(() => {
    const result: Array<{
      id: string;
      row: number;
      col: number;
      width: number;
      height: number;
      title?: string;
      panelStyle?: PanelStyle;
      invalidReason?: string;
    }> = [];

    // Resolve positions with nesting support
    const positions = new Map<string, CellPosition>();
    for (const [, obj] of objects) {
      if (!obj.data.panel) continue;
      let position = { ...obj.position };
      if (obj.data.panelId) {
        const parentPos = positions.get(obj.data.panelId);
        if (parentPos) {
          position = {
            row: position.row + parentPos.row,
            col: position.col + parentPos.col,
          };
        }
      }
      positions.set(obj.data.panel.id, position);
    }

    for (const [, obj] of objects) {
      if (!obj.data.panel) continue;
      const pos = positions.get(obj.data.panel.id);
      if (!pos) continue;
      const autoSize = panelAutoSizes.get(obj.data.panel.id);
      result.push({
        id: obj.data.panel.id,
        row: pos.row,
        col: pos.col,
        width: autoSize?.width ?? 1,
        height: autoSize?.height ?? 1,
        title: obj.data.panel.title,
        panelStyle: obj.data.panel.panelStyle,
      });
    }

    return result;
  }, [objects, panelAutoSizes]);

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
          position: { row, col },
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
        const rawElemId = (el as any)._elemId as number | undefined;
        const gridId = rawElemId != null ? `${VB_PREFIX}elem-${rawElemId}` : `${VB_PREFIX}${idx++}`;
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
                  panelStyle: panelInfo.panelStyle,
                },
                shapeProps: { width: panelInfo.width, height: panelInfo.height },
                panelId: parentPanelId,
                zOrder: z,
              },
              position: { row: panelRow, col: panelCol },
              zOrder: z++,
            });

            for (const cell of drawCells) {
              next.set(cell.cellId, {
                id: cell.cellId,
                data: { ...cell.data, objectId: cell.cellId, panelId: panelGridId, zOrder: z },
                position: { row: cell.position[0], col: cell.position[1] },
                zOrder: z++,
              });
            }
            idx = nextIdx;
          } else if ('cells' in drawResult) {
            const { cells: drawCells, nextIdx } = drawResult as { cells: Array<{ cellId: string; data: RenderableObjectData }>; nextIdx: number };
            for (const cell of drawCells) {
              next.set(cell.cellId, {
                id: cell.cellId,
                data: { ...cell.data, objectId: cell.cellId, panelId: parentPanelId, zOrder: z },
                position: targetPosition,
                zOrder: z++,
              });
            }
            idx = nextIdx;
          } else {
            const elemId = (el as any)._elemId as number | undefined;
            const clickData = elemId != null && hasHandler(elemId, 'on_click')
              ? { elemId, position: el.position as [number, number] }
              : undefined;
            next.set(gridId, {
              id: gridId,
              data: { ...(drawResult as RenderableObjectData), objectId: gridId, panelId: parentPanelId, zOrder: z, userZ: (el as any).z ?? 0, clickData },
              position: targetPosition,
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
