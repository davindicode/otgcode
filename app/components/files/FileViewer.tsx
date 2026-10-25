import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { fileKind, getExt } from "~/lib/fileTypes";
import CannotDisplay from "./CannotDisplay";
import CopyPathButton from "./CopyPathButton";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import DownloadIcon from "~/components/DownloadIcon";
import RefreshIcon from "~/components/RefreshIcon";
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
  /** Only the editor can report this, and only the tab strip needs it. */
  onDirtyChange?: (dirty: boolean) => void;
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
            <DownloadIcon />
          </a>
          <button
            onClick={onReload}
            className={`relief p-1 rounded-control ${
              stale ? "glow text-amber-300 ring-2 ring-inset ring-amber-400/70" : "text-ink-muted hover:text-ink"
            }`}
            title={stale ? "Changed on disk — reload" : "Reload from disk"}
            aria-label="Reload from disk"
          >
            <RefreshIcon className="w-3.5 h-3.5" />
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
  width,
  root,
}: {
  pageNumber: number;
  /** Rendered page width in CSS pixels, already scaled. */
  width: number;
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
        <Page pageNumber={pageNumber} width={width} className="shadow-lg" renderTextLayer renderAnnotationLayer />
      ) : (
        // A4's aspect is exactly root 2, and close enough to Letter's, so the
        // scrollbar barely moves as real pages replace these.
        <div className="rounded-control bg-surface/40" style={{ width, height: Math.round(width * Math.SQRT2) }} />
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
  const [paneWidth, setPaneWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Watched, not read once: rotating a phone or splitting a window changes it.
  // A zero width means the tab is hidden, which is nothing to fit to.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0) setPaneWidth(el.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * Width of a page at 100%: the pane, less its padding. A PDF page is sized
   * in points — 612 for US Letter — and rendering that as 612 CSS pixels is
   * wider than a phone, which is why every document opened half off-screen.
   *
   * Capped, because fitting the width of a 2500px desktop pane means rendering
   * a page at four times its size: slow, and nobody reads at that size.
   * ponytail: fixed cap, make it a "fit width / fit page" control if asked.
   */
  const pageWidth = Math.round(Math.min(Math.max(paneWidth - 32, 180), 1000) * scale);

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
              title="Fit the page to the width of the pane"
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
            <DownloadIcon />
          </a>
          <button
            onClick={onReload}
            className={`relief p-1 rounded-control ${
              stale ? "glow text-amber-300 ring-2 ring-inset ring-amber-400/70" : "text-ink-muted hover:text-ink"
            }`}
            title={stale ? "Changed on disk — reload" : "Reload from disk"}
            aria-label="Reload from disk"
          >
            <RefreshIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto bg-app">
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div className="flex items-center justify-center h-full text-ink-faint text-sm">Loading PDF...</div>}
          error={
            <CannotDisplay
              path={path}
              title="This PDF could not be opened"
              detail="It may be password-protected, or damaged. A reader on your device may still manage it — and will ask for the password if there is one."
            />
          }
        >
          <div className="flex flex-col items-center gap-2 p-4">
            {Array.from({ length: numPages }, (_, i) => (
              <LazyPdfPage key={i + 1} pageNumber={i + 1} width={pageWidth} root={containerRef} />
            ))}
          </div>
        </Document>
      </div>
    </div>
  );
}

export default function FileViewer({
  path,
  content,
  onSave,
  onReload,
  version,
  stale,
  onDirtyChange,
}: FileViewerProps) {
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

  if (content !== null) {
    return (
      <CodeEditor
        path={path}
        content={content}
        onSave={onSave}
        onReload={onReload}
        reloadCount={version}
        stale={stale}
        onDirtyChange={onDirtyChange}
      />
    );
  }

  // Nothing read the file and no viewer claimed it — which the kinds above
  // leave no room for, so this is here to be a dead end rather than a blank
  // pane if that ever stops being true.
  return (
    <CannotDisplay
      path={path}
      title={`OTG Code cannot display ${getExt(path) ? `a .${getExt(path)} file` : "this file"}`}
      detail="No viewer here handles this format."
    />
  );
}
