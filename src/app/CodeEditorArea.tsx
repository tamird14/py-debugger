import { useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { CodeEditor } from '../code-builder/CodeEditor';
import { DebuggerCodeEditor } from '../debugger-panel/DebuggerCodeEditor';
import type { HighlightedLines } from '../debugger-panel/DebuggerCodeEditor';
import { VariablePanel } from '../debugger-panel/VariablePanel';
import type { VariableValue } from '../debugger-panel/codeTimelineState';
import { OutputTerminal } from '../output-terminal/OutputTerminal';

type ActiveTab = 'code' | 'visual-builder';

interface CodeEditorAreaProps {
  code: string;
  onChange: (code: string) => void;
  debuggerCode: string;
  onDebuggerCodeChange: (code: string) => void;
  onAnalyze: () => void;
  onEdit: () => void;
  isAnalyzing: boolean;
  analyzeStatus?: 'idle' | 'success' | 'error';
  error?: string;
  highlightedLines?: HighlightedLines;
  currentVariables?: Record<string, VariableValue>;
  breakpoints?: Set<number>;
  onBreakpointsChange?: (next: Set<number>) => void;
  appMode: 'idle' | 'trace' | 'interactive' | 'debug_in_event';
  readOnly?: boolean;
  onEnterInteractive: () => void;
  onBackToInteractive?: () => void;
  currentStep: number;
}

const tabBtnBase = 'px-4 py-2 text-sm font-medium border-b-2 transition-colors';
const tabActive = `${tabBtnBase} border-indigo-500 text-indigo-600 dark:text-indigo-400`;
const tabInactive = `${tabBtnBase} border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300`;


export function CodeEditorArea({
  code,
  onChange,
  debuggerCode,
  onDebuggerCodeChange,
  onAnalyze,
  onEdit,
  isAnalyzing,
  analyzeStatus = 'idle',
  error,
  highlightedLines,
  currentVariables = {},
  breakpoints,
  onBreakpointsChange,
  appMode,
  readOnly = false,
  onEnterInteractive,
  onBackToInteractive,
  currentStep,
}: CodeEditorAreaProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('code');
  const [varPanelCollapsed, setVarPanelCollapsed] = useState(false);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex-shrink-0 bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 flex items-center justify-between">
        {/* Tabs */}
        <div className="flex items-center">
          <button
            type="button"
            className={activeTab === 'code' ? tabActive : tabInactive}
            onClick={() => setActiveTab('code')}
          >
            Code
          </button>
          <button
            type="button"
            className={activeTab === 'visual-builder' ? tabActive : tabInactive}
            onClick={() => setActiveTab('visual-builder')}
          >
            Visual Builder
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-4">
          {/* Mode badge */}
          {appMode === 'trace' && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 font-medium">
              Tracing
            </span>
          )}
          {appMode === 'interactive' && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 font-medium">
              Interactive
            </span>
          )}
          {appMode === 'debug_in_event' && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 font-medium">
              Debugging event
            </span>
          )}

          {/* Finish & Interact button — only in trace mode */}
          {appMode === 'trace' && (
            <button
              type="button"
              onClick={onEnterInteractive}
              className="px-3 py-1 text-sm rounded transition-colors bg-indigo-500 text-white hover:bg-indigo-600"
              title="Finish trace and enter mouse interaction mode"
            >
              Finish &amp; Interact
            </button>
          )}

          {/* Back to Interactive button — only in debug_in_event mode */}
          {appMode === 'debug_in_event' && (
            <button
              type="button"
              onClick={onBackToInteractive}
              className="px-3 py-1 text-sm rounded transition-colors bg-amber-500 text-white hover:bg-amber-600"
              title="Return to interactive mode"
            >
              Back to Interactive
            </button>
          )}

          {analyzeStatus === 'success' ? (
            <button
              type="button"
              onClick={onEdit}
              className="min-w-[90px] px-4 py-1 text-sm font-medium rounded transition-colors bg-emerald-600 text-white hover:bg-emerald-500"
            >
              Edit
            </button>
          ) : (
            <button
              type="button"
              onClick={onAnalyze}
              disabled={isAnalyzing}
              className={`min-w-[90px] px-4 py-1 text-sm font-medium rounded transition-colors ${
                isAnalyzing
                  ? 'bg-gray-500 text-gray-200 cursor-not-allowed'
                    : analyzeStatus === 'error'
                      ? 'bg-red-600 text-white hover:bg-red-500'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
              }`}
            >
              {isAnalyzing ? 'Analyzing…' : analyzeStatus === 'error' ? '✗ Analyze' : 'Analyze'}
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-hidden">
          {activeTab === 'code' ? (
            (() => {
              const editor = (
                <DebuggerCodeEditor
                  code={debuggerCode}
                  onChange={onDebuggerCodeChange}
                  highlightedLines={appMode === 'trace' || appMode === 'debug_in_event' ? highlightedLines : undefined}
                  breakpoints={breakpoints}
                  onBreakpointsChange={onBreakpointsChange}
                  readOnly={readOnly}
                />
              );
              if (appMode === 'interactive' || varPanelCollapsed) return editor;
              return (
                <Group orientation="vertical" className="h-full">
                  <Panel defaultSize={70} minSize={30}>{editor}</Panel>
                  <Separator className="h-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 cursor-row-resize" />
                  <Panel defaultSize={30} minSize={10}>
                    <div className="h-full flex flex-col">
                      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 select-none">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Variables</span>
                        <button
                          type="button"
                          onClick={() => setVarPanelCollapsed(true)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors text-xs px-1"
                          title="Collapse variables"
                        >▼</button>
                      </div>
                      <div className="flex-1 min-h-0">
                        <VariablePanel variables={currentVariables} />
                      </div>
                    </div>
                  </Panel>
                </Group>
              );
            })()
          ) : (
            <CodeEditor code={code} onChange={onChange} error={error} readOnly={readOnly} />
          )}
        </div>

        {/* Variables header — only when collapsed, keeps button above OutputTerminal header */}
        {activeTab === 'code' && appMode !== 'interactive' && varPanelCollapsed && (
          <div className="flex-shrink-0 flex items-center justify-between px-3 py-1 bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 select-none">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Variables</span>
            <button
              type="button"
              onClick={() => setVarPanelCollapsed(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors text-xs px-1"
              title="Expand variables"
            >▲</button>
          </div>
        )}

        <OutputTerminal currentStep={currentStep} appMode={appMode} />
      </div>
    </div>
  );
}
