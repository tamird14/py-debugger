import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  getCombinedLines,
  getBuilderOutput,
  getBuilderStepOutput,
  getDebuggerOutput,
  subscribeTerminal,
  getTerminalVersion,
  type TerminalLine,
} from './terminalState';

type TerminalTab = 'builder' | 'debugger' | 'combined';

interface OutputTerminalProps {
  currentStep: number;
  appMode: 'idle' | 'trace' | 'interactive' | 'debug_in_event';
}

const DEFAULT_HEIGHT = 128;
const MIN_HEIGHT = 48;
const MAX_HEIGHT = 600;

function splitLines(text: string): string[] {
  if (!text) return [];
  const parts = text.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
}

export function OutputTerminal({ currentStep }: OutputTerminalProps) {
  useSyncExternalStore(subscribeTerminal, getTerminalVersion);
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<TerminalTab>('combined');
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const dragStartY = useRef<number | null>(null);
  const dragStartHeight = useRef(DEFAULT_HEIGHT);

  // ── Drag-to-resize ────────────────────────────────────────────────────────
  const onDragHandleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragStartY.current = e.clientY;
    dragStartHeight.current = height;

    const onMove = (e: MouseEvent) => {
      if (dragStartY.current === null) return;
      const delta = dragStartY.current - e.clientY; // drag up → increase height
      setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, dragStartHeight.current + delta)));
    };
    const onUp = () => {
      dragStartY.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ── Scroll tracking ───────────────────────────────────────────────────────
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
  };

  // Gather content for change detection (auto-scroll)
  const builderInit = getBuilderOutput();
  const builderSteps = getBuilderStepOutput(currentStep);
  const debuggerText = getDebuggerOutput(currentStep);
  const combinedLines = getCombinedLines(currentStep);
  const contentKey = builderInit + builderSteps + debuggerText + combinedLines.length;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isAtBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [contentKey]);

  // ── Tab helpers ───────────────────────────────────────────────────────────
  const tabBtn = (tab: TerminalTab, label: string) => (
    <button
      key={tab}
      type="button"
      onClick={() => setActiveTab(tab)}
      className={`px-2 py-0.5 text-xs rounded transition-colors ${
        activeTab === tab
          ? 'bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-100'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
      }`}
    >
      {label}
    </button>
  );

  // ── Content renderers ─────────────────────────────────────────────────────
  const renderLines = (lines: string[], className: string) =>
    lines.map((line, i) => (
      <div key={i} className={`whitespace-pre ${className}`}>{line || '\u00A0'}</div>
    ));

  const colorFor = (source: TerminalLine['source']) => {
    if (source === 'builder') return 'text-emerald-600 dark:text-emerald-400';
    if (source === 'marker') return 'text-gray-400 dark:text-gray-500';
    return 'text-gray-700 dark:text-gray-200';
  };

  const renderBuilderTab = () => {
    const initLines = splitLines(builderInit);
    const stepLines = splitLines(builderSteps);
    const hasContent = initLines.length > 0 || stepLines.length > 0;
    if (!hasContent) return <div className="text-gray-400 dark:text-gray-600 italic">No builder output.</div>;
    return (
      <>
        {renderLines(initLines, 'text-emerald-600 dark:text-emerald-400')}
        {initLines.length > 0 && stepLines.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
        )}
        {renderLines(stepLines, 'text-emerald-600 dark:text-emerald-400')}
      </>
    );
  };

  const renderDebuggerTab = () => {
    const lines = splitLines(debuggerText);
    if (!lines.length) return <div className="text-gray-400 dark:text-gray-600 italic">No debugger output.</div>;
    return renderLines(lines, 'text-gray-700 dark:text-gray-200');
  };

  const renderCombinedTab = () => {
    const initLines = splitLines(builderInit);
    const hasInit = initLines.length > 0;
    const hasStream = combinedLines.length > 0;

    if (!hasInit && !hasStream) {
      return <div className="text-gray-400 dark:text-gray-600 italic">No output.</div>;
    }

    return (
      <>
        {renderLines(initLines, 'text-emerald-600 dark:text-emerald-400')}
        {hasInit && hasStream && <div className="border-t border-gray-200 dark:border-gray-700 my-1" />}
        {combinedLines.map((line, i) => (
          <div key={i} className={`whitespace-pre ${colorFor(line.source)}`}>
            {line.text || '\u00A0'}
          </div>
        ))}
      </>
    );
  };

  const renderContent = () => {
    if (activeTab === 'builder') return renderBuilderTab();
    if (activeTab === 'debugger') return renderDebuggerTab();
    return renderCombinedTab();
  };

  return (
    <div className="flex-shrink-0 flex flex-col border-t border-gray-300 dark:border-gray-700">
      {/* Drag handle */}
      <div
        onMouseDown={onDragHandleMouseDown}
        className="h-1 bg-gray-200 dark:bg-gray-700 hover:bg-indigo-400 dark:hover:bg-indigo-500 cursor-row-resize transition-colors flex-shrink-0"
        title="Drag to resize output panel"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1 bg-gray-100 dark:bg-gray-800 select-none flex-shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mr-2">
            Output
          </span>
          {tabBtn('builder', 'Builder')}
          {tabBtn('debugger', 'Debugger')}
          {tabBtn('combined', 'Combined')}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors text-xs px-1"
          title={collapsed ? 'Expand output' : 'Collapse output'}
        >
          {collapsed ? '▲' : '▼'}
        </button>
      </div>

      {/* Content */}
      {!collapsed && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{ height }}
          className="overflow-y-auto p-2 font-mono text-xs leading-relaxed bg-white dark:bg-gray-950"
        >
          {renderContent()}
        </div>
      )}
    </div>
  );
}
