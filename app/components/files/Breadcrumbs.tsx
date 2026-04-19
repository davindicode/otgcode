import { useState, useRef, useEffect } from "react";

interface BreadcrumbsProps {
  path: string;
  onNavigate: (path: string) => void;
  onGoUp: () => void;
  canGoUp: boolean;
  disabled?: boolean;
}

export default function Breadcrumbs({ path, onNavigate, onGoUp, canGoUp, disabled }: BreadcrumbsProps) {
  const [textMode, setTextMode] = useState(false);
  const [editValue, setEditValue] = useState(path);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to end when path changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [path]);

  // Sync and auto-select when entering text mode
  useEffect(() => {
    if (textMode) {
      setEditValue(path);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [textMode]);

  const handleTextSubmit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== path) {
      onNavigate(trimmed);
    }
    setTextMode(false);
  };

  const parts = path.split("/").filter(Boolean);

  return (
    <div className={`flex items-center gap-1 bg-[#16162a] border-b border-gray-700 shrink-0 min-h-[36px] ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      {/* Back button */}
      <button
        onClick={onGoUp}
        disabled={!canGoUp}
        className="shrink-0 p-1.5 ml-1 text-gray-400 hover:text-white disabled:text-gray-700 transition-colors"
        title="Go up"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Path area */}
      {textMode ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleTextSubmit();
            if (e.key === "Escape") setTextMode(false);
          }}
          className="flex-1 bg-[#0d0d1a] text-white text-sm px-2 py-1 mr-1 rounded border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
        />
      ) : (
        <div
          ref={scrollRef}
          onDoubleClick={() => setTextMode(true)}
          className="flex-1 flex items-center gap-0.5 text-sm overflow-x-auto whitespace-nowrap px-1 scrollbar-none select-text"
        >
          <button
            onClick={() => onNavigate("/")}
            className="text-gray-400 hover:text-white px-0.5 shrink-0"
          >
            /
          </button>
          {parts.map((part, i) => {
            const fullPath = "/" + parts.slice(0, i + 1).join("/");
            const isLast = i === parts.length - 1;
            return (
              <span key={fullPath} className="flex items-center gap-0.5 shrink-0">
                <span className="text-gray-600">/</span>
                <button
                  onClick={() => onNavigate(fullPath)}
                  className={`hover:text-white px-0.5 ${isLast ? "text-white" : "text-gray-400"}`}
                >
                  {part}
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Toggle: breadcrumbs <-> text path */}
      <button
        onMouseDown={(e) => e.preventDefault()} // Prevent stealing focus/blur from input
        onClick={() => setTextMode(!textMode)}
        className="shrink-0 p-1.5 mr-1 text-gray-400 hover:text-white transition-colors"
        title={textMode ? "Breadcrumb view" : "Edit path"}
      >
        {textMode ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        )}
      </button>
    </div>
  );
}
