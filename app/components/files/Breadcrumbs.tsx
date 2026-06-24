import { useEffect, useRef, useState } from "react";

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
    <div
      className={`flex items-center gap-1 bg-[#16162a] border-b border-gray-700 shrink-0 min-h-[36px] ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      {/* Back button — disabled while editing the path so navigation can't
          desync from the frozen text field */}
      <button
        onClick={onGoUp}
        disabled={!canGoUp || textMode}
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
          <button onClick={() => onNavigate("/")} className="text-gray-400 hover:text-white px-0.5 shrink-0">
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

      {/* In text mode: a "Go" button to submit the path (the on-screen
          alternative to Enter). In breadcrumb mode: a pencil to edit the path. */}
      {textMode ? (
        <button
          onMouseDown={(e) => e.preventDefault()} // keep input focus through the click
          onClick={handleTextSubmit}
          className="shrink-0 px-2.5 py-1 mr-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          title="Go to path"
        >
          Go
        </button>
      ) : (
        <button
          onClick={() => setTextMode(true)}
          className="shrink-0 p-1.5 mr-1 text-gray-400 hover:text-white transition-colors"
          title="Edit path"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
