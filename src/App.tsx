import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Grid } from './components/Grid';
import { ContextMenu } from './components/ContextMenu';
import { TimelineControls } from './components/TimelineControls';
import { CodeEditor, SAMPLE_CODE } from './components/CodeEditor';
import { VariablesPanel } from './components/VariablesPanel';
import { useGridState } from './hooks/useGridState';
import { useTheme } from './contexts/ThemeContext';
import {
  executePythonCode,
  loadPyodide,
  isPyodideLoaded,
  type ExecutionStep,
} from './services/pythonExecutor';
import { executeVisualBuilderCode, runVisualBuilderUpdate } from './services/visualBuilderExecutor';
import type {
  CellPosition,
  ShapeType,
  ContextMenuState,
  Variable,
  CellStyle,
  PositionBinding,
  ShapeProps,
} from './types/grid';

function App() {
  const { darkMode, toggleDarkMode } = useTheme();
  
  // Breakpoints state - set of line numbers with breakpoints
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());
  
  const toggleBreakpoint = useCallback((lineNumber: number) => {
    setBreakpoints((prev) => {
      const next = new Set(prev);
      if (next.has(lineNumber)) {
        next.delete(lineNumber);
      } else {
        next.add(lineNumber);
      }
      return next;
    });
  }, []);

  const {
    cells,
    overlayCells,
    selectedCell,
    zoom,
    variables,
    timeline,
    currentStep,
    stepCount,
    intVariableNames,
    selectCell,
    setShape,
    clearCell,
    addLabel,
    addPanel,
    getPanelContextAt,
    loadTimeline,
    nextStep,
    prevStep,
    goToStep,
    placeIntVariable,
    placeArrayVariable,
    place2DArrayVariable,
    zoomIn,
    zoomOut,
    setZoom,
    updateCellStyle,
    moveCell,
    movePanel,
    updatePanel,
    deletePanel,
    setPositionBinding,
    updateShapeProps,
    updateArrayDirection,
    updateIntVarDisplay,
    setPanelForObject,
    panelOptions,
    panels,
    getObjectsSnapshot,
    loadObjectsSnapshot,
    loadVisualBuilderObjects,
    validateProposedOverTimeline,
    getObjectAtCell,
    occupancyMap,
  } = useGridState();

  // Code editor state
  const [code, setCode] = useState(SAMPLE_CODE);
  const [isEditable, setIsEditable] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [output, setOutput] = useState<string | undefined>();
  const [visualBuilderCode, setVisualBuilderCode] = useState('');
  const [isAnalyzingVisualBuilder, setIsAnalyzingVisualBuilder] = useState(false);
  const [visualBuilderError, setVisualBuilderError] = useState<string | undefined>();
  const [visualBuilderAnalyzed, setVisualBuilderAnalyzed] = useState(false);
  const [pyodideLoading, setPyodideLoading] = useState(false);
  const [pyodideReady, setPyodideReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
  });
  const [contextMenuCell, setContextMenuCell] = useState<CellPosition | null>(null);
  const [contextMenuPanel, setContextMenuPanel] = useState<{
    id: string;
    origin: CellPosition;
    width: number;
    height: number;
  } | null>(null);
  const [panelSettingsTarget, setPanelSettingsTarget] = useState<{
    id: string;
    row: number;
    col: number;
    width: number;
    height: number;
    title?: string;
  } | null>(null);

  // Get previous variables for highlighting changes
  const previousVariables = currentStep > 0 ? timeline[currentStep - 1] : undefined;

  // Get current line info for editor highlighting
  const currentExecutionStep = executionSteps[currentStep];
  const previousExecutionStep = currentStep > 0 ? executionSteps[currentStep - 1] : undefined;

  // Preload Pyodide on mount
  useEffect(() => {
    if (!isPyodideLoaded()) {
      setPyodideLoading(true);
      loadPyodide()
        .then(() => {
          setPyodideReady(true);
          setPyodideLoading(false);
        })
        .catch((err) => {
          console.error('Failed to load Pyodide:', err);
          setPyodideLoading(false);
        });
    } else {
      setPyodideReady(true);
    }
  }, []);

  // Handle code analysis
  const handleAnalyze = useCallback(async () => {
    if (!code.trim()) return;

    setIsAnalyzing(true);
    setError(undefined);
    setOutput(undefined);

    try {
      const result = await executePythonCode(code);

      if (result.success) {
        setIsEditable(false);
        setExecutionSteps(result.steps);
        loadTimeline(result.timeline);
        setOutput(result.output || undefined);
        setError(undefined);
      } else {
        setError(result.error);
        setOutput(undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsAnalyzing(false);
    }
  }, [code, loadTimeline]);

  const handleAnalyzeVisualBuilder = useCallback(async () => {
    if (!visualBuilderCode.trim()) return;

    setIsAnalyzingVisualBuilder(true);
    setVisualBuilderError(undefined);

    try {
      const result = await executeVisualBuilderCode(visualBuilderCode);

      if (result.success) {
        loadVisualBuilderObjects(result.elements);
        setVisualBuilderError(undefined);
        setVisualBuilderAnalyzed(true);
      } else {
        setVisualBuilderError(result.error);
      }
    } catch (err) {
      setVisualBuilderError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsAnalyzingVisualBuilder(false);
    }
  }, [visualBuilderCode, loadVisualBuilderObjects]);

  // Per-step: call update(scope, params) on visual builder elements and sync to grid
  useEffect(() => {
    if (!visualBuilderAnalyzed || executionSteps.length === 0) return;
    const step = executionSteps[currentStep];
    if (!step) return;

    const scope = step.scope ?? [];
    const params = step.variables ?? {};

    runVisualBuilderUpdate(scope, params).then((elements) => {
      if (elements.length > 0) loadVisualBuilderObjects(elements);
    });
  }, [currentStep, executionSteps, visualBuilderAnalyzed, loadVisualBuilderObjects]);

  // Handle edit mode
  const handleEdit = useCallback(() => {
    setIsEditable(true);
    setExecutionSteps([]);
    setError(undefined);
    setOutput(undefined);
    loadTimeline([]);
  }, [loadTimeline]);

  const handleSave = useCallback(() => {
    const saveData = {
      version: 1,
      code,
      visualBuilderCode,
      isEditable,
      timeline,
      currentStep,
      executionSteps,
      output,
      objects: getObjectsSnapshot(),
    };

    const blob = new Blob([JSON.stringify(saveData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'math-insight-save.json';
    link.click();
    URL.revokeObjectURL(url);
  }, [code, visualBuilderCode, isEditable, timeline, currentStep, executionSteps, output, getObjectsSnapshot]);

  const handleLoadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleLoadFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || '{}'));
          setCode(parsed.code || '');
          setVisualBuilderCode(parsed.visualBuilderCode ?? '');
          setIsEditable(parsed.isEditable ?? true);
          setExecutionSteps(Array.isArray(parsed.executionSteps) ? parsed.executionSteps : []);
          setOutput(parsed.output);
          setError(undefined);
          setVisualBuilderError(undefined);

          loadTimeline(Array.isArray(parsed.timeline) ? parsed.timeline : []);
          loadObjectsSnapshot(Array.isArray(parsed.objects) ? parsed.objects : []);

          const nextStep = typeof parsed.currentStep === 'number' ? parsed.currentStep : 0;
          goToStep(nextStep);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load save file');
        } finally {
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      };
      reader.readAsText(file);
    },
    [goToStep, loadObjectsSnapshot, loadTimeline]
  );

  // Context menu handlers
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, position: CellPosition) => {
      setContextMenuCell(position);
      setContextMenuPanel(getPanelContextAt(position));
      setContextMenu({
        isOpen: true,
        position: { x: e.clientX, y: e.clientY },
      });
    },
    [getPanelContextAt]
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
    setContextMenuCell(null);
    setContextMenuPanel(null);
    setPanelSettingsTarget(null);
  }, []);

  const handlePanelContextMenu = useCallback(
    (e: React.MouseEvent, panel: { id: string; row: number; col: number; width: number; height: number; title?: string }) => {
      setPanelSettingsTarget(panel);
      setContextMenuCell(null);
      setContextMenuPanel(null);
      setContextMenu({
        isOpen: true,
        position: { x: e.clientX, y: e.clientY },
      });
    },
    []
  );

  const handleSelectShape = useCallback(
    (shape: ShapeType | null, panelContext?: { id: string; origin: CellPosition }) => {
      if (contextMenuCell) {
        if (shape === null) {
          const hitPanelId = clearCell(contextMenuCell);
          if (hitPanelId) {
            const wantDelete = window.confirm('This cell is part of a panel. Do you want to delete the panel?');
            if (wantDelete) {
              const deleteAll = window.confirm(
                'Delete all objects inside the panel too?\n\nOK = Delete all objects\nCancel = Keep objects in their current positions'
              );
              deletePanel(hitPanelId, !deleteAll);
            }
          }
        } else {
          setShape(contextMenuCell, shape, panelContext);
        }
      }
    },
    [contextMenuCell, setShape, clearCell, deletePanel]
  );

  const handleAddLabel = useCallback(
    (text: string, width: number, height: number, panelContext?: { id: string; origin: CellPosition }) => {
      if (contextMenuCell) {
        addLabel(contextMenuCell, text, width, height, panelContext);
      }
    },
    [contextMenuCell, addLabel]
  );

  const handleAddPanel = useCallback(
    (title: string, width: number, height: number) => {
      if (contextMenuCell) {
        addPanel(contextMenuCell, width, height, title);
      }
    },
    [contextMenuCell, addPanel]
  );

  const handlePlaceVariable = useCallback(
    (name: string, variable: Variable, panelContext?: { id: string; origin: CellPosition }) => {
      if (!contextMenuCell) return;

      if (variable.type === 'int' || variable.type === 'float') {
        placeIntVariable(contextMenuCell, name, variable.value, panelContext);
      } else if (variable.type === 'arr[int]' || variable.type === 'arr[str]') {
        placeArrayVariable(contextMenuCell, name, variable.value, panelContext);
      } else if (variable.type === 'arr2d[int]' || variable.type === 'arr2d[str]') {
        place2DArrayVariable(contextMenuCell, name, variable.value as (number | string)[][], panelContext);
      }
    },
    [contextMenuCell, placeIntVariable, placeArrayVariable, place2DArrayVariable]
  );

  const handleZoom = useCallback(
    (delta: number) => {
      setZoom(zoom + delta);
    },
    [zoom, setZoom]
  );

  const handleUpdateStyle = useCallback(
    (style: Partial<CellStyle>) => {
      if (contextMenuCell) {
        updateCellStyle(contextMenuCell, style);
      }
    },
    [contextMenuCell, updateCellStyle]
  );

  const handleMoveCell = useCallback(
    (newPosition: CellPosition) => {
      if (contextMenuCell) {
        moveCell(contextMenuCell, newPosition);
      }
    },
    [contextMenuCell, moveCell]
  );

  const handleSetPositionBinding = useCallback(
    (binding: PositionBinding) => {
      if (contextMenuCell) {
        setPositionBinding(contextMenuCell, binding);
      }
    },
    [contextMenuCell, setPositionBinding]
  );

  const handleUpdateShapeProps = useCallback(
    (shapeProps: Partial<ShapeProps>) => {
      if (contextMenuCell) {
        updateShapeProps(contextMenuCell, shapeProps);
      }
    },
    [contextMenuCell, updateShapeProps]
  );

  const handleUpdateArrayDirection = useCallback(
    (direction: 'right' | 'left' | 'down' | 'up') => {
      if (contextMenuCell) {
        updateArrayDirection(contextMenuCell, direction);
      }
    },
    [contextMenuCell, updateArrayDirection]
  );

  const handleUpdateIntVarDisplay = useCallback(
    (display: 'name-value' | 'value-only') => {
      if (contextMenuCell) {
        updateIntVarDisplay(contextMenuCell, display);
      }
    },
    [contextMenuCell, updateIntVarDisplay]
  );

  const handleSetPanelForObject = useCallback(
    (panelId: string | null) => {
      if (contextMenuCell) {
        setPanelForObject(contextMenuCell, panelId);
      }
    },
    [contextMenuCell, setPanelForObject]
  );

  const hasTimeline = timeline.length > 0;

  // Skip to next breakpoint: find the next step whose lineNumber is in breakpoints
  const skipToNextBreakpoint = useCallback(() => {
    for (let i = currentStep + 1; i < executionSteps.length; i++) {
      if (breakpoints.has(executionSteps[i].lineNumber)) {
        goToStep(i);
        return;
      }
    }
    // No breakpoint hit — jump to last step
    goToStep(executionSteps.length - 1);
  }, [currentStep, executionSteps, breakpoints, goToStep]);

  // Skip to previous breakpoint: find the previous step whose lineNumber is in breakpoints
  const skipToPrevBreakpoint = useCallback(() => {
    for (let i = currentStep - 1; i >= 0; i--) {
      if (breakpoints.has(executionSteps[i].lineNumber)) {
        goToStep(i);
        return;
      }
    }
    // No breakpoint hit — jump to first step
    goToStep(0);
  }, [currentStep, executionSteps, breakpoints, goToStep]);
  const contextMenuCellData = contextMenuCell
    ? getObjectAtCell(contextMenuCell.row, contextMenuCell.col)
    : undefined;

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col bg-gray-100 dark:bg-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">Math-Insight</h1>
          <span className="text-sm text-gray-400 dark:text-gray-500">Visual Python Debugger</span>
          <Link
            to="/plan"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            About
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-sm font-medium transition-colors"
            >
              Save
            </button>
            <button
              onClick={handleLoadClick}
              className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-sm font-medium transition-colors"
            >
              Load
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleLoadFile}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Pyodide status */}
          {pyodideLoading && (
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
              Loading Python...
            </span>
          )}
          {pyodideReady && !pyodideLoading && (
            <span className="text-xs text-emerald-600 flex items-center gap-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
              Python Ready
            </span>
          )}

          {/* Timeline controls */}
          {hasTimeline && (
            <TimelineControls
              currentStep={currentStep}
              stepCount={stepCount}
              onPrevStep={prevStep}
              onNextStep={nextStep}
              onGoToStep={goToStep}
              breakpoints={breakpoints}
              onSkipToNextBreakpoint={skipToNextBreakpoint}
              onSkipToPrevBreakpoint={skipToPrevBreakpoint}
            />
          )}

          {/* Zoom controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={zoomOut}
              className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-sm font-medium transition-colors"
            >
              -
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-300 min-w-[60px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={zoomIn}
              className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-sm font-medium transition-colors"
            >
              +
            </button>
          </div>

          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-sm font-medium transition-colors"
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      {/* Main content - resizable panel layout */}
      <main className="flex-1 overflow-hidden">
        <Group orientation="horizontal" className="h-full">
          {/* Left panel group - Code + Variables */}
          <Panel defaultSize={50} minSize={20}>
            <Group orientation="vertical" className="h-full">
              <Panel defaultSize={hasTimeline ? 70 : 100} minSize={30}>
                <div className="h-full border-r border-gray-300 dark:border-gray-600">
                  <CodeEditor
                    code={code}
                    onChange={setCode}
                    isAnalyzing={isAnalyzing}
                    isEditable={isEditable}
                    currentLine={currentExecutionStep?.lineNumber}
                    lastExecutedLine={previousExecutionStep?.lineNumber}
                    onAnalyze={handleAnalyze}
                    onEdit={handleEdit}
                    error={error}
                    output={output}
                    visualBuilderCode={visualBuilderCode}
                    onVisualBuilderCodeChange={setVisualBuilderCode}
                    onAnalyzeVisualBuilder={handleAnalyzeVisualBuilder}
                    isAnalyzingVisualBuilder={isAnalyzingVisualBuilder}
                    visualBuilderError={visualBuilderError}
                    breakpoints={breakpoints}
                    onToggleBreakpoint={toggleBreakpoint}
                  />
                </div>
              </Panel>

              {hasTimeline && (
                <>
                  <Separator className="h-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 cursor-row-resize" />
                  <Panel defaultSize={30} minSize={15}>
                    <div className="h-full border-t border-gray-700 dark:border-gray-600 bg-gray-50 dark:bg-gray-800">
                      <div className="h-full flex flex-col">
                        <div className="flex-shrink-0 px-3 py-1 bg-gray-200 dark:bg-gray-700 border-b border-gray-300 dark:border-gray-600">
                          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">
                            Variables (Step {currentStep + 1})
                          </span>
                        </div>
                        <div className="flex-1 overflow-auto">
                          <VariablesPanel
                            variables={variables}
                            previousVariables={previousVariables}
                          />
                        </div>
                      </div>
                    </div>
                  </Panel>
                </>
              )}
            </Group>
          </Panel>

          <Separator className="w-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 cursor-col-resize" />

          {/* Right panel - Visual Grid */}
          <Panel defaultSize={50} minSize={20}>
            <div className="h-full flex flex-col">
              <div className="flex-shrink-0 px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Visual Panel</span>
                {selectedCell && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Cell: ({selectedCell.row}, {selectedCell.col})
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-hidden">
                <Grid
                  cells={cells}
                  overlayCells={overlayCells}
                  occupancyMap={occupancyMap}
                  panels={panels}
                  selectedCell={selectedCell}
                  zoom={zoom}
                  onSelectCell={selectCell}
                  onContextMenu={handleContextMenu}
                  onZoom={handleZoom}
                  onMoveCell={moveCell}
                  onMovePanel={movePanel}
                  onPanelContextMenu={handlePanelContextMenu}
                  onDragBegin={handleCloseContextMenu}
                  onUpdateShapeProps={updateShapeProps}
                  onUpdatePanel={updatePanel}
                />
              </div>
            </div>
          </Panel>
        </Group>
      </main>

      {/* Context menu */}
      {contextMenu.isOpen && (
        <ContextMenu
          position={contextMenu.position}
          variables={variables}
          validateProposedOverTimeline={
            timeline.length > 0
              ? (proposed) => validateProposedOverTimeline(proposed, timeline)
              : undefined
          }
          cellData={contextMenuCellData}
          cellPosition={contextMenuCell ?? undefined}
          intVariableNames={intVariableNames}
          onSelect={handleSelectShape}
          onAddLabel={handleAddLabel}
          onAddPanel={handleAddPanel}
          onPlaceVariable={handlePlaceVariable}
          onUpdateStyle={handleUpdateStyle}
          onMoveCell={handleMoveCell}
          onSetPositionBinding={handleSetPositionBinding}
          onUpdateShapeProps={handleUpdateShapeProps}
          onUpdateArrayDirection={handleUpdateArrayDirection}
          onUpdateIntVarDisplay={handleUpdateIntVarDisplay}
          onSetPanelForObject={handleSetPanelForObject}
          panelOptions={panelOptions}
          panelContext={contextMenuPanel ?? undefined}
          panelSettingsData={panelSettingsTarget ?? undefined}
          onUpdatePanel={updatePanel}
          onDeletePanel={deletePanel}
          onClose={handleCloseContextMenu}
        />
      )}

      {/* Footer */}
      <footer className="flex-shrink-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="mr-4">1. Write Python code in the editor</span>
        <span className="mr-4">2. Click "Analyze" to run and trace variables</span>
        <span className="mr-4">3. Use step controls to see execution</span>
        <span>4. Right-click grid cells to visualize variables</span>
      </footer>
    </div>
  );
}

export default App;
