import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { fileKind, getExt } from "~/lib/fileTypes";
import CopyPathButton from "./CopyPathButton";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import CodeEditor from "./CodeEditor";
import ImageViewer from "./ImageViewer";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface FileViewerProps {
  path: string;
  content: string | null;
  onSave: (content: string) => void;
  /** Re-read the file: it may have changed on disk since the tab opened. */
  onReload: () => void;
  /** Bumped per reload, so a cached media URL is not reused. */
  version: number;
  /** The file has changed on disk since it was read. */
  stale: boolean;
}

function MediaViewer({
  path,
  type,
  onReload,
  version,
  stale,
}: {
  path: string;
  type: "video" | "audio";
  onReload: () => void;
  version: number;
  stale: boolean;
}) {
  // `version` changes on reload, which is what makes the browser fetch the
  // file again instead of serving the copy it already has.
  const src = `/api/files/download?path=${encodeURIComponent(path)}&inline=1&v=${version}`;
  const [loop, setLoop] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const handleMediaError = (event: React.SyntheticEvent<HTMLMediaElement>) => {
    const code = event.currentTarget.error?.code;
    const messages: Record<number, string> = {
      1: "Playback was stopped before the file finished loading.",
      2: "The media could not be loaded because of a network or server error.",
      3: "The browser could not decode this file. Its codec may not be supported.",
      4: `This ${type} format or codec is not supported by this browser.`,
    };
    setMediaError(messages[code ?? 0] ?? `This ${type} could not be played.`);
  };

  const mediaProps = {
    src,
    controls: true,
    loop,
    preload: "metadata" as const,
    onError: handleMediaError,
    onLoadedMetadata: () => setMediaError(null),
  };

  return (
    <div className="flex flex-col h-full">
      <div className="bar-edge flex items-center px-3 py-2 bg-surface border-b border-line shrink-0">
        <div className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 truncate text-sm text-ink-muted select-none" title={path}>
            {path}
          </span>
          <CopyPathButton path={path} />
        </div>
        <div className="min-w-2 flex-1" />
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setLoop((l) => !l)}
            className={`p-1 rounded-control transition-colors ${
              loop ? "relief-accent text-white" : "relief text-ink-muted hover:text-ink"
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
            className="relief p-1 text-ink-muted hover:text-ink rounded-control"
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
            onClick={onReload}
            className={`relief p-1 rounded-control ${
              stale ? "glow text-amber-300 ring-2 ring-inset ring-amber-400/70" : "text-ink-muted hover:text-ink"
            }`}
            title={stale ? "Changed on disk — reload" : "Reload from disk"}
            aria-label="Reload from disk"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-app p-4 overflow-auto">
        {type === "video" ? (
          <video {...mediaProps} playsInline className="max-w-full max-h-full rounded-control" />
        ) : (
          <audio {...mediaProps} className="w-full max-w-md" />
        )}
        {mediaError && (
          <div className="max-w-lg rounded-panel border border-red-500/30 bg-red-950/20 px-4 py-3 text-center">
            <p className="text-sm text-red-300">{mediaError}</p>
            <p className="mt-1 text-xs text-ink-dim">
              MP4 is a container; a file that plays in a desktop app may still use a codec unavailable in this browser.
              You can download the file and play it locally.
            </p>
          </div>
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
        <div
          className="w-full max-w-[800px] rounded-control bg-surface/40"
          style={{ height: Math.round(1000 * scale) }}
        />
      )}
    </div>
  );
}

function PdfViewer({
  path,
  onReload,
  version,
  stale,
}: {
  path: string;
  onReload: () => void;
  version: number;
  stale: boolean;
}) {
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState(1.0);
  const containerRef = useRef<HTMLDivElement>(null);

  const zoomIn = () => setScale((s) => Math.min(3, s + 0.25));
  const zoomOut = () => setScale((s) => Math.max(0.25, s - 0.25));
  const zoomFit = () => setScale(1.0);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  }, []);

  const pdfUrl = `/api/files/download?path=${encodeURIComponent(path)}&inline=1&v=${version}`;

  return (
    <div className="flex flex-col h-full">
      <div className="bar-edge flex items-center px-3 py-2 bg-surface border-b border-line shrink-0">
        <div className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 truncate text-sm text-ink-muted select-none" title={path}>
            {path}
          </span>
          <CopyPathButton path={path} />
        </div>
        <div className="min-w-2 flex-1" />
        <div className="flex items-center gap-2 shrink-0">
          {numPages > 0 && <span className="text-[10px] text-ink-faint">{numPages} pg</span>}
          <div className="flex items-center gap-1 border border-line rounded-control overflow-hidden">
            <button onClick={zoomOut} className="px-2 py-0.5 text-xs text-ink-dim hover:text-ink hover:bg-control">
              -
            </button>
            <button
              onClick={zoomFit}
              className="px-2 py-0.5 text-[10px] text-ink-dim hover:text-ink hover:bg-control tabular-nums"
            >
              {Math.round(scale * 100)}%
            </button>
            <button onClick={zoomIn} className="px-2 py-0.5 text-xs text-ink-dim hover:text-ink hover:bg-control">
              +
            </button>
          </div>
          <a
            href={`/api/files/download?path=${encodeURIComponent(path)}`}
            className="relief p-1 text-ink-muted hover:text-ink rounded-control"
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
            onClick={onReload}
            className={`relief p-1 rounded-control ${
              stale ? "glow text-amber-300 ring-2 ring-inset ring-amber-400/70" : "text-ink-muted hover:text-ink"
            }`}
            title={stale ? "Changed on disk — reload" : "Reload from disk"}
            aria-label="Reload from disk"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto bg-app">
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div className="flex items-center justify-center h-full text-ink-faint text-sm">Loading PDF...</div>}
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

export default function FileViewer({ path, content, onSave, onReload, version, stale }: FileViewerProps) {
  const kind = fileKind(path);

  if (kind === "image") {
    return <ImageViewer path={path} onReload={onReload} version={version} stale={stale} />;
  }

  if (kind === "pdf") {
    return <PdfViewer path={path} onReload={onReload} version={version} stale={stale} />;
  }

  if (kind === "video") {
    return <MediaViewer path={path} type="video" onReload={onReload} version={version} stale={stale} />;
  }

  if (kind === "audio") {
    return <MediaViewer path={path} type="audio" onReload={onReload} version={version} stale={stale} />;
  }

  // Default to code editor for everything else
  if (content !== null) {
    return <CodeEditor path={path} content={content} onSave={onSave} onReload={onReload} stale={stale} />;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bar-edge flex items-center px-3 py-2 bg-surface border-b border-line shrink-0">
        <div className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 truncate text-sm text-ink-muted select-none" title={path}>
            {path}
          </span>
          <CopyPathButton path={path} />
        </div>
        <div className="min-w-2 flex-1" />
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/api/files/download?path=${encodeURIComponent(path)}`}
            className="relief p-1 text-ink-muted hover:text-ink rounded-control"
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
            onClick={onReload}
            className={`relief p-1 rounded-control ${
              stale ? "glow text-amber-300 ring-2 ring-inset ring-amber-400/70" : "text-ink-muted hover:text-ink"
            }`}
            title={stale ? "Changed on disk — reload" : "Reload from disk"}
            aria-label="Reload from disk"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center text-ink-faint text-sm">
        Cannot preview this file type (.{getExt(path) || "unknown"})
      </div>
    </div>
  );
}
