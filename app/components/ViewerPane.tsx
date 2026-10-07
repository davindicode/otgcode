import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "~/lib/errors";
import { isDirectViewerFile } from "~/lib/fileTypes";
import { formatSize } from "~/lib/format";
import { useTabsStore } from "~/stores/tabsStore";
import { useToastStore } from "~/stores/toastStore";
import FileViewer from "./files/FileViewer";

type Load =
  | { status: "loading" }
  | { status: "ready"; content: string | null; version: string | null }
  | { status: "error"; message: string };

/** How often an on-screen tab asks whether its file has moved. */
const WATCH_MS = 4000;

/**
 * A viewer tab: one file, opened from an explorer. Owns the fetch that used to
 * live in the explorer, so the explorer stays a file browser and this stays a
 * document.
 */
export default function ViewerPane({ tabId, path }: { tabId: string; path: string }) {
  const closeTab = useTabsStore((s) => s.close);
  const showToast = useToastStore((s) => s.show);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  /**
   * Counts reloads. A file can change under an open tab — an agent edits it, a
   * build writes it — and the tab held whatever it read when it opened. For the
   * streamed types this is also what stops the browser reusing its cached copy.
   */
  const [version, setVersion] = useState(0);
  /** What the file looks like on disk now, when that is not what we loaded. */
  const [onDisk, setOnDisk] = useState<{ version: string | null; missing: boolean } | null>(null);
  /** A save the server refused because the file had moved. */
  const [conflict, setConflict] = useState<string | null>(null);
  /** The content that save was carrying, held while the user decides. */
  const [pending, setPending] = useState<string | null>(null);
  const isActive = useTabsStore((s) => s.activeId === tabId);
  const abortRef = useRef<AbortController | null>(null);

  const read = useCallback(async () => {
    // Image/PDF/video/audio stream straight from the download URL, so there's
    // no point reading the whole file as text first.
    if (isDirectViewerFile(path)) {
      // Nothing to read: these stream from their own URL. Still worth a version
      // so the tab can notice the file changing underneath it.
      let version: string | null = null;
      try {
        version =
          (
            (await (await fetch(`/api/files/version?path=${encodeURIComponent(path)}`)).json()) as {
              version?: string | null;
            }
          ).version ?? null;
      } catch {
        // Unreachable: the tab works, it just cannot watch.
      }
      setLoad({ status: "ready", content: null, version });
      return;
    }

    setLoad({ status: "loading" });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`/api/files/read?path=${encodeURIComponent(path)}`, { signal: controller.signal });
      const data = await res.json();
      if (data.error) {
        setLoad({ status: "error", message: `${data.error}${data.size ? ` (${formatSize(data.size)})` : ""}` });
      } else {
        setLoad({ status: "ready", content: data.content ?? null, version: data.version ?? null });
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      setLoad({ status: "error", message: (err as Error).message || "Failed to load file" });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [path]);

  useEffect(() => {
    read();
    return () => abortRef.current?.abort();
  }, [read]);

  const loadedVersion = load.status === "ready" ? load.version : null;

  // Only the tab on screen watches. A background tab's staleness does not
  // matter until you look at it, and it re-checks the moment it is shown —
  // which keeps this to one stat every few seconds however many tabs are open.
  useEffect(() => {
    if (!loadedVersion || !isActive) {
      setOnDisk(null);
      return;
    }
    let live = true;
    const check = async () => {
      try {
        const res = await fetch(`/api/files/version?path=${encodeURIComponent(path)}`);
        const data = (await res.json()) as { version?: string | null; missing?: boolean };
        if (!live || data.version === undefined) return;
        const moved = data.version !== loadedVersion;
        setOnDisk(moved ? { version: data.version, missing: !!data.missing } : null);
      } catch {
        // Unreachable, which the connection gate already says louder than this.
      }
    };
    check();
    const id = setInterval(check, WATCH_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [path, loadedVersion, isActive]);

  /**
   * `force` skips the version check, for a save the user has confirmed will
   * overwrite. Without it the server refuses when the file has moved, which is
   * the only place that check cannot race another writer.
   */
  const handleSave = async (content: string, force = false) => {
    try {
      const res = await fetch("/api/files/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          content,
          expectedVersion: force ? undefined : loadedVersion,
        }),
      });
      const data = (await res.json()) as { error?: string; conflict?: boolean; version?: string | null };
      if (data.conflict) {
        setPending(content);
        setConflict(data.error ?? "This file changed on disk");
        return;
      }
      if (data.error) {
        showToast(data.error);
        return;
      }
      // Saving makes this the version on disk, so the tab stops calling itself
      // stale and the next save is checked against what it just wrote.
      if (load.status === "ready") setLoad({ ...load, version: data.version ?? null });
      setOnDisk(null);
      setConflict(null);
      setPending(null);
      showToast(`Saved ${path.split("/").pop()}`, "info");
    } catch (err: unknown) {
      showToast(errorMessage(err, "Save failed"));
    }
  };

  const close = () => closeTab(tabId);

  if (load.status === "loading") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-app px-6 text-ink-faint">
        <div className="spinner" />
        <span className="text-sm">Opening file...</span>
        <span className="max-w-full truncate text-center text-xs text-ink-ghost">{path}</span>
        <button
          type="button"
          onClick={() => {
            abortRef.current?.abort();
            close();
          }}
          className="relief rounded-control px-4 py-2 text-sm text-ink"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (load.status === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-app px-6">
        <svg className="h-8 w-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
        <span className="text-center text-sm text-red-400">{load.message}</span>
        <span className="max-w-full truncate text-center text-xs text-ink-ghost">{path}</span>
        <div className="flex gap-2">
          <button type="button" onClick={read} className="relief rounded-control px-4 py-2 text-sm text-ink">
            Retry
          </button>
          <button type="button" onClick={close} className="relief rounded-control px-4 py-2 text-sm text-ink">
            Close tab
          </button>
        </div>
      </div>
    );
  }

  const reload = () => {
    setVersion((v) => v + 1);
    setOnDisk(null);
    read();
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <FileViewer
        path={path}
        content={load.content}
        onSave={handleSave}
        onReload={reload}
        version={version}
        stale={!!onDisk}
      />

      {/* Says what happened and stays out of the way: the file is still
          readable behind it, and nothing is reloaded without being asked. */}
      {onDisk && !conflict && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
          <div className="toast pointer-events-auto flex items-center gap-2 rounded-panel px-3 py-2">
            <span className="text-[11px] text-ink-muted">
              {onDisk.missing ? "This file has been deleted on disk." : "This file changed on disk."}
            </span>
            {!onDisk.missing && (
              <button
                type="button"
                onClick={reload}
                className="relief-accent rounded-control px-2 py-0.5 text-[11px] text-white"
              >
                Reload
              </button>
            )}
            <button
              type="button"
              onClick={() => setOnDisk(null)}
              className="rounded-control px-1.5 py-0.5 text-[11px] text-ink-faint hover:text-ink"
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* The save the server refused. Overwriting is a real choice, so it is
          offered — just not as the thing that happens by default. */}
      {conflict && (
        <div className="scrim absolute inset-0 z-10 flex items-center justify-center p-4">
          <div role="dialog" aria-label="File changed on disk" className="glass w-full max-w-sm rounded-panel p-4">
            <h2 className="text-sm font-medium text-ink">{conflict}</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-dim">
              Something else wrote to it after you opened it. Saving now replaces those changes with your version of the
              file.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const content = pending;
                  setConflict(null);
                  if (content !== null) handleSave(content, true);
                }}
                className="relief-accent relief-danger rounded-control px-3 py-1.5 text-xs font-medium text-white"
              >
                Overwrite
              </button>
              <button
                type="button"
                onClick={() => {
                  setConflict(null);
                  setPending(null);
                }}
                className="rounded-control border border-line px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
              >
                Keep editing
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-ghost">
              To take the other version instead, use reload in the header — it replaces what you have open.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
