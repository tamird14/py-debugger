import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Grid } from './components/Grid';
import { ContextMenu } from './components/ContextMenu';
import { TimelineControls } from './components/TimelineControls';
import { CodeEditor, SAMPLE_CODE } from './components/CodeEditor';
import { VariablesPanel } from './components/VariablesPanel';
import { useGridState } from './hooks/useGridState';
import {
  executePythonCode,
  loadPyodide,
  isPyodideLoaded,
  type ExecutionStep,
} from './services/pythonExecutor';
import type {
  CellPosition,
  ShapeType,
  ContextMenuState,
  Variable,
  CellStyle,
  PositionBinding,
} from './types/grid';
import { cellKey } from './types/grid';

function App() {
  const {
    cells,
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
    addArray,
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
  } = useGridState();

  // Code editor state
  const [code, setCode] = useState(SAMPLE_CODE);
  const [isEditable, setIsEditable] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [output, setOutput] = useState<string | undefined>();
  const [pyodideLoading, setPyodideLoading] = useState(false);
  const [pyodideReady, setPyodideReady] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
  });
  const [contextMenuCell, setContextMenuCell] = useState<CellPosition | null>(null);

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

  // Handle edit mode
  const handleEdit = useCallback(() => {
    setIsEditable(true);
    setExecutionSteps([]);
    setError(undefined);
    setOutput(undefined);
    loadTimeline([]);
  }, [loadTimeline]);

  // Context menu handlers
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, position: CellPosition) => {
      setContextMenuCell(position);
      setContextMenu({
        isOpen: true,
        position: { x: e.clientX, y: e.clientY },
      });
    },
    []
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
    setContextMenuCell(null);
  }, []);

  const handleSelectShape = useCallback(
    (shape: ShapeType | null) => {
      if (contextMenuCell) {
        if (shape === null) {
          clearCell(contextMenuCell);
        } else {
          setShape(contextMenuCell, shape);
        }
      }
    },
    [contextMenuCell, setShape, clearCell]
  );

  const handleAddArray = useCallback(
    (length: number) => {
      if (contextMenuCell) {
        addArray(contextMenuCell, length);
      }
    },
    [contextMenuCell, addArray]
  );

  const handlePlaceVariable = useCallback(
    (name: string, variable: Variable) => {
      if (!contextMenuCell) return;

      if (variable.type === 'int' || variable.type === 'float') {
        placeIntVariable(contextMenuCell, name, variable.value);
      } else if (variable.type === 'arr[int]') {
        placeArrayVariable(contextMenuCell, name, variable.value);
      }
    },
    [contextMenuCell, placeIntVariable, placeArrayVariable]
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

  const hasTimeline = timeline.length > 0;
  const contextMenuCellData = contextMenuCell
    ? cells.get(cellKey(contextMenuCell.row, contextMenuCell.col))
    : undefined;

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col bg-gray-100">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-indigo-600">Math-Insight</h1>
          <span className="text-sm text-gray-400">Visual Python Debugger</span>
          <Link
            to="/plan"
            className="text-sm text-gray-500 hover:text-indigo-600 transition-colors"
          >
            About
          </Link>
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
            />
          )}

          {/* Zoom controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={zoomOut}
              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm font-medium transition-colors"
            >
              -
            </button>
            <span className="text-sm text-gray-600 min-w-[60px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={zoomIn}
              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm font-medium transition-colors"
            >
              +
            </button>
          </div>
        </div>
      </header>

      {/* Main content - two panel layout */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left panel - Code Editor */}
        <div className="w-1/2 flex flex-col border-r border-gray-300">
          <div className="flex-1 overflow-hidden">
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
            />
          </div>

          {/* Variables panel below code editor */}
          {hasTimeline && (
            <div className="flex-shrink-0 h-48 border-t border-gray-700 bg-gray-50">
              <div className="h-full flex flex-col">
                <div className="flex-shrink-0 px-3 py-1 bg-gray-200 border-b border-gray-300">
                  <span className="text-xs font-semibold text-gray-600 uppercase">
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
          )}
        </div>

        {/* Right panel - Visual Grid */}
        <div className="w-1/2 flex flex-col">
          <div className="flex-shrink-0 px-4 py-2 bg-white border-b border-gray-200 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Visual Panel</span>
            {selectedCell && (
              <span className="text-xs text-gray-500">
                Cell: ({selectedCell.row}, {selectedCell.col})
              </span>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <Grid
              cells={cells}
              selectedCell={selectedCell}
              zoom={zoom}
              onSelectCell={selectCell}
              onContextMenu={handleContextMenu}
              onZoom={handleZoom}
            />
          </div>
        </div>
      </main>

      {/* Context menu */}
      {contextMenu.isOpen && (
        <ContextMenu
          position={contextMenu.position}
          variables={variables}
          cellData={contextMenuCellData}
          cellPosition={contextMenuCell ?? undefined}
          intVariableNames={intVariableNames}
          onSelect={handleSelectShape}
          onAddArray={handleAddArray}
          onPlaceVariable={handlePlaceVariable}
          onUpdateStyle={handleUpdateStyle}
          onMoveCell={handleMoveCell}
          onSetPositionBinding={handleSetPositionBinding}
          onClose={handleCloseContextMenu}
        />
      )}

      {/* Footer */}
      <footer className="flex-shrink-0 bg-white border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
        <span className="mr-4">1. Write Python code in the editor</span>
        <span className="mr-4">2. Click "Analyze" to run and trace variables</span>
        <span className="mr-4">3. Use step controls to see execution</span>
        <span>4. Right-click grid cells to visualize variables</span>
      </footer>
    </div>
  );
}

export default App;
