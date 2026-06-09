import { useState, useRef, useEffect, useLayoutEffect } from "react";
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
  rightAlign: boolean; // 3-dot button: right-edge align; point menus: left-align
  anchorX: number;     // content-x: button right edge (rightAlign) or click point
  topDown: number;     // content-y for the menu top when opening downward
  bottomUp: number;    // content-y of the anchor top, used when flipping upward
  vpTop: number;       // anchor top within the visible container (flip decision)
  vpBottom: number;    // anchor bottom within the visible container (flip decision)
}

export default function FileList({ entries, onOpen, onDelete, onInfo, onRename, onDownload, uploadQueue, cancelUpload, disabled }: FileListProps) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [menuStyle, setMenuStyle] = useState<{ left: number; top: number; visible: boolean }>({ left: 0, top: 0, visible: false });
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open the menu anchored to a point (right-click / long-press), stored in the
  // scroll container's content coordinates so it stays attached on scroll.
  const openMenuAtPoint = (clientX: number, clientY: number, entry: FileEntry) => {
    const container = scrollRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    setMenuStyle((s) => ({ ...s, visible: false }));
    setMenu({
      entry,
      rightAlign: false,
      anchorX: clientX - cRect.left + container.scrollLeft,
      topDown: clientY - cRect.top + container.scrollTop,
      bottomUp: clientY - cRect.top + container.scrollTop,
      vpTop: clientY - cRect.top,
      vpBottom: clientY - cRect.top,
    });
  };

  // Open the menu from the 3-dot button, right-aligned to the button.
  const openMenuFromButton = (e: React.MouseEvent, entry: FileEntry) => {
    const container = scrollRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuStyle((s) => ({ ...s, visible: false }));
    setMenu({
      entry,
      rightAlign: true,
      anchorX: rect.right - cRect.left + container.scrollLeft,
      topDown: rect.bottom - cRect.top + container.scrollTop,
      bottomUp: rect.top - cRect.top + container.scrollTop,
      vpTop: rect.top - cRect.top,
      vpBottom: rect.bottom - cRect.top,
    });
  };

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

  // Measure the rendered menu and resolve its final position: clamp within the
  // container's right edge (pane boundary) and flip upward when the entry is
  // near the bottom and there isn't room below. Runs before paint to avoid flicker.
  useLayoutEffect(() => {
    if (!menu || !menuRef.current || !scrollRef.current) return;
    const container = scrollRef.current;
    const mw = menuRef.current.offsetWidth;
    const mh = menuRef.current.offsetHeight;
    const visW = container.clientWidth;
    const visH = container.clientHeight;
    const pad = 8;

    // Horizontal: right-align to the button, then clamp inside the pane.
    let left = menu.rightAlign ? menu.anchorX - mw : menu.anchorX;
    const minLeft = container.scrollLeft + pad;
    const maxLeft = container.scrollLeft + visW - mw - pad;
    left = Math.max(minLeft, Math.min(left, maxLeft));

    // Vertical: prefer downward; flip up if not enough room; else clamp to view.
    const roomBelow = visH - menu.vpBottom;
    let top: number;
    if (roomBelow >= mh + pad) {
      top = menu.topDown;
    } else if (menu.vpTop >= mh + pad) {
      top = menu.bottomUp - mh;
    } else {
      top = container.scrollTop + Math.max(pad, visH - mh - pad);
    }

    setMenuStyle({ left, top, visible: true });
  }, [menu]);

  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    openMenuAtPoint(e.clientX, e.clientY, entry);
  };

  const handleTouchStart = (e: React.TouchEvent, entry: FileEntry) => {
    const touch = e.touches[0];
    longPressTimer.current = setTimeout(() => {
      openMenuAtPoint(touch.clientX, touch.clientY, entry);
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
    <div ref={scrollRef} className="overflow-y-auto flex-1 relative">
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
            onClick={(e) => openMenuFromButton(e, entry)}
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
          className="absolute z-50 bg-[#1e1e3a] border border-gray-600 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{
            left: menuStyle.left,
            top: menuStyle.top,
            visibility: menuStyle.visible ? "visible" : "hidden",
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
