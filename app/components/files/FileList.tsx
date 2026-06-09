import { useState, useRef, useEffect } from "react";
import type { FileEntry } from "~/stores/fileStore";

interface UploadFile {
  name: string;
  size: number;
  status: "pending" | "uploading" | "done" | "error" | "cancelled";
  progress: number;
  error?: string;
}

interface FileListProps {
  entries: FileEntry[];
  onOpen: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onInfo: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDownload: (entry: FileEntry) => void;
  uploadQueue?: UploadFile[];
  cancelUpload?: (index: number) => void;
  disabled?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

interface ContextMenuState {
  entry: FileEntry;
  x: number;
  y: number;
}

export default function FileList({ entries, onOpen, onDelete, onInfo, onRename, onDownload, uploadQueue, cancelUpload, disabled }: FileListProps) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menu]);

  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    setMenu({ entry, x: e.clientX, y: e.clientY });
  };

  const handleTouchStart = (e: React.TouchEvent, entry: FileEntry) => {
    const touch = e.touches[0];
    longPressTimer.current = setTimeout(() => {
      setMenu({ entry, x: touch.clientX, y: touch.clientY });
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const menuAction = (action: (entry: FileEntry) => void) => {
    if (menu) {
      action(menu.entry);
      setMenu(null);
    }
  };

  if (entries.length === 0 && (!uploadQueue || uploadQueue.length === 0)) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        Empty directory
      </div>
    );
  }

  return (
    <div className="overflow-y-auto flex-1 relative">
      <div className={disabled ? "pointer-events-none opacity-50" : ""}>
      {entries.map((entry) => (
        <div
          key={entry.name}
          className="w-full flex items-center border-b border-gray-800"
        >
          {/* Clickable file/folder area */}
          <button
            onClick={() => onOpen(entry)}
            onContextMenu={(e) => handleContextMenu(e, entry)}
            onTouchStart={(e) => handleTouchStart(e, entry)}
            onTouchEnd={handleTouchEnd}
            onTouchMove={handleTouchEnd}
            className="flex-1 flex items-center gap-3 px-3 py-2 hover:bg-[#1a1a2e] active:bg-[#1a1a2e] transition-colors text-left min-w-0"
          >
            {/* Icon */}
            <span className="text-lg shrink-0">
              {entry.isDirectory ? (
                <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
            </span>
            {/* Name */}
            <span className="flex-1 text-sm text-gray-200 truncate">{entry.name}</span>
            {/* Size */}
            {!entry.isDirectory && (
              <span className="text-xs text-gray-500 shrink-0">{formatSize(entry.size)}</span>
            )}
          </button>
          {/* Three-dot menu button — separate from file click */}
          <button
            className="shrink-0 p-2 text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 active:bg-gray-700 transition-colors"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setMenu({ entry, x: rect.right, y: rect.bottom });
            }}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
        </div>
      ))}
      </div>

      {/* Upload queue inline rows */}
      {uploadQueue && uploadQueue.length > 0 && uploadQueue.map((file, i) => (
        <div key={`upload-${i}`} className="w-full flex items-center gap-3 px-3 py-2 border-b border-gray-800">
          <span className="shrink-0">
            {file.status === "uploading" || file.status === "pending" ? (
              <svg className="w-5 h-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : file.status === "done" ? (
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </span>
          <span className="flex-1 text-sm text-gray-400 truncate">{file.name}</span>
          <span className="text-xs text-gray-500 shrink-0">
            {file.status === "uploading" ? `${file.progress}%` : file.status === "error" ? (file.error || "error") : file.status}
          </span>
          {(file.status === "pending" || file.status === "uploading") && cancelUpload && (
            <button
              onClick={() => cancelUpload(i)}
              className="shrink-0 p-0.5 text-gray-500 hover:text-red-400 transition-colors"
              title="Cancel upload"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ))}

      {/* Context menu */}
      {menu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-[#1e1e3a] border border-gray-600 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{
            left: Math.min(menu.x, window.innerWidth - 180),
            top: Math.min(menu.y, window.innerHeight - 200),
          }}
        >
          <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-700 truncate">
            {menu.entry.name}
          </div>
          <button
            onClick={() => menuAction(onOpen)}
            className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2a2a4a] transition-colors"
          >
            Open
          </button>
          <button
            onClick={() => menuAction(onRename)}
            className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2a2a4a] transition-colors"
          >
            Rename
          </button>
          {!menu.entry.isDirectory && (
            <button
              onClick={() => menuAction(onDownload)}
              className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2a2a4a] transition-colors"
            >
              Download
            </button>
          )}
          <button
            onClick={() => menuAction(onInfo)}
            className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2a2a4a] transition-colors"
          >
            Info
          </button>
          <button
            onClick={() => menuAction(onDelete)}
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-[#2a2a4a] transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
