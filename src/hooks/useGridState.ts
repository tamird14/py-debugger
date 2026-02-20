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
  SizeValue,
  OccupantInfo,
  ArrayCellSize,
} from '../types/grid';
import type { VisualBuilderElement, ShapeArrayElementConfig } from '../types/visualBuilder';
import { cellKey, resolvePosition, createHardcodedBinding, getArrayOffset, getAccumulatedArrayOffset, resolveSizeValue } from '../types/grid';
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

export interface GridObjectSnapshot {
  id: string;
  data: CellData;
  positionBinding: PositionBinding;
  zOrder?: number;
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
  // Objects are stored by ID, not position (allows position binding)
  const [objects, setObjects] = useState<Map<string, GridObject>>(new Map());
  const [selectedCell, setSelectedCell] = useState<CellPosition | null>(null);
  const [zoom, setZoomLevel] = useState(1);

  // Timeline state
  const [timeline, setTimeline] = useState<Timeline>([]);
  const [currentStep, setCurrentStep] = useState(0);

  const objectIdCounter = useRef(0);
  const zOrderCounter = useRef(0);

  const isSizeResizable = useCallback((w: SizeValue | undefined, h: SizeValue | undefined): boolean => {
    const noVars = (v: SizeValue | undefined) => {
      if (v === undefined || typeof v === 'number') return true;
      if (v.type === 'fixed') return true;
      return getExpressionVariables(v.expression).length === 0;
    };
    return noVars(w) && noVars(h);
  }, []);
  const movePromptRef = useRef<{ key: string; inFlight: boolean }>({ key: '', inFlight: false });
  const panelPromptRef = useRef<{ key: string; inFlight: boolean }>({ key: '', inFlight: false });

  const validateIntegerOverTimeline = useCallback((obj: GridObject, timelineData: Timeline): string | null => {
    const check = (value: number) => !Number.isInteger(value);
    for (let step = 0; step < timelineData.length; step++) {
      const vars = timelineData[step];
      const row = obj.positionBinding.row;
      if (row.type === 'expression') {
        try {
          const v = evaluateExpression(row.expression, vars);
          if (check(v)) return `Row must be integer at every step (got ${v} at step ${step + 1})`;
        } catch {
          return `Row expression invalid at step ${step + 1}`;
        }
      }
      const col = obj.positionBinding.col;
      if (col.type === 'expression') {
        try {
          const v = evaluateExpression(col.expression, vars);
          if (check(v)) return `Column must be integer at every step (got ${v} at step ${step + 1})`;
        } catch {
          return `Column expression invalid at step ${step + 1}`;
        }
      }
      if (obj.data.shapeProps) {
        const w = obj.data.shapeProps.width;
        if (w !== undefined && typeof w !== 'number' && w.type === 'expression') {
          try {
            const v = evaluateExpression(w.expression, vars);
            if (check(v)) return `Width must be integer at every step (got ${v} at step ${step + 1})`;
          } catch {
            return `Width expression invalid at step ${step + 1}`;
          }
        }
        const h = obj.data.shapeProps.height;
        if (h !== undefined && typeof h !== 'number' && h.type === 'expression') {
          try {
            const v = evaluateExpression(h.expression, vars);
            if (check(v)) return `Height must be integer at every step (got ${v} at step ${step + 1})`;
          } catch {
            return `Height expression invalid at step ${step + 1}`;
          }
        }
      }
      if (obj.data.panel) {
        const w = obj.data.panel.width;
        if (typeof w !== 'number' && w && 'expression' in w) {
          try {
            const v = evaluateExpression(w.expression, vars);
            if (check(v)) return `Panel width must be integer at every step`;
          } catch {
            return `Panel width invalid at step ${step + 1}`;
          }
        }
        const h = obj.data.panel.height;
        if (typeof h !== 'number' && h && 'expression' in h) {
          try {
            const v = evaluateExpression(h.expression, vars);
            if (check(v)) return `Panel height must be integer at every step`;
          } catch {
            return `Panel height invalid at step ${step + 1}`;
          }
        }
      }
    }
    return null;
  }, []);

  /** Validate proposed position/size over the full timeline. Returns first error message or null. Used to block Apply when invalid. */
  const validateProposedOverTimeline = useCallback(
    (
      proposed: { row?: PositionComponent; col?: PositionComponent; width?: SizeValue; height?: SizeValue },
      timelineData: Timeline
    ): string | null => {
      const check = (v: number) => !Number.isInteger(v);
      const evalPos = (c: PositionComponent, vars: VariableDictionary): number => {
        if (c.type === 'fixed' || c.type === 'hardcoded') return c.value;
        if (c.type === 'variable') {
          const x = vars[c.varName];
          if (x && (x.type === 'int' || x.type === 'float')) return (x as { value: number }).value;
          throw new Error(`Variable "${c.varName}" not available`);
        }
        return evaluateExpression(c.expression, vars);
      };
      const evalSize = (s: SizeValue | undefined, vars: VariableDictionary): number | undefined => {
        if (s === undefined) return undefined;
        if (typeof s === 'number') return s;
        if (s.type === 'fixed') return s.value;
        return evaluateExpression(s.expression, vars);
      };
      for (let step = 0; step < timelineData.length; step++) {
        const vars = timelineData[step];
        if (proposed.row !== undefined && (proposed.row.type === 'expression' || proposed.row.type === 'variable')) {
          try {
            const v = evalPos(proposed.row, vars);
            if (check(v)) return `Row must be integer at every step (got ${v} at step ${step + 1})`;
          } catch {
            return `Row expression invalid at step ${step + 1}`;
          }
        }
        if (proposed.col !== undefined && (proposed.col.type === 'expression' || proposed.col.type === 'variable')) {
          try {
            const v = evalPos(proposed.col, vars);
            if (check(v)) return `Column must be integer at every step (got ${v} at step ${step + 1})`;
          } catch {
            return `Column expression invalid at step ${step + 1}`;
          }
        }
        if (proposed.width !== undefined && typeof proposed.width !== 'number' && proposed.width.type === 'expression') {
          try {
            const v = evalSize(proposed.width, vars)!;
            if (check(v)) return `Width must be integer at every step (got ${v} at step ${step + 1})`;
          } catch {
            return `Width expression invalid at step ${step + 1}`;
          }
        }
        if (proposed.height !== undefined && typeof proposed.height !== 'number' && proposed.height.type === 'expression') {
          try {
            const v = evalSize(proposed.height, vars)!;
            if (check(v)) return `Height must be integer at every step (got ${v} at step ${step + 1})`;
          } catch {
            return `Height expression invalid at step ${step + 1}`;
          }
        }
      }
      return null;
    },
    []
  );

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
        const width = resolveSizeValue(obj.data.panel.width, currentVariables, evaluateExpression);
        const height = resolveSizeValue(obj.data.panel.height, currentVariables, evaluateExpression);
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
      const timelineIntegerError = validateIntegerOverTimeline(obj, timeline);
      if (timelineIntegerError) {
        invalidReason = invalidReason ? `${invalidReason}; ${timelineIntegerError}` : timelineIntegerError;
      }
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

    // Pass 2: non-array objects; if cell already occupied by array, put in overlay
    for (const obj of sortedObjects) {
      if (obj.data.panel || obj.data.arrayInfo) continue;
      const resolved = resolvePositionWithErrors(obj.positionBinding, currentVariables);
      let position = resolved.position;
      let invalidReason = resolved.error;
      const timelineIntegerError = validateIntegerOverTimeline(obj, timeline);
      if (timelineIntegerError) {
        invalidReason = invalidReason ? `${invalidReason}; ${timelineIntegerError}` : timelineIntegerError;
      }

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

      if (obj.data.intVar) {
        let cellData = { ...obj.data, positionBinding: obj.positionBinding };
        const intVar = currentVariables[obj.data.intVar.name];
        if (intVar && intVar.type === 'int') {
          cellData = {
            ...cellData,
            intVar: { ...cellData.intVar!, value: intVar.value },
          };
        } else if (intVar && intVar.type === 'float') {
          cellData = {
            ...cellData,
            intVar: { ...cellData.intVar!, value: Math.floor(intVar.value) },
          };
        } else {
          cellData = { ...cellData, invalidReason: `Variable "${obj.data.intVar.name}" not available` };
        }
        resolvedCellData = { ...cellData, invalidReason: cellData.invalidReason || invalidReason };
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
          sizeResizable: isSizeResizable(obj.data.label.width, obj.data.label.height),
          invalidReason,
        };
        setOrOverlay(cellKey(position.row, position.col), resolvedCellData);
      } else {
        const shapeW = resolveSizeValue(obj.data.shapeProps?.width, currentVariables, evaluateExpression) || 1;
        const shapeH = resolveSizeValue(obj.data.shapeProps?.height, currentVariables, evaluateExpression) || 1;
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
  }, [objects, currentVariables, renderLabelText, timeline, validateIntegerOverTimeline, isSizeResizable]);

  // Precompute all positions and sizes across timeline for objects with expression-based position/size
  const precomputedBounds = useMemo((): Map<string, { positions: CellPosition[]; sizes: Array<{ w: number; h: number }> }> => {
    const map = new Map<string, { positions: CellPosition[]; sizes: Array<{ w: number; h: number }> }>();
    for (const [, obj] of objects) {
      const hasExprPosition =
        obj.positionBinding.row.type === 'expression' || obj.positionBinding.col.type === 'expression';
      const w = obj.data.shapeProps?.width ?? obj.data.label?.width ?? obj.data.panel?.width;
      const h = obj.data.shapeProps?.height ?? obj.data.label?.height ?? obj.data.panel?.height;
      const hasExprSize =
        (typeof w !== 'number' && w?.type === 'expression') ||
        (typeof h !== 'number' && h?.type === 'expression');
      if (!hasExprPosition && !hasExprSize) continue;
      const positions: CellPosition[] = [];
      const sizes: Array<{ w: number; h: number }> = [];
      for (let step = 0; step < timeline.length; step++) {
        const vars = timeline[step];
        const pos = resolvePosition(obj.positionBinding, vars, evaluateExpression);
        positions.push({ row: Math.max(0, Math.min(49, pos.row)), col: Math.max(0, Math.min(49, pos.col)) });
        const width = resolveSizeValue(w, vars, evaluateExpression);
        const height = resolveSizeValue(h, vars, evaluateExpression);
        sizes.push({ w: width, h: height });
      }
      if (positions.length > 0) map.set(obj.id, { positions, sizes });
    }
    return map;
  }, [objects, timeline]);

  const getMinimumPanelSize = useCallback(
    (panelId: string): { width: number; height: number } => {
      let minW = 1;
      let minH = 1;
      for (const [, obj] of objects) {
        if (obj.data.panelId !== panelId) continue;
        const pre = precomputedBounds.get(obj.id);
        if (pre) {
          for (let i = 0; i < pre.positions.length; i++) {
            const pos = pre.positions[i];
            const s = pre.sizes[i] ?? { w: 1, h: 1 };
            minW = Math.max(minW, pos.col + s.w);
            minH = Math.max(minH, pos.row + s.h);
          }
        } else {
          const pos = resolveObjectPosition(obj, objects, currentVariables);
          const w = resolveSizeValue(
            obj.data.label?.width ?? obj.data.shapeProps?.width,
            currentVariables,
            evaluateExpression
          ) || 1;
          const h = resolveSizeValue(
            obj.data.label?.height ?? obj.data.shapeProps?.height,
            currentVariables,
            evaluateExpression
          ) || 1;
          minW = Math.max(minW, pos.col + w);
          minH = Math.max(minH, pos.row + h);
        }
      }
      return { width: minW, height: minH };
    },
    [objects, currentVariables, precomputedBounds]
  );

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
      const timelineErr = validateIntegerOverTimeline(obj, timeline);
      const invalidReason = resolved.error
        ? (timelineErr ? `${resolved.error}; ${timelineErr}` : resolved.error)
        : timelineErr ?? undefined;
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
  }, [objects, currentVariables, timeline, validateIntegerOverTimeline, isSizeResizable]);

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
          const arrSizes = collectArrayCellSizes(arrayId, next);
          for (let i = 0; i < arrayLength; i++) {
            const offset = arrSizes.some(s => s.width > 1 || s.height > 1)
              ? getAccumulatedArrayOffset(direction, i, arrSizes)
              : getArrayOffset(direction, i);
            const cellW = arrSizes[i]?.width ?? 1;
            const cellH = arrSizes[i]?.height ?? 1;
            for (let r = 0; r < cellH; r++) {
              for (let c = 0; c < cellW; c++) {
                const arrayRow = pos.row + offset.rowDelta + r;
                const arrayCol = pos.col + offset.colDelta + c;
                for (let j = 0; j < length; j++) {
                  if (arrayRow === row && arrayCol === startCol + j) {
                    if (i === 0 || obj.data.arrayInfo.index === 0) {
                      objectsToClear.add(arrayId);
                    }
                  }
                }
              }
            }
          }
        }
      } else {
        // Single cell objects or shapes/labels with width/height
        const width = resolveSizeValue(obj.data.label?.width ?? obj.data.shapeProps?.width, variables, evaluateExpression) || 1;
        const height = resolveSizeValue(obj.data.label?.height ?? obj.data.shapeProps?.height, variables, evaluateExpression) || 1;
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
    const defaultColor =
      shape === 'circle' ? '#3b82f6' : shape === 'arrow' ? '#ef4444' : '#22c55e';
    const zOrder = zOrderCounter.current++;
    setObjects((prev) => {
      const next = clearOverlappingObjects(prev, position.row, position.col, 1, currentVariables);
      next.set(objectId, {
        id: objectId,
        data: {
          shape,
          objectId,
          style: { color: defaultColor },
          shapeProps: { width: 1, height: 1 },
          panelId: panelContext?.id,
          zOrder,
        },
        positionBinding: createHardcodedBinding(targetPosition),
        zOrder,
      });
      return next;
    });
  }, [generateObjectId, clearOverlappingObjects, currentVariables]);

  const clearCell = useCallback((position: CellPosition): string | undefined => {
    let hitPanelId: string | undefined;

    setObjects((prev) => {
      const next = new Map(prev);

      // Pass 1: find non-panel objects at this position (prioritize child objects)
      for (const [id, obj] of next) {
        if (obj.data.panel) continue;
        const pos = resolveObjectPosition(obj, next, currentVariables);

        if (obj.data.arrayInfo) {
          const arrayId = obj.data.arrayInfo.id;
          let arrayLength = 0;
          const direction = obj.data.arrayInfo.direction || 'right';
          for (const [, o] of next) {
            if (o.data.arrayInfo?.id === arrayId) arrayLength++;
          }

          const arrSizes = collectArrayCellSizes(arrayId, next);
          const useAccum = arrSizes.some(s => s.width > 1 || s.height > 1);
          for (let i = 0; i < arrayLength; i++) {
            const offset = useAccum ? getAccumulatedArrayOffset(direction, i, arrSizes) : getArrayOffset(direction, i);
            const cellW = arrSizes[i]?.width ?? 1;
            const cellH = arrSizes[i]?.height ?? 1;
            for (let r = 0; r < cellH; r++) {
              for (let c = 0; c < cellW; c++) {
                if (pos.row + offset.rowDelta + r === position.row && pos.col + offset.colDelta + c === position.col) {
                  for (const [oid, o] of next) {
                    if (o.data.arrayInfo?.id === arrayId) {
                      next.delete(oid);
                    }
                  }
                  return next;
                }
              }
            }
          }
        } else {
          const width = resolveSizeValue(obj.data.label?.width ?? obj.data.shapeProps?.width, currentVariables, evaluateExpression) || 1;
          const height = resolveSizeValue(obj.data.label?.height ?? obj.data.shapeProps?.height, currentVariables, evaluateExpression) || 1;
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

      // Pass 2: no non-panel object found -- check if position is inside a panel
      for (const [, obj] of next) {
        if (!obj.data.panel) continue;
        const pos = resolveObjectPosition(obj, next, currentVariables);
        const width = resolveSizeValue(obj.data.panel.width, currentVariables, evaluateExpression) || 1;
        const height = resolveSizeValue(obj.data.panel.height, currentVariables, evaluateExpression) || 1;
        for (let r = 0; r < height; r++) {
          for (let c = 0; c < width; c++) {
            if (pos.row + r === position.row && pos.col + c === position.col) {
              hitPanelId = obj.data.panel.id;
              return next;
            }
          }
        }
      }

      return next;
    });

    return hitPanelId;
  }, [currentVariables]);

  const addArray = useCallback((position: CellPosition, length: number, panelContext?: { id: string; origin: CellPosition }) => {
    const arrayId = `array-${objectIdCounter.current++}`;
    const targetPosition = panelContext
      ? { row: position.row - panelContext.origin.row, col: position.col - panelContext.origin.col }
      : position;

    const zOrder = zOrderCounter.current++;
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
            zOrder,
          },
          positionBinding: binding,
          zOrder,
        });
      }
      return next;
    });
  }, [generateObjectId, clearOverlappingObjects, currentVariables]);

  const addLabel = useCallback((position: CellPosition, text: string, width: number, height: number, panelContext?: { id: string; origin: CellPosition }) => {
    const objectId = generateObjectId();
    const zOrder = zOrderCounter.current++;
    const targetPosition = panelContext
      ? { row: position.row - panelContext.origin.row, col: position.col - panelContext.origin.col }
      : position;
    setObjects((prev) => {
      const next = clearOverlappingObjects(prev, position.row, position.col, width, currentVariables);
      next.set(objectId, {
        id: objectId,
        data: {
          objectId,
          label: { text, width, height },
          panelId: panelContext?.id,
          zOrder,
        },
        positionBinding: createHardcodedBinding(targetPosition),
        zOrder,
      });
      return next;
    });
  }, [generateObjectId, clearOverlappingObjects, currentVariables]);

  const addPanel = useCallback((position: CellPosition, width: number, height: number, title?: string) => {
    const objectId = generateObjectId();
    const panelId = `panel-${objectIdCounter.current++}`;
    const zOrder = zOrderCounter.current++;
    setObjects((prev) => {
      const next = clearOverlappingObjects(prev, position.row, position.col, width, currentVariables);
      next.set(objectId, {
        id: objectId,
        data: {
          objectId,
          panel: { id: panelId, width, height, title },
          shapeProps: { width, height },
          zOrder,
        },
        positionBinding: createHardcodedBinding(position),
        zOrder,
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
    const zOrder = zOrderCounter.current++;
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
          zOrder,
        },
        positionBinding: createHardcodedBinding(targetPosition),
        zOrder,
      });
      return next;
    });
  }, [generateObjectId, clearOverlappingObjects, currentVariables]);

  const placeArrayVariable = useCallback((position: CellPosition, name: string, values: Array<number | string>, panelContext?: { id: string; origin: CellPosition }) => {
    const arrayId = `array-${objectIdCounter.current++}`;
    const targetPosition = panelContext
      ? { row: position.row - panelContext.origin.row, col: position.col - panelContext.origin.col }
      : position;

    const zOrder = zOrderCounter.current++;
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
            zOrder,
          },
          positionBinding: binding,
          zOrder,
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
          const arrayId = obj.data.arrayInfo.id;
          let found = false;
          const direction = obj.data.arrayInfo.direction || 'right';
          const arrSizes = collectArrayCellSizes(arrayId, next);
          const useAccum = arrSizes.some(s => s.width > 1 || s.height > 1);

          for (const [oid, o] of next) {
            if (o.data.arrayInfo?.id === arrayId) {
              const idx = o.data.arrayInfo.index;
              const offset = useAccum ? getAccumulatedArrayOffset(direction, idx, arrSizes) : getArrayOffset(direction, idx);
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

  const getObjectAtCell = useCallback(
    (row: number, col: number): CellData | undefined => {
      const list = occupancyMap.get(cellKey(row, col));
      if (!list) return undefined;
      for (let i = list.length - 1; i >= 0; i--) {
        if (!list[i].isPanel) return list[i].cellData;
      }
      return undefined;
    },
    [occupancyMap]
  );

  const getOccupantAtCell = useCallback(
    (row: number, col: number): OccupantInfo | undefined => {
      const list = occupancyMap.get(cellKey(row, col));
      if (!list) return undefined;
      for (let i = list.length - 1; i >= 0; i--) {
        if (!list[i].isPanel) return list[i];
      }
      return undefined;
    },
    [occupancyMap]
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

  const findObjectByCell = useCallback((
    objectsMap: Map<string, GridObject>,
    position: CellPosition,
    vars: VariableDictionary
  ): { id: string; obj: GridObject; arrayId?: string } | null => {
    for (const [id, obj] of objectsMap) {
      if (obj.data.panel) continue;
      const pos = resolveObjectPosition(obj, objectsMap, vars);

      if (obj.data.arrayInfo) {
        const arrayId = obj.data.arrayInfo.id;
        const direction = obj.data.arrayInfo.direction || 'right';
        let arrayLength = 0;
        for (const [, o] of objectsMap) {
          if (o.data.arrayInfo?.id === arrayId) arrayLength++;
        }
        const arrSizes = collectArrayCellSizes(arrayId, objectsMap);
        const useAccum = arrSizes.some(s => s.width > 1 || s.height > 1);
        for (let i = 0; i < arrayLength; i++) {
          const offset = useAccum ? getAccumulatedArrayOffset(direction, i, arrSizes) : getArrayOffset(direction, i);
          const cellW = arrSizes[i]?.width ?? 1;
          const cellH = arrSizes[i]?.height ?? 1;
          for (let r = 0; r < cellH; r++) {
            for (let c = 0; c < cellW; c++) {
              if (pos.row + offset.rowDelta + r === position.row &&
                  pos.col + offset.colDelta + c === position.col) {
                return { id, obj, arrayId };
              }
            }
          }
        }
      } else {
        const width = resolveSizeValue(
          obj.data.label?.width ?? obj.data.shapeProps?.width,
          vars, evaluateExpression) || 1;
        const height = resolveSizeValue(
          obj.data.label?.height ?? obj.data.shapeProps?.height,
          vars, evaluateExpression) || 1;
        if (position.row >= pos.row && position.row < pos.row + height &&
            position.col >= pos.col && position.col < pos.col + width) {
          return { id, obj };
        }
      }
    }
    return null;
  }, [resolveObjectPosition]);

  const updateCellStyle = useCallback((position: CellPosition, style: Partial<CellStyle>) => {
    setObjects((prev) => {
      const next = new Map(prev);
      const target = findObjectByCell(next, position, currentVariables);
      if (!target) return next;

      if (target.arrayId) {
        for (const [oid, o] of next) {
          if (o.data.arrayInfo?.id === target.arrayId) {
            next.set(oid, {
              ...o,
              data: { ...o.data, style: { ...o.data.style, ...style } },
            });
          }
        }
      } else {
        next.set(target.id, {
          ...target.obj,
          data: { ...target.obj.data, style: { ...target.obj.data.style, ...style } },
        });
      }
      return next;
    });
  }, [currentVariables, findObjectByCell]);

  const setPositionBinding = useCallback((position: CellPosition, binding: PositionBinding) => {
    const getPanelInfo = (panelId?: string): { id: string; origin: CellPosition; width: number; height: number } | null => {
      if (!panelId) return null;
      for (const [, pobj] of objects) {
        if (pobj.data.panel?.id === panelId) {
          const origin = resolvePosition(pobj.positionBinding, currentVariables, evaluateExpression);
          const width = resolveSizeValue(pobj.data.panel.width, currentVariables, evaluateExpression);
          const height = resolveSizeValue(pobj.data.panel.height, currentVariables, evaluateExpression);
          return { id: panelId, origin, width, height };
        }
      }
      return null;
    };

    const target = findObjectByCell(objects, position, currentVariables);
    if (!target) return;

    const panelInfo = getPanelInfo(target.obj.data.panelId);
    let nextBinding = binding;
    const rowFixed = binding.row.type === 'fixed' || binding.row.type === 'hardcoded';
    const colFixed = binding.col.type === 'fixed' || binding.col.type === 'hardcoded';
    if (panelInfo && rowFixed && colFixed) {
      const rowValue = (binding.row as { value: number }).value - panelInfo.origin.row;
      const colValue = (binding.col as { value: number }).value - panelInfo.origin.col;
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
        const minSize = getMinimumPanelSize(panelInfo.id);
        const requestedW = Math.max(panelInfo.width, colValue + 1);
        const requestedH = Math.max(panelInfo.height, rowValue + 1);
        const newWidth = Math.max(requestedW, minSize.width);
        const newHeight = Math.max(requestedH, minSize.height);
        setObjects((prev) => {
          const next = new Map(prev);
          for (const [pid, pobj] of next) {
            if (pobj.data.panel?.id === panelInfo.id) {
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
  }, [objects, currentVariables, resolveObjectPosition, getMinimumPanelSize, findObjectByCell]);

  const updateShapeProps = useCallback((position: CellPosition, shapeProps: Partial<ShapeProps>) => {
    setObjects((prev) => {
      const next = new Map(prev);
      const target = findObjectByCell(next, position, currentVariables);
      if (!target || target.obj.data.arrayInfo) return next;

      next.set(target.id, {
        ...target.obj,
        data: { ...target.obj.data, shapeProps: { ...target.obj.data.shapeProps, ...shapeProps } },
      });
      return next;
    });
  }, [currentVariables, findObjectByCell]);

  const updateIntVarDisplay = useCallback((position: CellPosition, display: 'name-value' | 'value-only') => {
    setObjects((prev) => {
      const next = new Map(prev);
      const target = findObjectByCell(next, position, currentVariables);
      if (!target || !target.obj.data.intVar) return next;

      next.set(target.id, {
        ...target.obj,
        data: { ...target.obj.data, intVar: { ...target.obj.data.intVar, display } },
      });
      return next;
    });
  }, [currentVariables, findObjectByCell]);

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

        const arrSizes = collectArrayCellSizes(arrayId, next);
        const useAccum = arrSizes.some(s => s.width > 1 || s.height > 1);
        const curDir = obj.data.arrayInfo.direction || 'right';
        for (let i = 0; i < arrayLength; i++) {
          const offset = useAccum ? getAccumulatedArrayOffset(curDir, i, arrSizes) : getArrayOffset(curDir, i);
          const cellW = arrSizes[i]?.width ?? 1;
          const cellH = arrSizes[i]?.height ?? 1;
          let matched = false;
          for (let r = 0; r < cellH && !matched; r++) {
            for (let c = 0; c < cellW && !matched; c++) {
              if (pos.row + offset.rowDelta + r === position.row && pos.col + offset.colDelta + c === position.col) {
                matched = true;
              }
            }
          }
          if (matched) {
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
      const target = findObjectByCell(next, position, currentVariables);
      if (!target) return next;

      if (target.arrayId) {
        for (const [oid, o] of next) {
          if (o.data.arrayInfo?.id === target.arrayId) {
            next.set(oid, {
              ...o,
              data: { ...o.data, panelId: panelId || undefined },
            });
          }
        }
      } else {
        next.set(target.id, {
          ...target.obj,
          data: { ...target.obj.data, panelId: panelId || undefined },
        });
      }
      return next;
    });
  }, [currentVariables, findObjectByCell]);

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

  const deletePanel = useCallback((panelId: string, keepChildren: boolean) => {
    setObjects((prev) => {
      const next = new Map(prev);
      // Find panel origin and remove the panel object
      let panelOrigin: CellPosition = { row: 0, col: 0 };
      for (const [id, obj] of next) {
        if (obj.data.panel?.id === panelId) {
          panelOrigin = resolvePosition(obj.positionBinding, currentVariables, evaluateExpression);
          next.delete(id);
          break;
        }
      }
      // Handle children
      for (const [id, obj] of next) {
        if (obj.data.panelId === panelId) {
          if (!keepChildren) {
            next.delete(id);
          } else {
            // Convert relative position to absolute so objects stay in place
            const childPos = resolvePosition(obj.positionBinding, currentVariables, evaluateExpression);
            next.set(id, {
              ...obj,
              data: { ...obj.data, panelId: undefined },
              positionBinding: createHardcodedBinding({
                row: childPos.row + panelOrigin.row,
                col: childPos.col + panelOrigin.col,
              }),
            });
          }
        }
      }
      return next;
    });
  }, [currentVariables]);

  const panelOptions = useMemo(() => {
    return Array.from(objects.values())
      .filter((obj) => obj.data.panel?.id)
      .map((obj) => ({
        id: obj.data.panel!.id,
        title: obj.data.panel!.title || obj.data.panel!.id,
      }));
  }, [objects]);

  const moveCell = useCallback((from: CellPosition, to: CellPosition) => {
    const target = findObjectByCell(objects, from, currentVariables);
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
        if (component.type === 'fixed' || component.type === 'hardcoded') {
          return { type: 'fixed', value: component.value + delta };
        }
        if (component.type === 'variable') {
          return { type: 'expression', expression: `${component.varName} + ${delta}` };
        }
        if (component.type === 'expression') {
          return { type: 'expression', expression: `(${component.expression}) + ${delta}` };
        }
        return component;
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
  }, [objects, currentVariables, getPanelContextAt, resolveObjectPosition, findObjectByCell]);

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
      zOrder: obj.zOrder,
    }));
  }, [objects]);

  const loadObjectsSnapshot = useCallback((snapshot: GridObjectSnapshot[]) => {
    const next = new Map<string, GridObject>();
    let maxId = -1;
    let maxZ = -1;

    for (const obj of snapshot) {
      const zOrder = obj.zOrder ?? 0;
      maxZ = Math.max(maxZ, zOrder);
      next.set(obj.id, {
        id: obj.id,
        data: { ...obj.data, zOrder },
        positionBinding: obj.positionBinding,
        zOrder,
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
    zOrderCounter.current = maxZ + 1;
    setObjects(next);
  }, []);

  const VB_PREFIX = 'vb-';

  const loadVisualBuilderObjects = useCallback((elements: VisualBuilderElement[]) => {
    function rgbToHex(rgb: [number, number, number]): string {
      return '#' + rgb.map((x) => Math.max(0, Math.min(255, Math.floor(x))).toString(16).padStart(2, '0')).join('');
    }

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

        const alpha = el.alpha ?? 1;

        if (el.type === 'rect') {
          const color = el.color ? rgbToHex(el.color) : '#22c55e';
          next.set(gridId, {
            id: gridId,
            data: {
              objectId: gridId,
              shape: 'rectangle',
              style: { color, opacity: alpha },
              shapeProps: { width: el.width ?? 1, height: el.height ?? 1 },
              panelId,
              zOrder: z,
            },
            positionBinding: binding,
            zOrder: z++,
          });
        } else if (el.type === 'circle') {
          const color = el.color ? rgbToHex(el.color) : '#3b82f6';
          next.set(gridId, {
            id: gridId,
            data: {
              objectId: gridId,
              shape: 'circle',
              style: { color, opacity: alpha },
              shapeProps: { width: el.width ?? 1, height: el.height ?? 1 },
              panelId,
              zOrder: z,
            },
            positionBinding: binding,
            zOrder: z++,
          });
        } else if (el.type === 'arrow') {
          const color = el.color ? rgbToHex(el.color) : '#10b981';
          next.set(gridId, {
            id: gridId,
            data: {
              objectId: gridId,
              shape: 'arrow',
              style: { color, opacity: alpha },
              shapeProps: {
                width: el.width ?? 1,
                height: el.height ?? 1,
                orientation: (el.orientation as 'up' | 'down' | 'left' | 'right') ?? 'up',
                rotation: el.rotation ?? 0,
              },
              panelId,
              zOrder: z,
            },
            positionBinding: binding,
            zOrder: z++,
          });
        } else if (el.type === 'label') {
          const style: CellStyle = { opacity: alpha };
          if (el.color) style.color = rgbToHex(el.color);
          if (el.fontSize != null) style.fontSize = el.fontSize;
          next.set(gridId, {
            id: gridId,
            data: {
              objectId: gridId,
              label: { text: el.label ?? '', width: el.width ?? 1, height: el.height ?? 1 },
              ...(Object.keys(style).length > 0 && { style }),
              panelId,
              zOrder: z,
            },
            positionBinding: binding,
            zOrder: z++,
          });
        } else if (el.type === 'var') {
          next.set(gridId, {
            id: gridId,
            data: {
              objectId: gridId,
              intVar: { name: el.varName ?? '', value: 0, display: (el.display as 'name-value' | 'value-only') ?? 'name-value' },
              style: { opacity: alpha },
              panelId,
              zOrder: z,
            },
            positionBinding: binding,
            zOrder: z++,
          });
        } else if (el.type === 'array') {
          const arrayId = `${VB_PREFIX}array-${idx++}`;
          const length = Math.max(1, Math.min(50, el.length ?? 5));
          const direction = (el.direction === 'left' || el.direction === 'down' || el.direction === 'up' ? el.direction : 'right') as 'right' | 'left' | 'down' | 'up';
          const values = el.values ?? [];
          const arrayElementType: ShapeType | undefined = el.elementType === 'rect' ? 'rectangle' : el.elementType as ShapeType | undefined;
          const showIndex = el.showIndex ?? !arrayElementType;
          const hasAnyShapeCell = arrayElementType || values.some(v => typeof v === 'object' && v !== null && 'type' in v);
          for (let i = 0; i < length; i++) {
            const cellId = `${VB_PREFIX}${idx++}`;
            const rawValue = values[i];

            const arrayInfoBase: CellData['arrayInfo'] = {
              id: arrayId,
              index: i,
              direction,
              showIndex,
            };

            if (hasAnyShapeCell && typeof rawValue === 'object' && rawValue !== null) {
              const cfg = rawValue as ShapeArrayElementConfig;
              const cellType = cfg.type ?? arrayElementType;
              const mappedType: ShapeType | undefined = cellType === 'rect' ? 'rectangle' : cellType as ShapeType | undefined;
              const elColor = cfg.color ? rgbToHex(cfg.color) : undefined;
              arrayInfoBase.elementType = mappedType;
              arrayInfoBase.elementConfig = {
                color: elColor,
                orientation: cfg.orientation as 'up' | 'down' | 'left' | 'right' | undefined,
                rotation: cfg.rotation,
                width: cfg.width ?? 1,
                height: cfg.height ?? 1,
                alpha: cfg.alpha,
                visible: cfg.visible,
              };
            } else if (arrayElementType) {
              arrayInfoBase.elementType = arrayElementType;
              arrayInfoBase.elementConfig = { width: 1, height: 1 };
            } else {
              arrayInfoBase.value = (typeof rawValue === 'number' || typeof rawValue === 'string') ? rawValue : 0;
              arrayInfoBase.varName = el.varName ?? '';
            }

            next.set(cellId, {
              id: cellId,
              data: {
                objectId: cellId,
                arrayInfo: arrayInfoBase,
                panelId,
                zOrder: z,
              },
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
    getObjectAtCell,
    getOccupantAtCell,
    occupancyMap,
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
    loadVisualBuilderObjects,
    validateProposedOverTimeline,
  };
}
