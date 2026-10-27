import { useCallback, useEffect, useRef, useState } from "react";
import DownloadIcon from "~/components/DownloadIcon";
import RefreshIcon from "~/components/RefreshIcon";
import { readView, saveView } from "~/lib/viewState";
import CannotDisplay from "./CannotDisplay";
import CopyPathButton from "./CopyPathButton";

interface ImageViewerProps {
  path: string;
  onReload: () => void;
  /** Bumped per reload, so the browser refetches rather than reusing its copy. */
  version: number;
  /** The file has changed on disk since it was read. */
  stale: boolean;
}

/** The container's padding, which the image has to fit inside. */
const PAD = 32;

/** Quiet period before a pan is written down. */
const PAN_SETTLE_MS = 400;

export default function ImageViewer({ path, onReload, version, stale }: ImageViewerProps) {
  /**
   * Where this image was last being looked at, read once at mount. Zoom comes
   * back immediately; the pan has to wait for the image to have a size to be
   * panned within, which the effect below does once.
   */
  const [saved] = useState(() => readView(path));
  const [zoom, setZoom] = useState(saved.zoom ?? 1);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // What the pane can show, watched rather than read once: rotating a phone,
  // opening the keyboard and splitting a window all change it. A zero-sized
  // box means the tab is hidden (`display: none`), which has no size to fit to.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) setBox({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * Scale at which the whole image is visible — 100%, as every image viewer
   * means it. Natural pixels are the wrong unit on a phone: a photo from that
   * same phone is 4000px wide, so "100%" used to mean a tenth of one corner
   * and a lot of dragging.
   *
   * Never above 1: a 48px icon blown up to fill a desktop pane is not what
   * fitting it means, and the whole thing is visible either way.
   */
  const fit = !naturalSize || !box ? 1 : Math.min(1, (box.w - PAD) / naturalSize.w, (box.h - PAD) / naturalSize.h);
  const scale = fit * zoom;

  // GIFs animate via the <img> itself; bumping a cache-busting param reloads the
  // image, which restarts the animation (a play-once gif can't otherwise replay).
  const isGif = path.split(".").pop()?.toLowerCase() === "gif";
  const [replayKey, setReplayKey] = useState(0);
  const src = `/api/files/download?path=${encodeURIComponent(path)}&inline=1&v=${version}${replayKey ? `&_r=${replayKey}` : ""}`;

  const zoomIn = () => setZoom((z) => Math.min(5, z + 0.25));
  const zoomOut = () => setZoom((z) => Math.max(0.1, z - 0.25));
  const zoomFit = () => setZoom(1);

  useEffect(() => {
    saveView(path, { zoom });
  }, [path, zoom]);

  /**
   * Put the pane back where it was, once there is something to scroll.
   *
   * Pan is the container's own scroll offset rather than React state, and a
   * scroll offset is clamped to the content — so setting it before the image
   * has loaded and been laid out would have clamped it to zero. Waiting for
   * both the natural size and the pane's own box is waiting for exactly that.
   * Once only: after this the user is panning, and this would fight them.
   */
  const panRestored = useRef(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || panRestored.current || !naturalSize || !box) return;
    panRestored.current = true;
    if (saved.left) el.scrollLeft = saved.left;
    if (saved.top) el.scrollTop = saved.top;
  }, [naturalSize, box, saved.left, saved.top]);

  /**
   * Panning writes where it got to, once it settles. Scroll fires far too
   * often to store on each one, and the offset after a zoom is the browser's
   * doing rather than the user's — but it is still where they are looking, so
   * it is still worth keeping.
   */
  const panTimer = useRef(0);
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el || !panRestored.current) return;
    const { scrollLeft: left, scrollTop: top } = el;
    clearTimeout(panTimer.current);
    panTimer.current = window.setTimeout(() => saveView(path, { left, top }), PAN_SETTLE_MS);
  };
  useEffect(() => () => clearTimeout(panTimer.current), []);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  /**
   * Why the image did not render, once we know. An <img> reports a failure
   * without a reason, and the two reasons are different: the server refused
   * (a JSON error on the same URL, which by now is a few bytes), or the bytes
   * are not a format this browser decodes — a .heic someone renamed .jpg, a
   * progressive variant, a truncated file.
   */
  const [failure, setFailure] = useState<{ src: string; reason: string } | null>(null);
  const reportFailure = useCallback(async () => {
    let reason = "";
    try {
      const data = (await (await fetch(src)).json()) as { error?: string };
      reason = data.error ?? "";
    } catch {
      // Not JSON either, so the server served it happily.
    }
    setFailure({ src, reason: reason || "The bytes are there, but this browser does not decode this image format." });
  }, [src]);

  // Held against the URL it belongs to rather than cleared by an effect: the
  // failure replaces the <img>, so a reload would have nothing left to fire
  // onLoad and clear it. A new `src` simply stops matching.
  const failed = failure?.src === src ? failure.reason : null;

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

  // Desktop drag-to-pan (hand tool): drag scrolls the overflow container.
  // window listeners so releasing outside the pane still ends the drag.
  const [grabbing, setGrabbing] = useState(false);
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container || e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = container.scrollLeft;
    const startTop = container.scrollTop;
    setGrabbing(true);

    const onMove = (ev: MouseEvent) => {
      container.scrollLeft = startLeft - (ev.clientX - startX);
      container.scrollTop = startTop - (ev.clientY - startY);
    };
    const onUp = () => {
      setGrabbing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

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
          {isGif && (
            <button
              onClick={() => setReplayKey((k) => k + 1)}
              className="relief p-1 text-ink-muted hover:text-ink rounded-control"
              title="Replay GIF"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M1 4v6h6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.51 15a9 9 0 102.13-9.36L1 10" />
              </svg>
            </button>
          )}
          {/* Zoom controls */}
          <div className="flex items-center gap-1 border border-line rounded-control overflow-hidden">
            <button onClick={zoomOut} className="px-2 py-0.5 text-xs text-ink-dim hover:text-ink hover:bg-control">
              -
            </button>
            <button
              onClick={zoomFit}
              title={`${Math.round(scale * 100)}% of actual size — tap to fit`}
              className="px-2 py-0.5 text-[10px] text-ink-dim hover:text-ink hover:bg-control tabular-nums"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={zoomIn} className="px-2 py-0.5 text-xs text-ink-dim hover:text-ink hover:bg-control">
              +
            </button>
          </div>
          <a
            href={`/api/files/download?path=${encodeURIComponent(path)}`}
            download
            className="relief p-1 text-ink-muted hover:text-ink rounded-control"
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
      {failed ? (
        <CannotDisplay path={path} title="This image could not be displayed" detail={failed} />
      ) : (
        <div
          ref={containerRef}
          className={`flex-1 overflow-auto bg-app select-none ${grabbing ? "cursor-grabbing" : "cursor-grab"}`}
          onMouseDown={handleMouseDown}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onScroll={handleScroll}
        >
          <div
            className="flex items-center justify-center p-4"
            style={{
              minWidth: naturalSize ? Math.max(naturalSize.w * scale + PAD, box?.w ?? 0) : "100%",
              minHeight: naturalSize ? Math.max(naturalSize.h * scale + PAD, box?.h ?? 0) : "100%",
            }}
          >
            <img
              src={src}
              alt={path}
              className="max-w-none"
              draggable={false}
              onLoad={handleImageLoad}
              onError={reportFailure}
              style={
                naturalSize
                  ? {
                      width: naturalSize.w * scale,
                      height: naturalSize.h * scale,
                    }
                  : undefined
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
