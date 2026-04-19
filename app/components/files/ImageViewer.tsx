import { useState, useRef, useCallback } from "react";
import CopyPathButton from "./CopyPathButton";

interface ImageViewerProps {
  path: string;
  onClose: () => void;
}

export default function ImageViewer({ path, onClose }: ImageViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const zoomIn = () => setZoom((z) => Math.min(5, z + 0.25));
  const zoomOut = () => setZoom((z) => Math.max(0.1, z - 0.25));
  const zoomFit = () => setZoom(1);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  // Pinch-to-zoom
  const lastDistance = useRef(0);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (lastDistance.current > 0) {
      const delta = (dist - lastDistance.current) * 0.005;
      setZoom((z) => Math.max(0.1, Math.min(5, z + delta)));
    }
    lastDistance.current = dist;
  }, []);

  const handleTouchEnd = useCallback(() => {
    lastDistance.current = 0;
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 bg-[#16162a] border-b border-gray-700 shrink-0">
        <span className="text-sm text-gray-300 whitespace-nowrap min-w-0 flex-1 overflow-hidden text-ellipsis select-none" title={path}>{path}</span>
        <CopyPathButton path={path} />
        <div className="flex items-center gap-2 shrink-0">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 border border-gray-700 rounded overflow-hidden">
            <button onClick={zoomOut} className="px-2 py-0.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700">-</button>
            <button onClick={zoomFit} className="px-2 py-0.5 text-[10px] text-gray-400 hover:text-white hover:bg-gray-700 tabular-nums">{Math.round(zoom * 100)}%</button>
            <button onClick={zoomIn} className="px-2 py-0.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700">+</button>
          </div>
          <a
            href={`/api/files/download?path=${encodeURIComponent(path)}`}
            download
            className="p-1 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded transition-colors"
            title="Download"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
          </a>
          <button
            onClick={onClose}
            className="p-1 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded transition-colors"
            title="Close"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-[#0d0d1a]"
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex items-center justify-center p-4"
          style={{
            minWidth: naturalSize ? Math.max(naturalSize.w * zoom + 32, containerRef.current?.clientWidth ?? 0) : "100%",
            minHeight: naturalSize ? Math.max(naturalSize.h * zoom + 32, containerRef.current?.clientHeight ?? 0) : "100%",
          }}
        >
          <img
            src={`/api/files/download?path=${encodeURIComponent(path)}&inline=1`}
            alt={path}
            className="max-w-none"
            draggable={false}
            onLoad={handleImageLoad}
            style={naturalSize ? {
              width: naturalSize.w * zoom,
              height: naturalSize.h * zoom,
            } : undefined}
          />
        </div>
      </div>
    </div>
  );
}
