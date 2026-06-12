import { useEffect, useCallback, useState, useRef } from "react";
import { useFileStore, type FileEntry, type FileSession } from "~/stores/fileStore";
import Breadcrumbs from "./Breadcrumbs";
import FileList from "./FileList";
import FileViewer from "./FileViewer";
import RenamableTab from "~/components/RenamableTab";

// Clipboard fallback for insecure contexts / older mobile browsers where
// navigator.clipboard is unavailable. Must run within a user gesture.
function fallbackCopy(text: string): void {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    /* nothing more we can do */
  }
  ta.remove();
}

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
  | { type: "info"; entry: FileEntry }
  | { type: "rename"; entry: FileEntry }
  | null;

// --- Tabs ---
function FileTabs() {
  const sessions = useFileStore((s) => s.sessions);
  const activeSessionId = useFileStore((s) => s.activeSessionId);
  const setActiveSession = useFileStore((s) => s.setActiveSession);
  const closeSession = useFileStore((s) => s.closeSession);
  const createSession = useFileStore((s) => s.createSession);
  const updateSession = useFileStore((s) => s.updateSession);

  const sessionsArray = Object.values(sessions);
  const existingNames = sessionsArray.map((s) => s.name);

  const folderIcon = (
    <svg className="w-3 h-3 shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );

  return (
    <div className="flex items-center border-b border-gray-700 bg-[#0d0d1a] overflow-x-auto scrollbar-none shrink-0">
      {sessionsArray.map((session) => (
        <RenamableTab
          key={session.id}
          name={session.name}
          isActive={session.id === activeSessionId}
          existingNames={existingNames.filter((n) => n !== session.name)}
          onRename={(name) => updateSession(session.id, { name })}
          onClick={() => setActiveSession(session.id)}
          onClose={() => closeSession(session.id)}
          icon={folderIcon}
          showClose={sessionsArray.length > 1}
        />
      ))}
      <button
        onClick={() => createSession()}
        className="px-3 py-1.5 text-gray-400 hover:text-white hover:bg-[#16162a]/50 transition-colors shrink-0"
        title="New explorer"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}

// --- Single session view ---
function FileSessionView({ session }: { session: FileSession }) {
  const updateSession = useFileStore((s) => s.updateSession);
  const id = session.id;

  const [dialog, setDialog] = useState<Dialog>(null);
  const [inputValue, setInputValue] = useState("");

  const patch = useCallback(
    (p: Partial<FileSession>) => updateSession(id, p),
    [id, updateSession]
  );

  const loadDirectory = useCallback(
    async (dir: string, showHidden?: boolean) => {
      const hidden = showHidden ?? session.showHidden;
      patch({ loading: true });
      try {
        const res = await fetch(`/api/files/list?dir=${encodeURIComponent(dir)}&showHidden=${hidden}`);
        const data = await res.json();
        if (data.error) {
          patch({ error: data.error, loading: false });
        } else {
          patch({ cwd: data.dir, entries: data.entries, error: null, loading: false });
        }
      } catch (err: any) {
        patch({ error: err.message, loading: false });
      }
    },
    [id, session.showHidden]
  );

  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    if (!session.cwd) loadDirectory("");
  }, []);

  const { cwd, entries, showHidden, selectedFile, fileContent, loading } = session;
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

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
  const uploading = uploadQueue.some((f) => f.status === "pending" || f.status === "uploading");


  const fullPath = (name: string) => (cwd === "/" ? `/${name}` : `${cwd}/${name}`);

  const handleCopyPath = (entry: FileEntry) => {
    const path = fullPath(entry.name);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(path).catch(() => fallbackCopy(path));
    } else {
      fallbackCopy(path);
    }
  };

  const handleDownload = (entry: FileEntry) => {
    if (entry.isDirectory) return;
    const a = document.createElement("a");
    a.href = `/api/files/download?path=${encodeURIComponent(fullPath(entry.name))}`;
    a.download = entry.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleOpen = async (entry: FileEntry) => {
    if (entry.isDirectory) {
      await loadDirectory(fullPath(entry.name));
      patch({ selectedFile: null, fileContent: null });
      setFileError(null);
    } else {
      const filePath = fullPath(entry.name);
      patch({ selectedFile: filePath, fileContent: null });
      setFileLoading(true);
      setFileError(null);
      try {
        const res = await fetch(`/api/files/read?path=${encodeURIComponent(filePath)}`);
        const data = await res.json();
        if (data.error) {
          const sizeInfo = data.size ? ` (${formatSize(data.size)})` : "";
          setFileError(`${data.error}${sizeInfo}`);
          patch({ fileContent: null });
        } else {
          patch({ fileContent: data.content !== undefined ? data.content : null });
        }
      } catch (err: any) {
        setFileError(err.message || "Failed to load file");
        patch({ fileContent: null });
      }
      setFileLoading(false);
    }
  };

  const handleNavigate = (path: string) => {
    loadDirectory(path);
    patch({ selectedFile: null, fileContent: null });
  };

  const handleGoUp = () => {
    if (cwd === "/") return;
    const parent = cwd.split("/").slice(0, -1).join("/") || "/";
    handleNavigate(parent);
  };

  const handleSave = async (content: string) => {
    if (!selectedFile) return;
    try {
      await fetch("/api/files/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedFile, content }),
      });
    } catch (err: any) {
      patch({ error: err.message });
    }
  };

  const handleCloseFile = () => { patch({ selectedFile: null, fileContent: null }); setFileError(null); };

  const toggleHidden = (val: boolean) => {
    patch({ showHidden: val });
    loadDirectory(cwd, val);
  };

  // --- Actions ---
  const handleNewFolder = () => { setInputValue(""); setDialog({ type: "newFolder" }); };
  const confirmNewFolder = async () => {
    const name = inputValue.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/files/mkdir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: fullPath(name) }) });
      const data = await res.json();
      if (data.error) patch({ error: data.error }); else await loadDirectory(cwd);
    } catch (err: any) { patch({ error: err.message }); }
    setDialog(null);
  };

  const handleNewFile = () => { setInputValue(""); setDialog({ type: "newFile" }); };
  const confirmNewFile = async () => {
    const name = inputValue.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/files/write", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: fullPath(name), content: "" }) });
      const data = await res.json();
      if (data.error) patch({ error: data.error }); else await loadDirectory(cwd);
    } catch (err: any) { patch({ error: err.message }); }
    setDialog(null);
  };

  const handleDelete = (entry: FileEntry) => setDialog({ type: "delete", entry });
  const confirmDelete = async () => {
    if (dialog?.type !== "delete") return;
    try {
      const res = await fetch("/api/files/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: fullPath(dialog.entry.name) }) });
      const data = await res.json();
      if (data.error) patch({ error: data.error }); else await loadDirectory(cwd);
    } catch (err: any) { patch({ error: err.message }); }
    setDialog(null);
  };

  const handleRename = (entry: FileEntry) => { setInputValue(entry.name); setDialog({ type: "rename", entry }); };
  const confirmRename = async () => {
    if (dialog?.type !== "rename") return;
    const newName = inputValue.trim();
    if (!newName || newName === dialog.entry.name) { setDialog(null); return; }
    try {
      const res = await fetch("/api/files/rename", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oldPath: fullPath(dialog.entry.name), newPath: fullPath(newName) }) });
      const data = await res.json();
      if (data.error) patch({ error: data.error }); else await loadDirectory(cwd);
    } catch (err: any) { patch({ error: err.message }); }
    setDialog(null);
  };

  const handleInfo = (entry: FileEntry) => setDialog({ type: "info", entry });

  const cancelUpload = (index: number) => {
    const xhr = uploadXhrs.current.get(index);
    if (xhr) {
      xhr.abort();
      uploadXhrs.current.delete(index);
    }
    cancelledIndices.current.add(index);
    setUploadQueue((q) => q.map((f, i) => i === index && f.status !== "done" ? { ...f, status: "cancelled", progress: 0 } : f));
  };

  // Auto-clear upload queue when all jobs reach a terminal status
  useEffect(() => {
    if (uploadQueue.length === 0) return;
    const allDone = uploadQueue.every((f) => f.status === "done" || f.status === "error" || f.status === "cancelled");
    if (!allDone) return;
    const timer = setTimeout(() => {
      setUploadQueue([]);
      uploadXhrs.current.clear();
      cancelledIndices.current.clear();
      loadDirectory(cwd);
    }, 1500);
    return () => clearTimeout(timer);
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
        } catch { resolve(false); }
      };
      xhr.onerror = () => { uploadXhrs.current.delete(index); resolve(false); };
      xhr.onabort = () => { uploadXhrs.current.delete(index); resolve(false); };

      xhr.open("POST", "/api/files/upload-chunk");
      xhr.send(formData);
    });
  };

  const uploadFile = async (file: File, index: number): Promise<void> => {
    if (cancelledIndices.current.has(index)) return;
    setUploadQueue((q) => q.map((f, i) => i === index ? { ...f, status: "uploading" } : f));

    // Small files: direct upload
    if (file.size <= CHUNK_SIZE) {
      return new Promise((resolve) => {
        const formData = new FormData();
        formData.append("dir", cwd);
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        uploadXhrs.current.set(index, xhr);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploadQueue((q) => q.map((f, i) => i === index ? { ...f, progress: pct } : f));
          }
        };
        xhr.onload = () => {
          uploadXhrs.current.delete(index);
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.error) {
              setUploadQueue((q) => q.map((f, i) => i === index ? { ...f, status: "error", error: data.error } : f));
            } else {
              setUploadQueue((q) => q.map((f, i) => i === index ? { ...f, status: "done", progress: 100 } : f));
            }
          } catch {
            setUploadQueue((q) => q.map((f, i) => i === index ? { ...f, status: "done", progress: 100 } : f));
          }
          resolve();
        };
        xhr.onerror = () => {
          uploadXhrs.current.delete(index);
          setUploadQueue((q) => q.map((f, i) => i === index ? { ...f, status: "error", error: "Network error" } : f));
          resolve();
        };
        xhr.onabort = () => { uploadXhrs.current.delete(index); resolve(); };

        xhr.open("POST", "/api/files/upload");
        xhr.send(formData);
      });
    }

    // Large files: chunked upload
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    for (let c = 0; c < totalChunks; c++) {
      if (cancelledIndices.current.has(index)) {
        setUploadQueue((q) => q.map((f, i) => i === index ? { ...f, status: "cancelled", progress: 0 } : f));
        return;
      }
      const start = c * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const blob = file.slice(start, end);

      const ok = await uploadChunk(blob, uploadId, c, index);
      if (!ok) {
        setUploadQueue((q) => q.map((f, i) => i === index ? { ...f, status: "error", error: `Chunk ${c + 1}/${totalChunks} failed` } : f));
        return;
      }
      const pct = Math.round(((c + 1) / totalChunks) * 100);
      setUploadQueue((q) => q.map((f, i) => i === index ? { ...f, progress: pct } : f));
    }

    // Finalize: assemble chunks on server
    try {
      const res = await fetch("/api/files/upload-finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, dir: cwd, fileName: file.name, totalChunks }),
      });
      const data = await res.json();
      if (data.error) {
        setUploadQueue((q) => q.map((f, i) => i === index ? { ...f, status: "error", error: data.error } : f));
      } else {
        setUploadQueue((q) => q.map((f, i) => i === index ? { ...f, status: "done", progress: 100 } : f));
      }
    } catch (err: any) {
      setUploadQueue((q) => q.map((f, i) => i === index ? { ...f, status: "error", error: err.message } : f));
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);

    // Check for overwrites
    const existingNames = new Set(entries.map((e) => e.name));
    const conflicts = fileArray.filter((f) => existingNames.has(f.name));
    if (conflicts.length > 0) {
      const names = conflicts.map((f) => f.name).join(", ");
      const msg = conflicts.length === 1
        ? `"${names}" already exists. Overwrite?`
        : `${conflicts.length} files already exist (${names}). Overwrite?`;
      if (!window.confirm(msg)) {
        if (uploadInputRef.current) uploadInputRef.current.value = "";
        return;
      }
    }

    const startIndex = uploadQueue.length;
    const newFiles: UploadFile[] = fileArray.map((f) => ({
      name: f.name,
      size: f.size,
      status: "pending" as const,
      progress: 0,
    }));
    setUploadQueue((prev) => [...prev, ...newFiles]);

    for (let i = 0; i < fileArray.length; i++) {
      const idx = startIndex + i;
      if (!cancelledIndices.current.has(idx)) {
        await uploadFile(fileArray[i], idx);
      }
    }
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  };

  if (selectedFile) {
    if (fileLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-[#0d0d1a] text-gray-500 gap-3">
          <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Opening file...</span>
          <span className="text-xs text-gray-600 overflow-hidden text-ellipsis max-w-xs">{selectedFile}</span>
        </div>
      );
    }
    if (fileError) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-[#0d0d1a] text-gray-400 gap-3">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span className="text-sm text-red-400">{fileError}</span>
          <span className="text-xs text-gray-600 overflow-hidden text-ellipsis max-w-xs">{selectedFile}</span>
          <button
            onClick={handleCloseFile}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
          >
            Back
          </button>
        </div>
      );
    }
    return (
      <FileViewer
        path={selectedFile}
        content={fileContent}
        onSave={handleSave}
        onClose={handleCloseFile}
      />
    );
  }

  return (
    <>
      <Breadcrumbs path={cwd} onNavigate={uploading ? () => {} : handleNavigate} onGoUp={uploading ? () => {} : handleGoUp} canGoUp={cwd !== "/" && !uploading} disabled={uploading} />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#16162a] border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-0.5">
          <button onClick={() => loadDirectory(cwd)} disabled={uploading} className="p-1.5 text-gray-400 hover:text-white disabled:text-gray-600 disabled:pointer-events-none transition-colors" title="Refresh">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button onClick={handleNewFile} disabled={uploading} className="p-1.5 text-gray-400 hover:text-white disabled:text-gray-600 disabled:pointer-events-none transition-colors" title="New file">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6M12 18v-6M9 15h6" />
            </svg>
          </button>
          <button onClick={handleNewFolder} disabled={uploading} className="p-1.5 text-gray-400 hover:text-white disabled:text-gray-600 disabled:pointer-events-none transition-colors" title="New folder">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v6M9 14h6" />
            </svg>
          </button>
          <button onClick={() => uploadInputRef.current?.click()} className="p-1.5 text-gray-400 hover:text-white transition-colors" title="Upload files">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5 5 5M12 15V3" />
            </svg>
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
        <label className={`flex items-center gap-2 text-sm text-gray-400 ${uploading ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
          <input type="checkbox" checked={showHidden} onChange={(e) => toggleHidden(e.target.checked)} disabled={uploading} className="accent-blue-500" />
          Hidden
        </label>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center flex-1 text-gray-500 gap-2">
          <svg className="w-6 h-6 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading...</span>
        </div>
      ) : (
        <FileList entries={entries} onOpen={handleOpen} onDelete={handleDelete} onInfo={handleInfo} onRename={handleRename} onDownload={handleDownload} onCopyPath={handleCopyPath} uploadQueue={uploadQueue} cancelUpload={cancelUpload} disabled={uploading} />
      )}

      {/* Dialogs */}
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDialog(null)}>
          <div className="bg-[#1e1e3a] border border-gray-600 rounded-lg shadow-xl p-4 mx-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            {dialog.type === "newFolder" && (
              <>
                <h3 className="text-sm font-medium text-white mb-3">New Folder</h3>
                <input autoFocus value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmNewFolder()} placeholder="Folder name" className="w-full bg-[#0d0d1a] text-white border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 mb-3" />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setDialog(null)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
                  <button onClick={confirmNewFolder} disabled={!inputValue.trim()} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors">Create</button>
                </div>
              </>
            )}
            {dialog.type === "newFile" && (
              <>
                <h3 className="text-sm font-medium text-white mb-3">New File</h3>
                <input autoFocus value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmNewFile()} placeholder="File name" className="w-full bg-[#0d0d1a] text-white border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 mb-3" />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setDialog(null)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
                  <button onClick={confirmNewFile} disabled={!inputValue.trim()} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors">Create</button>
                </div>
              </>
            )}
            {dialog.type === "rename" && (
              <>
                <h3 className="text-sm font-medium text-white mb-3">Rename</h3>
                <input autoFocus value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmRename()} className="w-full bg-[#0d0d1a] text-white border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 mb-3" />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setDialog(null)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
                  <button onClick={confirmRename} disabled={!inputValue.trim() || inputValue.trim() === dialog.entry.name} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors">Rename</button>
                </div>
              </>
            )}
            {dialog.type === "delete" && (
              <>
                <h3 className="text-sm font-medium text-white mb-2">Delete</h3>
                <p className="text-sm text-gray-300 mb-1">
                  Are you sure you want to delete <span className="text-white font-medium">{dialog.entry.name}</span>?
                </p>
                {dialog.entry.isDirectory && <p className="text-xs text-yellow-400 mb-3">This will recursively delete the folder and all its contents.</p>}
                {!dialog.entry.isDirectory && <div className="mb-3" />}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setDialog(null)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
                  <button onClick={confirmDelete} className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors">Delete</button>
                </div>
              </>
            )}
            {dialog.type === "info" && (
              <>
                <h3 className="text-sm font-medium text-white mb-3">File Info</h3>
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
                      <tr key={label} className="border-b border-gray-700/50">
                        <td className="py-1.5 pr-3 text-gray-400 whitespace-nowrap">{label}</td>
                        <td className="py-1.5 text-gray-200 break-all">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-end mt-3">
                  <button onClick={() => setDialog(null)} className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors">Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// --- Main page ---
export default function FilesPage() {
  const sessions = useFileStore((s) => s.sessions);
  const activeSessionId = useFileStore((s) => s.activeSessionId);
  const createSession = useFileStore((s) => s.createSession);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    if (Object.keys(useFileStore.getState().sessions).length === 0) {
      createSession();
    }
  }, []);

  const sessionsArray = Object.values(sessions);

  return (
    <div className="flex flex-col h-full min-h-0">
      <FileTabs />
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {sessionsArray.map((session) => (
          <div
            key={session.id}
            className="flex-1 flex flex-col min-h-0"
            style={{ display: session.id === activeSessionId ? "flex" : "none" }}
          >
            <FileSessionView session={session} />
          </div>
        ))}
      </div>
    </div>
  );
}
