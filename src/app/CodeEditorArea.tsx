import { useRef, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { CodeEditor } from '../code-builder/CodeEditor';
import { DebuggerCodeEditor } from '../debugger-panel/DebuggerCodeEditor';
import type { HighlightedLines } from '../debugger-panel/DebuggerCodeEditor';
import { VariablePanel } from '../debugger-panel/VariablePanel';
import type { VariableValue } from '../debugger-panel/codeTimelineState';

type ActiveTab = 'code' | 'visual-builder';

interface CodeEditorAreaProps {
  code: string;
  onChange: (code: string) => void;
  debuggerCode: string;
  onDebuggerCodeChange: (code: string) => void;
  onAnalyze: () => void;
  onEdit: () => void;
  onSave: () => void;
  onLoad: (data: { code?: string; debuggerCode?: string; currentTime?: number }) => void;
  isAnalyzing: boolean;
  analyzeStatus?: 'idle' | 'success' | 'error' | 'dirty';
  error?: string;
  highlightedLines?: HighlightedLines;
  currentVariables?: Record<string, VariableValue>;
  breakpoints?: Set<number>;
  onBreakpointsChange?: (next: Set<number>) => void;
  appMode: 'idle' | 'trace' | 'interactive' | 'debug_in_event';
  readOnly?: boolean;
  onEnterInteractive: () => void;
  onBackToInteractive?: () => void;
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
  onSave,
  onLoad,
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
}: CodeEditorAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('code');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        onLoad(data);
      } catch {
        console.error('Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

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
          <button
            type="button"
            onClick={onSave}
            className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Load
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
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
                    : analyzeStatus === 'dirty'
                      ? 'bg-amber-500 text-white hover:bg-amber-400'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
              }`}
            >
              {isAnalyzing ? 'Analyzing…' : analyzeStatus === 'error' ? '✗ Analyze' : 'Analyze'}
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'code' ? (
          (() => {
            const editor = (
              <DebuggerCodeEditor
                code={debuggerCode}
                onChange={onDebuggerCodeChange}
                highlightedLines={highlightedLines}
                breakpoints={breakpoints}
                onBreakpointsChange={onBreakpointsChange}
                readOnly={readOnly}
              />
            );
            if (appMode === 'interactive') return editor;
            return (
              <Group orientation="vertical" className="h-full">
                <Panel defaultSize={70} minSize={30}>{editor}</Panel>
                <Separator className="h-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 cursor-row-resize" />
                <Panel defaultSize={30} minSize={10}>
                  <VariablePanel variables={currentVariables} />
                </Panel>
              </Group>
            );
          })()
        ) : (
          <CodeEditor code={code} onChange={onChange} error={error} readOnly={readOnly} />
        )}
      </div>
    </div>
  );
}
