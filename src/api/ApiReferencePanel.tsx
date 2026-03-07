import { useRef, useState, useCallback } from "react";
import { VISUAL_ELEM_SCHEMA } from "../api/visualBuilder";

interface ApiReferencePanelProps {
  onClose: () => void;
}

export function ApiReferencePanel({ onClose }: ApiReferencePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(288);
  const isResizingRef = useRef(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.max(200, Math.min(600, startWidth + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width]);

  return (
    <div
      ref={containerRef}
      className="absolute top-0 right-0 h-full bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-l border-gray-300 dark:border-gray-600 shadow-lg overflow-auto z-50 flex"
      style={{ width }}
    >
      {/* Resize handle */}
      <div
        className="w-1 h-full cursor-ew-resize bg-transparent hover:bg-indigo-400 dark:hover:bg-indigo-500 transition-colors flex-shrink-0"
        onMouseDown={handleResizeStart}
      />

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="px-3 py-2 border-b border-gray-300 dark:border-gray-600 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
            API Reference
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm"
          >
            &times;
          </button>
        </div>

        <div className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 space-y-3">
          {VISUAL_ELEM_SCHEMA.map((cls) => (
            <div
              key={cls.className}
              className="border-b border-gray-300 dark:border-gray-600 pb-2 last:border-0"
            >
              <div className="font-mono font-medium text-gray-900 dark:text-gray-200">
                {cls.className}({cls.constructorParams})
              </div>

              <div className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                {cls.docstring}
              </div>

              <div className="mt-1.5 space-y-0.5">
                {cls.properties.map((p) => (
                  <div key={p.name} className="font-mono text-xs">
                    <span className="text-amber-600 dark:text-amber-300">
                      {p.name}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500">
                      : {p.type}
                    </span>
                    <div className="text-gray-500 dark:text-gray-400 pl-2">
                      {p.description}
                    </div>
                  </div>
                ))}

                {cls.methods?.map((m) => (
                  <div key={m.name} className="font-mono text-xs mt-0.5">
                    <span className="text-cyan-600 dark:text-cyan-300">
                      {m.name}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500">
                      {" "}
                      {m.signature}
                    </span>
                    <div className="text-gray-500 dark:text-gray-400 pl-2">
                      {m.docstring}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}