import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import CopyPathButton from "./CopyPathButton";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import CodeEditor from "./CodeEditor";
import ImageViewer from "./ImageViewer";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "ogg", "mov", "mkv", "avi"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "flac", "aac", "m4a"]);

function getExt(path: string): string {
  return path.split(".").pop()?.toLowerCase() || "";
}

// True for files rendered by a viewer that streams from the download URL
// (image/pdf/video/audio) and therefore needs no text-content fetch. Lets the
// explorer open them instantly instead of reading the whole file as UTF-8.
export function isDirectViewerFile(path: string): boolean {
  const ext = getExt(path);
  return IMAGE_EXTS.has(ext) || ext === "pdf" || VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext);
}

interface FileViewerProps {
  path: string;
  content: string | null;
  onSave: (content: string) => void;
  onClose: () => void;
}

function MediaViewer({ path, type, onClose }: { path: string; type: "video" | "audio"; onClose: () => void }) {
  const src = `/api/files/download?path=${encodeURIComponent(path)}&inline=1`;
  const [loop, setLoop] = useState(false);
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 bg-[#16162a] border-b border-gray-700 shrink-0">
        <span
          className="text-sm text-gray-300 whitespace-nowrap min-w-0 flex-1 overflow-hidden text-ellipsis select-none"
          title={path}
        >
          {path}
        </span>
        <CopyPathButton path={path} />
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setLoop((l) => !l)}
            className={`p-1 rounded transition-colors ${
              loop ? "bg-blue-600 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white"
            }`}
            title={loop ? "Loop: on" : "Loop: off"}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 1l4 4-4 4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 13v2a4 4 0 01-4 4H3" />
            </svg>
          </button>
          <a
            href={`/api/files/download?path=${encodeURIComponent(path)}`}
            className="p-1 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded transition-colors"
            download
            title="Download"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
              />
            </svg>
          </a>
          <button
            onClick={onClose}
            className="p-1 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded transition-colors"
            title="Close"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center bg-[#0d0d1a] p-4 overflow-auto">
        {type === "video" ? (
          <video
            src={src}
            controls
            playsInline
            loop={loop}
            preload="metadata"
            className="max-w-full max-h-full rounded"
          />
        ) : (
          <audio src={src} controls loop={loop} preload="metadata" className="w-full max-w-md" />
        )}
      </div>
    </div>
  );
}

// Render a PDF page only once it scrolls near the viewport. Rendering every
// page up front (canvas + text + annotation layers) is what made large PDFs
// choke; this keeps continuous scroll but mounts pages on demand.
function LazyPdfPage({
  pageNumber,
  scale,
  root,
}: {
  pageNumber: number;
  scale: number;
  root: React.RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [render, setRender] = useState(pageNumber === 1); // first page eagerly

  useEffect(() => {
    if (render) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setRender(true);
          io.disconnect();
        }
      },
      { root: root.current, rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [render, root]);

  return (
    <div ref={ref} className="w-full flex justify-center">
      {render ? (
        <Page pageNumber={pageNumber} scale={scale} className="shadow-lg" renderTextLayer renderAnnotationLayer />
      ) : (
        <div className="w-full max-w-[800px] rounded bg-[#16162a]/40" style={{ height: Math.round(1000 * scale) }} />
      )}
    </div>
  );
}

function PdfViewer({ path, onClose }: { path: string; onClose: () => void }) {
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState(1.0);
  const containerRef = useRef<HTMLDivElement>(null);

  const zoomIn = () => setScale((s) => Math.min(3, s + 0.25));
  const zoomOut = () => setScale((s) => Math.max(0.25, s - 0.25));
  const zoomFit = () => setScale(1.0);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  }, []);

  const pdfUrl = `/api/files/download?path=${encodeURIComponent(path)}&inline=1`;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 bg-[#16162a] border-b border-gray-700 shrink-0">
        <span
          className="text-sm text-gray-300 whitespace-nowrap min-w-0 flex-1 overflow-hidden text-ellipsis select-none"
          title={path}
        >
          {path}
        </span>
        <CopyPathButton path={path} />
        <div className="flex items-center gap-2 shrink-0">
          {numPages > 0 && <span className="text-[10px] text-gray-500">{numPages} pg</span>}
          <div className="flex items-center gap-1 border border-gray-700 rounded overflow-hidden">
            <button onClick={zoomOut} className="px-2 py-0.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700">
              -
            </button>
            <button
              onClick={zoomFit}
              className="px-2 py-0.5 text-[10px] text-gray-400 hover:text-white hover:bg-gray-700 tabular-nums"
            >
              {Math.round(scale * 100)}%
            </button>
            <button onClick={zoomIn} className="px-2 py-0.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700">
              +
            </button>
          </div>
          <a
            href={`/api/files/download?path=${encodeURIComponent(path)}`}
            className="p-1 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded transition-colors"
            download
            title="Download"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
              />
            </svg>
          </a>
          <button
            onClick={onClose}
            className="p-1 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded transition-colors"
            title="Close"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto bg-[#0d0d1a]">
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div className="flex items-center justify-center h-full text-gray-500 text-sm">Loading PDF...</div>}
          error={<div className="flex items-center justify-center h-full text-red-400 text-sm">Failed to load PDF</div>}
        >
          <div className="flex flex-col items-center gap-2 p-4">
            {Array.from({ length: numPages }, (_, i) => (
              <LazyPdfPage key={i + 1} pageNumber={i + 1} scale={scale} root={containerRef} />
            ))}
          </div>
        </Document>
      </div>
    </div>
  );
}

export default function FileViewer({ path, content, onSave, onClose }: FileViewerProps) {
  const ext = getExt(path);

  if (IMAGE_EXTS.has(ext)) {
    return <ImageViewer path={path} onClose={onClose} />;
  }

  if (ext === "pdf") {
    return <PdfViewer path={path} onClose={onClose} />;
  }

  if (VIDEO_EXTS.has(ext)) {
    return <MediaViewer path={path} type="video" onClose={onClose} />;
  }

  if (AUDIO_EXTS.has(ext)) {
    return <MediaViewer path={path} type="audio" onClose={onClose} />;
  }

  // Default to code editor for everything else
  if (content !== null) {
    return <CodeEditor path={path} content={content} onSave={onSave} onClose={onClose} />;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 bg-[#16162a] border-b border-gray-700 shrink-0">
        <span
          className="text-sm text-gray-300 whitespace-nowrap min-w-0 flex-1 overflow-hidden text-ellipsis select-none"
          title={path}
        >
          {path}
        </span>
        <CopyPathButton path={path} />
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/api/files/download?path=${encodeURIComponent(path)}`}
            className="p-1 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded transition-colors"
            download
            title="Download"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
              />
            </svg>
          </a>
          <button
            onClick={onClose}
            className="p-1 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded transition-colors"
            title="Close"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        Cannot preview this file type (.{ext || "unknown"})
      </div>
    </div>
  );
}
