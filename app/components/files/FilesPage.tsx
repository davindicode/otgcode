import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "~/lib/clipboard";
import { type FileEntry, type FileSession, useFileStore } from "~/stores/fileStore";
import { useTabsStore } from "~/stores/tabsStore";
import { useToastStore } from "~/stores/toastStore";
import Breadcrumbs from "./Breadcrumbs";
import FileList from "./FileList";

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

type Dialog =
  | { type: "newFolder" }
  | { type: "newFile" }
  | { type: "delete"; entry: FileEntry }
  | { type: "deleteMany"; entries: FileEntry[] }
  | { type: "info"; entry: FileEntry }
  | { type: "rename"; entry: FileEntry }
  | null;

// --- Single session view ---
function FileSessionView({ session }: { session: FileSession }) {
  const updateSession = useFileStore((s) => s.updateSession);
  const id = session.id;

  const [dialog, setDialog] = useState<Dialog>(null);
  const [inputValue, setInputValue] = useState("");

  const patch = useCallback((p: Partial<FileSession>) => updateSession(id, p), [id, updateSession]);

  // Returns an error message if the directory could not be loaded, else null.
  // On failure cwd is left unchanged, so the explorer stays on the current path.
  const loadDirectory = useCallback(
    async (dir: string, showHidden?: boolean): Promise<string | null> => {
      const hidden = showHidden ?? session.showHidden;
      patch({ loading: true });
      try {
        const res = await fetch(`/api/files/list?dir=${encodeURIComponent(dir)}&showHidden=${hidden}`);
        const data = await res.json();
        if (data.error) {
          patch({ error: data.error, loading: false });
          return data.error as string;
        }
        patch({ cwd: data.dir, entries: data.entries, error: null, loading: false });
        return null;
      } catch (err: any) {
        const message = err?.message || "Failed to load directory";
        patch({ error: message, loading: false });
        return message;
      }
    },
    [id, session.showHidden],
  );

  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    if (!session.cwd) loadDirectory("");
  }, []);

  const { cwd, entries, showHidden, loading } = session;
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Upload state: queue of files with per-file progress
  interface UploadFile {
    name: string;
    size: number;
    status: "pending" | "uploading" | "done" | "error" | "cancelled";
    progress: number; // 0-100
    error?: string;
  }
  const [uploadQueue, setUploadQueue] = useState<UploadFile[]>([]);
  const uploadXhrs = useRef<Map<number, XMLHttpRequest>>(new Map());
  const cancelledIndices = useRef<Set<number>>(new Set());
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupMenu, setGroupMenu] = useState(false);
  // True while a mutating op (delete/rename/create) is running its post-action
  // reload. Folded into `busy` so the explorer stays frozen until the new tree
  // is loaded — navigation can't slip in and then get reset to cwd.
  const [opBusy, setOpBusy] = useState(false);
  // Set while the explorer is being used to pick a destination for an entry.
  // `originCwd` is where the move started, so Cancel can put the user back.
  const [moveSource, setMoveSource] = useState<{ name: string; path: string; originCwd: string } | null>(null);
  const showToast = useToastStore((s) => s.show);
  const openViewer = useTabsStore((s) => s.openViewer);
  // Explorer is "busy" (frozen) whenever an upload is in flight, while its
  // done-display + post-upload refresh is pending (uploadQueue not yet cleared),
  // or while another op is reloading. This closes the window where the user
  // could navigate after an upload finished but before the tree refreshed.
  const busy = uploadQueue.length > 0 || opBusy;

  // Run a mutating op with the explorer frozen until it (and its reload) finish.
  const withBusy = async (fn: () => Promise<void>) => {
    setOpBusy(true);
    try {
      await fn();
    } finally {
      setOpBusy(false);
    }
  };

  const fullPath = (name: string) => (cwd === "/" ? `/${name}` : `${cwd}/${name}`);

  const handleCopyPath = (entry: FileEntry) => {
    copyText(fullPath(entry.name));
  };

  const clickDownloadLink = (href: string, downloadName: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const triggerDownload = (entry: FileEntry) => {
    clickDownloadLink(`/api/files/download?path=${encodeURIComponent(fullPath(entry.name))}`, entry.name);
  };

  // Download one or more paths as a single .zip (folders included recursively).
  const triggerZipDownload = (paths: string[], zipName: string) => {
    const qs = paths.map((p) => `path=${encodeURIComponent(p)}`).join("&");
    clickDownloadLink(`/api/files/download-zip?${qs}&name=${encodeURIComponent(zipName)}`, zipName);
  };

  const handleDownload = (entry: FileEntry) => {
    if (entry.isDirectory) triggerZipDownload([fullPath(entry.name)], `${entry.name}.zip`);
    else triggerDownload(entry);
  };

  // --- Multi-select ---
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
    setGroupMenu(false);
  };

  const enterSelectMode = () => {
    setSelectMode(true);
    setSelected(new Set());
    setGroupMenu(false);
  };

  const toggleSelect = (entry: FileEntry) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entry.name)) next.delete(entry.name);
      else next.add(entry.name);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === entries.length ? new Set() : new Set(entries.map((e) => e.name))));
  };

  const selectedEntries = () => entries.filter((e) => selected.has(e.name));

  const handleGroupDownload = () => {
    const items = selectedEntries();
    if (items.length === 0) return;
    setGroupMenu(false);
    // Single file → direct download; otherwise (multiple items or any folder)
    // bundle everything into one recursive .zip.
    if (items.length === 1 && !items[0].isDirectory) {
      triggerDownload(items[0]);
    } else {
      triggerZipDownload(
        items.map((e) => fullPath(e.name)),
        `${cwd === "/" ? "download" : cwd.split("/").pop()}-selection.zip`,
      );
    }
  };

  const handleGroupDelete = () => {
    const items = selectedEntries();
    if (items.length === 0) return;
    setGroupMenu(false);
    setDialog({ type: "deleteMany", entries: items });
  };

  const handleOpen = async (entry: FileEntry) => {
    if (entry.isDirectory) {
      const err = await loadDirectory(fullPath(entry.name));
      if (err) showToast(`Can't open "${entry.name}": ${err}`);
      return;
    }
    // Files open as their own tab. The explorer never becomes an editor, so
    // you keep your place in the tree while reading something.
    openViewer(fullPath(entry.name));
  };

  const handleNavigate = async (path: string) => {
    const err = await loadDirectory(path);
    if (err) {
      showToast(`Can't open "${path}": ${err}`);
      return; // navigation cancelled — stays on the current path
    }
    if (selectMode) exitSelectMode(); // selection is directory-specific
  };

  const handleGoUp = () => {
    if (cwd === "/") return;
    const parent = cwd.split("/").slice(0, -1).join("/") || "/";
    handleNavigate(parent);
  };

  const toggleHidden = (val: boolean) => {
    patch({ showHidden: val });
    loadDirectory(cwd, val);
  };

  // --- Actions ---
  const handleNewFolder = () => {
    setInputValue("");
    setDialog({ type: "newFolder" });
  };
  const confirmNewFolder = async () => {
    const name = inputValue.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/files/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: fullPath(name) }),
      });
      const data = await res.json();
      if (data.error) patch({ error: data.error });
      else await loadDirectory(cwd);
    } catch (err: any) {
      patch({ error: err.message });
    }
    setDialog(null);
  };

  const handleNewFile = () => {
    setInputValue("");
    setDialog({ type: "newFile" });
  };
  const confirmNewFile = async () => {
    const name = inputValue.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/files/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: fullPath(name), content: "" }),
      });
      const data = await res.json();
      if (data.error) patch({ error: data.error });
      else await loadDirectory(cwd);
    } catch (err: any) {
      patch({ error: err.message });
    }
    setDialog(null);
  };

  const handleDelete = (entry: FileEntry) => setDialog({ type: "delete", entry });
  const confirmDelete = async () => {
    if (dialog?.type !== "delete") return;
    try {
      const res = await fetch("/api/files/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: fullPath(dialog.entry.name) }),
      });
      const data = await res.json();
      if (data.error) patch({ error: data.error });
      else await loadDirectory(cwd);
    } catch (err: any) {
      patch({ error: err.message });
    }
    setDialog(null);
  };

  const confirmDeleteMany = async () => {
    if (dialog?.type !== "deleteMany") return;
    const items = dialog.entries;
    setDialog(null);
    // This dialog closes before the work runs, so freeze the explorer for the
    // whole delete loop + reload (otherwise navigation could slip in and then
    // get reset to cwd by the refresh).
    await withBusy(async () => {
      let failed = 0;
      for (const entry of items) {
        try {
          const res = await fetch("/api/files/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: fullPath(entry.name) }),
          });
          const data = await res.json();
          if (data.error) failed++;
        } catch {
          failed++;
        }
      }
      if (failed > 0) showToast(`Failed to delete ${failed} of ${items.length} item${items.length === 1 ? "" : "s"}`);
      exitSelectMode();
      await loadDirectory(cwd);
    });
  };

  const handleRename = (entry: FileEntry) => {
    setInputValue(entry.name);
    setDialog({ type: "rename", entry });
  };
  const confirmRename = async () => {
    if (dialog?.type !== "rename") return;
    const newName = inputValue.trim();
    if (!newName || newName === dialog.entry.name) {
      setDialog(null);
      return;
    }
    try {
      const res = await fetch("/api/files/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPath: fullPath(dialog.entry.name), newPath: fullPath(newName) }),
      });
      const data = await res.json();
      if (data.error) patch({ error: data.error });
      else await loadDirectory(cwd);
    } catch (err: any) {
      patch({ error: err.message });
    }
    setDialog(null);
  };

  const handleInfo = (entry: FileEntry) => setDialog({ type: "info", entry });

  // Move is a mode, not a dialog: the explorer itself becomes the destination
  // picker, so the user can browse to wherever they want it.
  const handleMove = (entry: FileEntry) => {
    setMoveSource({ name: entry.name, path: fullPath(entry.name), originCwd: cwd });
    setSelectMode(false);
    setSelected(new Set());
    setGroupMenu(false);
  };

  const cancelMove = async () => {
    const origin = moveSource?.originCwd;
    setMoveSource(null);
    // Put them back where the move started, as if nothing happened.
    if (origin && origin !== cwd) await loadDirectory(origin);
  };

  const confirmMove = async () => {
    if (!moveSource) return;
    await withBusy(async () => {
      try {
        const res = await fetch("/api/files/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourcePath: moveSource.path, destDir: cwd }),
        });
        const data = await res.json();
        if (data.error) {
          showToast(data.error);
          return;
        }
        setMoveSource(null);
        await loadDirectory(cwd);
        showToast(`Moved "${moveSource.name}" here`, "info");
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : "Move failed");
      }
    });
  };

  const cancelUpload = (index: number) => {
    const xhr = uploadXhrs.current.get(index);
    if (xhr) {
      xhr.abort();
      uploadXhrs.current.delete(index);
    }
    cancelledIndices.current.add(index);
    setUploadQueue((q) =>
      q.map((f, i) => (i === index && f.status !== "done" ? { ...f, status: "cancelled", progress: 0 } : f)),
    );
  };

  // When all jobs reach a terminal status, briefly show the result, then refresh
  // the tree and clear the queue. The explorer stays frozen (busy) the whole
  // time: queue is non-empty during the delay, and opBusy covers the reload —
  // so navigation can't slip in and then get reset by the background refresh.
  useEffect(() => {
    if (uploadQueue.length === 0) return;
    const allDone = uploadQueue.every((f) => f.status === "done" || f.status === "error" || f.status === "cancelled");
    if (!allDone) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setOpBusy(true);
      await loadDirectory(cwd); // load the new tree first, while still frozen
      if (cancelled) {
        setOpBusy(false);
        return;
      }
      uploadXhrs.current.clear();
      cancelledIndices.current.clear();
      setUploadQueue([]); // clear the queue only once the new tree is ready
      setOpBusy(false);
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uploadQueue]);

  const CHUNK_SIZE = 80 * 1024 * 1024; // 80MB — under Cloudflare's 100MB limit

  const uploadChunk = (blob: Blob, uploadId: string, chunkIndex: number, index: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const formData = new FormData();
      formData.append("uploadId", uploadId);
      formData.append("chunkIndex", String(chunkIndex));
      formData.append("chunk", blob);

      const xhr = new XMLHttpRequest();
      uploadXhrs.current.set(index, xhr);

      xhr.onload = () => {
        uploadXhrs.current.delete(index);
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(!data.error);
        } catch {
          resolve(false);
        }
      };
      xhr.onerror = () => {
        uploadXhrs.current.delete(index);
        resolve(false);
      };
      xhr.onabort = () => {
        uploadXhrs.current.delete(index);
        resolve(false);
      };

      xhr.open("POST", "/api/files/upload-chunk");
      xhr.send(formData);
    });
  };

  const uploadFile = async (file: File, index: number, relativePath: string): Promise<void> => {
    if (cancelledIndices.current.has(index)) return;
    setUploadQueue((q) => q.map((f, i) => (i === index ? { ...f, status: "uploading" } : f)));

    // Small files: direct upload
    if (file.size <= CHUNK_SIZE) {
      return new Promise((resolve) => {
        const formData = new FormData();
        formData.append("dir", cwd);
        formData.append("relativePath", relativePath);
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        uploadXhrs.current.set(index, xhr);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploadQueue((q) => q.map((f, i) => (i === index ? { ...f, progress: pct } : f)));
          }
        };
        xhr.onload = () => {
          uploadXhrs.current.delete(index);
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.error) {
              setUploadQueue((q) => q.map((f, i) => (i === index ? { ...f, status: "error", error: data.error } : f)));
            } else {
              setUploadQueue((q) => q.map((f, i) => (i === index ? { ...f, status: "done", progress: 100 } : f)));
            }
          } catch {
            setUploadQueue((q) => q.map((f, i) => (i === index ? { ...f, status: "done", progress: 100 } : f)));
          }
          resolve();
        };
        xhr.onerror = () => {
          uploadXhrs.current.delete(index);
          setUploadQueue((q) => q.map((f, i) => (i === index ? { ...f, status: "error", error: "Network error" } : f)));
          resolve();
        };
        xhr.onabort = () => {
          uploadXhrs.current.delete(index);
          resolve();
        };

        xhr.open("POST", "/api/files/upload");
        xhr.send(formData);
      });
    }

    // Large files: chunked upload
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    for (let c = 0; c < totalChunks; c++) {
      if (cancelledIndices.current.has(index)) {
        setUploadQueue((q) => q.map((f, i) => (i === index ? { ...f, status: "cancelled", progress: 0 } : f)));
        return;
      }
      const start = c * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const blob = file.slice(start, end);

      const ok = await uploadChunk(blob, uploadId, c, index);
      if (!ok) {
        setUploadQueue((q) =>
          q.map((f, i) => (i === index ? { ...f, status: "error", error: `Chunk ${c + 1}/${totalChunks} failed` } : f)),
        );
        return;
      }
      const pct = Math.round(((c + 1) / totalChunks) * 100);
      setUploadQueue((q) => q.map((f, i) => (i === index ? { ...f, progress: pct } : f)));
    }

    // Finalize: assemble chunks on server
    try {
      const res = await fetch("/api/files/upload-finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, dir: cwd, fileName: file.name, relativePath, totalChunks }),
      });
      const data = await res.json();
      if (data.error) {
        setUploadQueue((q) => q.map((f, i) => (i === index ? { ...f, status: "error", error: data.error } : f)));
      } else {
        setUploadQueue((q) => q.map((f, i) => (i === index ? { ...f, status: "done", progress: 100 } : f)));
      }
    } catch (err: any) {
      setUploadQueue((q) => q.map((f, i) => (i === index ? { ...f, status: "error", error: err.message } : f)));
    }
  };

  // Core upload pipeline. Each item carries a relativePath so folder uploads
  // recreate their structure (relativePath is "name" for plain files, or
  // "folder/sub/file" for folder uploads / dropped directories).
  const startUploads = async (items: { file: File; relativePath: string }[]) => {
    if (items.length === 0) return;

    // Conflict check on the top-level name each item lands under (a folder's
    // first path segment, or the file name).
    const topLevel = [...new Set(items.map((it) => it.relativePath.split("/")[0]))];
    const existingNames = new Set(entries.map((e) => e.name));
    const conflicts = topLevel.filter((n) => existingNames.has(n));
    if (conflicts.length > 0) {
      const names = conflicts.join(", ");
      const msg =
        conflicts.length === 1
          ? `"${names}" already exists. Overwrite/merge?`
          : `${conflicts.length} items already exist (${names}). Overwrite/merge?`;
      if (!window.confirm(msg)) return;
    }

    const startIndex = uploadQueue.length;
    const newFiles: UploadFile[] = items.map((it) => ({
      name: it.relativePath,
      size: it.file.size,
      status: "pending" as const,
      progress: 0,
    }));
    setUploadQueue((prev) => [...prev, ...newFiles]);

    for (let i = 0; i < items.length; i++) {
      const idx = startIndex + i;
      if (!cancelledIndices.current.has(idx)) {
        await uploadFile(items[i].file, idx, items[i].relativePath);
      }
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const items = Array.from(files).map((f) => ({ file: f, relativePath: f.webkitRelativePath || f.name }));
    await startUploads(items);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  // Recursively walk dropped filesystem entries into {file, relativePath} pairs
  // so dropped folders upload with their structure intact.
  const collectDroppedEntries = async (entries: FileSystemEntry[]): Promise<{ file: File; relativePath: string }[]> => {
    const out: { file: File; relativePath: string }[] = [];
    const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
      if (entry.isFile) {
        const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
        out.push({ file, relativePath: prefix + entry.name });
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        // readEntries returns at most ~100 per call; loop until it's drained.
        const readBatch = () => new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        for (let batch = await readBatch(); batch.length > 0; batch = await readBatch()) {
          for (const child of batch) await walk(child, `${prefix + entry.name}/`);
        }
      }
    };
    for (const entry of entries) await walk(entry, "");
    return out;
  };

  // Drag & drop upload. A dragenter/dragleave depth counter avoids flicker as
  // the pointer crosses child elements. Only reacts to dragged files.
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");
  const handleDragEnter = (e: React.DragEvent) => {
    if (!hasFiles(e) || busy) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!hasFiles(e) || busy) return;
    e.preventDefault();
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (busy) return;

    // Capture filesystem entries synchronously — dataTransfer is cleared once
    // the handler returns, so getAsEntry() must run before any await.
    const entries: FileSystemEntry[] = [];
    for (const item of Array.from(e.dataTransfer.items)) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }
    if (entries.length > 0) {
      collectDroppedEntries(entries).then((items) => startUploads(items));
    } else {
      handleUpload(e.dataTransfer.files); // fallback when entries aren't exposed
    }
  };

  return (
    <div
      className="relative flex-1 flex flex-col min-h-0"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Breadcrumbs
        path={cwd}
        onNavigate={busy ? () => {} : handleNavigate}
        onGoUp={busy ? () => {} : handleGoUp}
        canGoUp={cwd !== "/" && !busy}
        disabled={busy}
      />

      {loading ? (
        <div className="flex flex-col items-center justify-center flex-1 text-ink-faint gap-2">
          <svg className="w-6 h-6 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading...</span>
        </div>
      ) : (
        <FileList
          entries={entries}
          onOpen={handleOpen}
          onDelete={handleDelete}
          onInfo={handleInfo}
          onRename={handleRename}
          onDownload={handleDownload}
          onCopyPath={handleCopyPath}
          onMove={handleMove}
          moveMode={!!moveSource}
          movingName={moveSource && moveSource.originCwd === cwd ? moveSource.name : null}
          selectMode={selectMode}
          selectedNames={selected}
          onToggleSelect={toggleSelect}
          uploadQueue={uploadQueue}
          cancelUpload={cancelUpload}
          disabled={busy}
        />
      )}

      {/* Dialogs */}
      {dialog && (
        <div className="scrim fixed inset-0 z-50 flex items-center justify-center" onClick={() => setDialog(null)}>
          <div className="glass rounded-panel p-4 mx-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            {dialog.type === "newFolder" && (
              <>
                <h3 className="text-sm font-medium text-ink mb-3">New Folder</h3>
                <input
                  autoFocus
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmNewFolder()}
                  placeholder="Folder name"
                  className="w-full bg-app text-ink border border-line-strong rounded-control px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 mb-3"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setDialog(null)}
                    className="px-3 py-1.5 text-sm text-ink-dim hover:text-ink transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmNewFolder}
                    disabled={!inputValue.trim()}
                    className="px-3 py-1.5 text-sm relief-accent disabled:bg-control disabled:text-ink-faint text-white rounded-control transition-colors"
                  >
                    Create
                  </button>
                </div>
              </>
            )}
            {dialog.type === "newFile" && (
              <>
                <h3 className="text-sm font-medium text-ink mb-3">New File</h3>
                <input
                  autoFocus
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmNewFile()}
                  placeholder="File name"
                  className="w-full bg-app text-ink border border-line-strong rounded-control px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 mb-3"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setDialog(null)}
                    className="px-3 py-1.5 text-sm text-ink-dim hover:text-ink transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmNewFile}
                    disabled={!inputValue.trim()}
                    className="px-3 py-1.5 text-sm relief-accent disabled:bg-control disabled:text-ink-faint text-white rounded-control transition-colors"
                  >
                    Create
                  </button>
                </div>
              </>
            )}
            {dialog.type === "rename" && (
              <>
                <h3 className="text-sm font-medium text-ink mb-3">Rename</h3>
                <input
                  autoFocus
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmRename()}
                  className="w-full bg-app text-ink border border-line-strong rounded-control px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 mb-3"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setDialog(null)}
                    className="px-3 py-1.5 text-sm text-ink-dim hover:text-ink transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmRename}
                    disabled={!inputValue.trim() || inputValue.trim() === dialog.entry.name}
                    className="px-3 py-1.5 text-sm relief-accent disabled:bg-control disabled:text-ink-faint text-white rounded-control transition-colors"
                  >
                    Rename
                  </button>
                </div>
              </>
            )}
            {dialog.type === "delete" && (
              <>
                <h3 className="text-sm font-medium text-ink mb-2">Delete</h3>
                <p className="text-sm text-ink-muted mb-1">
                  Are you sure you want to delete <span className="text-ink font-medium">{dialog.entry.name}</span>?
                </p>
                {dialog.entry.isDirectory && (
                  <p className="text-xs text-yellow-400 mb-3">
                    This will recursively delete the folder and all its contents.
                  </p>
                )}
                {!dialog.entry.isDirectory && <div className="mb-3" />}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setDialog(null)}
                    className="px-3 py-1.5 text-sm text-ink-dim hover:text-ink transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="px-3 py-1.5 text-sm relief-accent relief-danger text-white rounded-control transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
            {dialog.type === "deleteMany" &&
              (() => {
                const folderCount = dialog.entries.filter((e) => e.isDirectory).length;
                const n = dialog.entries.length;
                return (
                  <>
                    <h3 className="text-sm font-medium text-ink mb-2">Delete {n} items</h3>
                    <p className="text-sm text-ink-muted mb-1">
                      Are you sure you want to delete <span className="text-ink font-medium">{n}</span> selected item
                      {n === 1 ? "" : "s"}?
                    </p>
                    {folderCount > 0 && (
                      <p className="text-xs text-yellow-400 mb-3">
                        ⚠️ {folderCount} folder{folderCount === 1 ? "" : "s"} will be deleted recursively, including all
                        contents.
                      </p>
                    )}
                    {folderCount === 0 && <div className="mb-3" />}
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setDialog(null)}
                        className="px-3 py-1.5 text-sm text-ink-dim hover:text-ink transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={confirmDeleteMany}
                        className="px-3 py-1.5 text-sm relief-accent relief-danger text-white rounded-control transition-colors"
                      >
                        Delete {n}
                      </button>
                    </div>
                  </>
                );
              })()}
            {dialog.type === "info" && (
              <>
                <h3 className="text-sm font-medium text-ink mb-3">File Info</h3>
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      ["Name", dialog.entry.name],
                      ["Type", dialog.entry.isDirectory ? "Directory" : "File"],
                      ["Size", formatSize(dialog.entry.size)],
                      ["Modified", new Date(dialog.entry.modified).toLocaleString()],
                      ["Permissions", dialog.entry.permissions],
                      ["Path", fullPath(dialog.entry.name)],
                    ].map(([label, value]) => (
                      <tr key={label} className="border-b border-line/50">
                        <td className="py-1.5 pr-3 text-ink-dim whitespace-nowrap">{label}</td>
                        <td className="py-1.5 text-ink-muted break-all">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-end mt-3">
                  <button
                    onClick={() => setDialog(null)}
                    className="px-3 py-1.5 text-sm relief text-ink rounded-control transition-colors"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* This explorer tab's control bar. It sits at the bottom, where the
          terminal's input box sits, so every tab type puts its controls in the
          same place. While picking a move destination the normal controls are
          replaced by the confirm/cancel pair. */}
      <div className="bar-edge flex items-center justify-between gap-2 px-3 py-1.5 bg-surface border-t border-line shrink-0 overflow-x-auto">
        {moveSource ? (
          <>
            <span className="min-w-0 truncate text-xs text-ink-dim">
              Moving <span className="font-medium text-ink">{moveSource.name}</span>
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={confirmMove}
                disabled={busy || cwd === moveSource.originCwd}
                title={cwd === moveSource.originCwd ? "Browse to another folder first" : undefined}
                className="px-2 py-0.5 text-xs font-medium relief-accent text-white rounded-control transition-colors disabled:bg-control disabled:text-ink-faint disabled:pointer-events-none"
              >
                Move to this directory
              </button>
              <button
                type="button"
                onClick={cancelMove}
                disabled={busy}
                className="px-2 py-0.5 text-xs text-ink-muted hover:text-ink border border-line hover:border-line-strong rounded-control transition-colors disabled:pointer-events-none disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={handleNewFile}
                disabled={busy}
                className="p-1.5 text-ink-dim hover:text-ink disabled:text-ink-ghost disabled:pointer-events-none transition-colors"
                title="New file"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6M12 18v-6M9 15h6" />
                </svg>
              </button>
              <button
                onClick={handleNewFolder}
                disabled={busy}
                className="p-1.5 text-ink-dim hover:text-ink disabled:text-ink-ghost disabled:pointer-events-none transition-colors"
                title="New folder"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v6M9 14h6" />
                </svg>
              </button>
              <button
                onClick={() => uploadInputRef.current?.click()}
                disabled={busy}
                className="p-1.5 text-ink-dim hover:text-ink disabled:text-ink-ghost disabled:pointer-events-none transition-colors"
                title="Upload files"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5 5 5M12 15V3"
                  />
                </svg>
              </button>
              <button
                onClick={() => folderInputRef.current?.click()}
                disabled={busy}
                className="p-1.5 text-ink-dim hover:text-ink disabled:text-ink-ghost disabled:pointer-events-none transition-colors"
                title="Upload folder"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v5m-2.5-2.5L12 11l2.5 2.5" />
                </svg>
              </button>
              <input
                ref={uploadInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
              <input
                ref={(el) => {
                  folderInputRef.current = el;
                  // webkitdirectory isn't a typed React prop; set it imperatively.
                  if (el) {
                    el.setAttribute("webkitdirectory", "");
                    el.setAttribute("directory", "");
                  }
                }}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
            </div>
            <div className="flex items-center gap-1 text-sm shrink-0">
              {selectMode && (
                <>
                  <span className="text-xs text-ink-dim tabular-nums">{selected.size} selected</span>
                  <button
                    onClick={toggleSelectAll}
                    className="px-2 py-0.5 text-xs text-ink-muted hover:text-ink border border-line rounded-control transition-colors"
                  >
                    {selected.size === entries.length && entries.length > 0 ? "None" : "All"}
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setGroupMenu((v) => !v)}
                      disabled={selected.size === 0}
                      aria-haspopup="menu"
                      aria-expanded={groupMenu}
                      className={`p-1 rounded-control transition-colors disabled:text-ink-ghost disabled:pointer-events-none ${
                        groupMenu ? "bg-hover text-ink" : "text-ink-dim hover:text-ink"
                      }`}
                      title="Actions on selected"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                    {groupMenu && (
                      <>
                        <button
                          type="button"
                          className="fixed inset-0 z-40 cursor-default"
                          onClick={() => setGroupMenu(false)}
                          aria-label="Close menu"
                        />
                        <div className="absolute right-0 top-full mt-1 z-50 glass rounded-panel py-1 min-w-[160px]">
                          <button
                            onClick={handleGroupDownload}
                            className="w-full text-left px-3 py-2 text-sm text-ink-muted hover:bg-hover transition-colors"
                          >
                            Download
                          </button>
                          <button
                            onClick={handleGroupDelete}
                            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-hover transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
              <button
                onClick={() => {
                  if (selectMode) exitSelectMode();
                  loadDirectory(cwd);
                }}
                disabled={busy}
                className="p-1.5 text-ink-dim hover:text-ink disabled:text-ink-ghost disabled:pointer-events-none transition-colors"
                title="Refresh"
                aria-label="Refresh files"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectMode) exitSelectMode();
                  toggleHidden(!showHidden);
                }}
                disabled={busy}
                aria-pressed={showHidden}
                className={`px-2 py-0.5 text-xs border rounded-control transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                  showHidden
                    ? "border-blue-500/70 bg-blue-500/20 text-blue-200"
                    : "border-line text-ink-dim hover:border-line-strong hover:text-ink"
                }`}
                title={`${showHidden ? "Hide" : "Show"} hidden files`}
              >
                Hidden
              </button>
              <button
                type="button"
                onClick={selectMode ? exitSelectMode : enterSelectMode}
                disabled={busy}
                className="px-2 py-0.5 text-xs text-ink-muted hover:text-ink border border-line hover:border-line-strong rounded-control transition-colors disabled:pointer-events-none disabled:opacity-50"
              >
                {selectMode ? "Cancel" : "Select"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Drag & drop upload overlay */}
      {dragging && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-blue-950/70 border-2 border-dashed border-blue-400 rounded-panel pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-blue-200">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5 7.5 12M12 7.5V21"
              />
            </svg>
            <span className="text-sm font-medium">Drop files to upload</span>
            <span className="text-xs text-blue-300/80 truncate max-w-full">to {cwd}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main page ---
export default function FilesPage({ sessionId }: { sessionId: string }) {
  const session = useFileStore((s) => s.sessions[sessionId]);
  if (!session) return null;
  return <FileSessionView session={session} />;
}
