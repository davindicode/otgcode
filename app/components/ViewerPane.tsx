import { useCallback, useEffect, useRef, useState } from "react";
import { isDirectViewerFile } from "~/lib/fileTypes";
import { formatSize } from "~/lib/format";
import { useTabsStore } from "~/stores/tabsStore";
import { useToastStore } from "~/stores/toastStore";
import FileViewer from "./files/FileViewer";

type Load = { status: "loading" } | { status: "ready"; content: string | null } | { status: "error"; message: string };

/**
 * A viewer tab: one file, opened from an explorer. Owns the fetch that used to
 * live in the explorer, so the explorer stays a file browser and this stays a
 * document.
 */
export default function ViewerPane({ tabId, path }: { tabId: string; path: string }) {
  const closeTab = useTabsStore((s) => s.close);
  const showToast = useToastStore((s) => s.show);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const abortRef = useRef<AbortController | null>(null);

  const read = useCallback(async () => {
    // Image/PDF/video/audio stream straight from the download URL, so there's
    // no point reading the whole file as text first.
    if (isDirectViewerFile(path)) {
      setLoad({ status: "ready", content: null });
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
        setLoad({ status: "ready", content: data.content ?? null });
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

  const handleSave = async (content: string) => {
    try {
      const res = await fetch("/api/files/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content }),
      });
      const data = await res.json();
      if (data.error) showToast(data.error);
      else showToast(`Saved ${path.split("/").pop()}`, "info");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Save failed");
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

  return <FileViewer path={path} content={load.content} onSave={handleSave} onClose={close} />;
}
