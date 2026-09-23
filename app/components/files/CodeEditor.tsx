import { marked } from "marked";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSaveShortcut } from "~/lib/keys";
import { rewriteLocalAssets } from "~/lib/markdown";
import { useWorkspaceStore } from "~/stores/workspaceStore";
import CopyPathButton from "./CopyPathButton";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

interface CodeEditorProps {
  path: string;
  content: string;
  onSave: (content: string) => void;
  onClose: () => void;
}

const PREVIEWABLE = new Set(["md", "markdown", "html", "htm", "ipynb"]);

function getExt(path: string): string {
  return path.split(".").pop()?.toLowerCase() || "";
}

function getLanguage(path: string): string {
  const ext = getExt(path);
  const map: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    css: "css",
    scss: "scss",
    html: "html",
    xml: "xml",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    md: "markdown",
    markdown: "markdown",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    sql: "sql",
    dockerfile: "dockerfile",
    makefile: "makefile",
  };
  return map[ext] || "plaintext";
}

function MarkdownPreview({ content, fontSize, path }: { content: string; fontSize: number; path: string }) {
  const html = useMemo(() => {
    marked.setOptions({ breaks: true, gfm: true });
    return rewriteLocalAssets(marked.parse(content) as string, path);
  }, [content, path]);

  return (
    <div
      className="prose prose-invert max-w-none p-4 overflow-auto h-full bg-app"
      style={{ fontSize: `${fontSize}px` }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function HtmlPreview({ content, zoom }: { content: string; zoom: number }) {
  const blob = useMemo(() => {
    const b = new Blob([content], { type: "text/html" });
    return URL.createObjectURL(b);
  }, [content]);

  const scale = zoom / 100;

  return (
    <div className="w-full h-full overflow-auto bg-white">
      <iframe
        src={blob}
        title="HTML Preview"
        sandbox="allow-scripts"
        style={{
          border: "none",
          width: `${100 / scale}%`,
          height: `${100 / scale}%`,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
        }}
      />
    </div>
  );
}

interface NotebookCell {
  cell_type: string;
  source: string | string[];
  outputs?: Array<{
    output_type: string;
    text?: string | string[];
    data?: Record<string, string | string[]>;
  }>;
}

function joinSource(s: string | string[] | undefined): string {
  if (!s) return "";
  return Array.isArray(s) ? s.join("") : s;
}

function NotebookPreview({ content, fontSize }: { content: string; fontSize: number }) {
  const cells = useMemo(() => {
    try {
      const nb = JSON.parse(content);
      return (nb.cells || []) as NotebookCell[];
    } catch {
      return [];
    }
  }, [content]);

  if (cells.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-ink-faint text-sm">Could not parse notebook</div>
    );
  }

  return (
    <div className="overflow-auto h-full bg-app p-4 space-y-3" style={{ fontSize: `${fontSize}px` }}>
      {cells.map((cell, i) => (
        <div key={i} className="rounded-control border border-line overflow-hidden">
          {/* Cell header */}
          <div className="flex items-center gap-2 px-3 py-1 bg-surface text-xs text-ink-dim">
            <span
              className={`px-1.5 py-0.5 rounded-control text-[10px] font-medium ${
                cell.cell_type === "code" ? "bg-blue-900/50 text-blue-300" : "bg-green-900/50 text-green-300"
              }`}
            >
              {cell.cell_type}
            </span>
            <span>[{i + 1}]</span>
          </div>
          {/* Cell source */}
          <div className="bg-raised">
            {cell.cell_type === "markdown" ? (
              <div
                className="prose prose-invert prose-sm max-w-none p-3"
                dangerouslySetInnerHTML={{
                  __html: marked.parse(joinSource(cell.source)) as string,
                }}
              />
            ) : (
              <pre className="p-3 text-sm text-ink-muted overflow-x-auto font-mono">{joinSource(cell.source)}</pre>
            )}
          </div>
          {/* Cell outputs */}
          {cell.outputs && cell.outputs.length > 0 && (
            <div className="border-t border-line bg-app p-3">
              {cell.outputs.map((output, j) => {
                const text = joinSource(output.text) || joinSource(output.data?.["text/plain"]) || "";
                const html = joinSource(output.data?.["text/html"]);
                const imgRaw = output.data?.["image/png"];
                const imgData = Array.isArray(imgRaw) ? imgRaw[0] : imgRaw;

                return (
                  <div key={j}>
                    {html ? (
                      <div
                        className="prose prose-invert prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: html }}
                      />
                    ) : imgData ? (
                      <img src={`data:image/png;base64,${imgData}`} alt="output" className="max-w-full" />
                    ) : text ? (
                      <pre className="text-sm text-ink-muted overflow-x-auto font-mono whitespace-pre-wrap">{text}</pre>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const MODES = ["edit", "plain", "preview"] as const;
type Mode = (typeof MODES)[number];

const MODE_LABELS: Record<Mode, string> = { edit: "Edit", plain: "Plain", preview: "Preview" };
const MODE_HINTS: Record<Mode, string> = {
  edit: "Full code editor",
  plain: "Easier select & copy",
  preview: "Rendered output",
};

/**
 * The slice of Monaco's editor we actually use. Structural rather than an
 * import so the type doesn't drag the whole editor package into scope.
 */
interface MonacoHandle {
  trigger: (source: string, handlerId: string, payload: unknown) => void;
  focus: () => void;
  getModel: () => { canUndo: () => boolean; canRedo: () => boolean } | null;
  addCommand: (keybinding: number, handler: () => void) => void;
}

export default function CodeEditor({ path, content, onSave, onClose }: CodeEditorProps) {
  const ext = getExt(path);
  const canPreview = PREVIEWABLE.has(ext);
  const [value, setValue] = useState(content);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<Mode>(canPreview ? "preview" : "edit");
  const [modeMenu, setModeMenu] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const monacoRef = useRef<MonacoHandle | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const editorFontSize = useWorkspaceStore((s) => s.editorFontSize);
  const monacoTheme = useWorkspaceStore((s) => (s.theme === "light" ? "light" : "vs-dark"));
  const isHtml = ext === "html" || ext === "htm";
  const [htmlZoom, setHtmlZoom] = useState(100);

  // Asks Monaco rather than shadowing it with a second stack: two histories
  // over one editor would disagree the moment someone pressed Ctrl+Z.
  const refreshHistory = useCallback(() => {
    const model = monacoRef.current?.getModel();
    setCanUndo(!!model?.canUndo());
    setCanRedo(!!model?.canRedo());
  }, []);

  const handleChange = (v: string | undefined) => {
    if (v === undefined) return;
    setValue(v);
    setDirty(v !== content);
    refreshHistory();
  };

  const history = (direction: "undo" | "redo") => {
    monacoRef.current?.trigger("toolbar", direction, null);
    monacoRef.current?.focus();
    // Monaco applies the edit synchronously but settles its stack after.
    queueMicrotask(refreshHistory);
  };

  useEffect(refreshHistory, [refreshHistory]);

  useEffect(() => {
    if (!modeMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModeMenu(false);
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest("[data-mode-trigger]")) return;
      if (modeMenuRef.current && !modeMenuRef.current.contains(target as Node)) setModeMenu(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [modeMenu]);

  // Monaco binds its command once at mount, so it would otherwise save
  // whatever `value` was at that moment. Keep the live one in a ref.
  const saveRef = useRef<() => void>(() => {});

  const handleSave = () => {
    onSave(value);
    setDirty(false);
  };

  saveRef.current = () => {
    if (dirty) handleSave();
  };

  /**
   * Ctrl/Cmd+S saves the file instead of opening the browser's "save page"
   * dialog. Bound on this pane rather than the document: every tab stays
   * mounted, so a document listener would fire in editors the user isn't
   * looking at. Keystrokes bubble from the focused editor, and an unfocused
   * pane can't receive them.
   */
  const handlePaneKeyDown = (e: React.KeyboardEvent) => {
    if (!isSaveShortcut(e)) return;
    e.preventDefault();
    e.stopPropagation();
    saveRef.current();
  };

  return (
    <div className="flex flex-col h-full" onKeyDown={handlePaneKeyDown}>
      <div className="bar-edge flex items-center gap-2 px-3 py-1.5 bg-surface border-b border-line shrink-0">
        <div className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 truncate text-sm text-ink-muted select-none" title={path}>
            {path}
          </span>
          <CopyPathButton path={path} />
        </div>
        <div className="min-w-2 flex-1" />
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Undo/redo: the keyboard has them, so a phone should too — the
              same reasoning as the save button beside Ctrl+S. */}
          {mode === "edit" && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => history("undo")}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
                className="relief rounded-control p-1 text-ink-muted hover:text-ink"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 14L4 9l5-5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 9h10a6 6 0 010 12h-3" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => history("redo")}
                disabled={!canRedo}
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
                className="relief rounded-control p-1 text-ink-muted hover:text-ink"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 14l5-5-5-5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 9H10a6 6 0 000 12h3" />
                </svg>
              </button>
            </div>
          )}

          {/* One dropdown instead of up to three side-by-side buttons: the bar
              also carries the path, and this is a pick-one choice. */}
          <div className="relative">
            <button
              type="button"
              data-mode-trigger=""
              onClick={() => setModeMenu((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={modeMenu}
              className={`relief flex items-center gap-1 rounded-control px-2 py-0.5 text-xs ${
                modeMenu ? "text-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              {MODE_LABELS[mode]}
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {modeMenu && (
              <div
                ref={modeMenuRef}
                role="menu"
                className="glass absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-panel py-1"
              >
                {MODES.filter((m) => m !== "preview" || canPreview).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMode(m);
                      setModeMenu(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors hover:bg-hover ${
                      mode === m ? "text-ink" : "text-ink-muted"
                    }`}
                  >
                    <span>
                      {MODE_LABELS[m]}
                      <span className="block text-[10px] text-ink-faint">{MODE_HINTS[m]}</span>
                    </span>
                    {mode === m && (
                      <svg
                        className="h-3.5 w-3.5 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Font size / Zoom controls */}
          {isHtml && mode === "preview" ? (
            <div className="flex items-center gap-1 border border-line rounded-control overflow-hidden">
              <button
                onClick={() => setHtmlZoom((z) => Math.max(25, z - 25))}
                className="px-2 py-0.5 text-xs text-ink-dim hover:text-ink hover:bg-control"
              >
                -
              </button>
              <button
                onClick={() => setHtmlZoom(100)}
                className="px-2 py-0.5 text-[10px] text-ink-dim hover:text-ink hover:bg-control tabular-nums"
              >
                {htmlZoom}%
              </button>
              <button
                onClick={() => setHtmlZoom((z) => Math.min(300, z + 25))}
                className="px-2 py-0.5 text-xs text-ink-dim hover:text-ink hover:bg-control"
              >
                +
              </button>
            </div>
          ) : (
            <span />
          )}
          <a
            href={`/api/files/download?path=${encodeURIComponent(path)}`}
            download
            className="relief p-1 text-ink-muted hover:text-ink rounded-control"
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
          {dirty && <span className="text-xs text-yellow-500">*</span>}
          <button
            onClick={handleSave}
            disabled={!dirty}
            className="p-1 relief-accent disabled:bg-control disabled:text-ink-faint text-white rounded-control transition-colors"
            title="Save"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 3v4h-4M7 17h10M7 13h10" />
            </svg>
          </button>
          <button onClick={onClose} className="relief p-1 text-ink-muted hover:text-ink rounded-control" title="Close">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      {/* Toolbar */}

      {/* Content */}
      <div className="flex-1 min-h-0">
        {mode === "preview" && canPreview ? (
          ext === "ipynb" ? (
            <NotebookPreview content={value} fontSize={editorFontSize} />
          ) : ext === "html" || ext === "htm" ? (
            <HtmlPreview content={value} zoom={htmlZoom} />
          ) : (
            <MarkdownPreview content={value} fontSize={editorFontSize} path={path} />
          )
        ) : mode === "plain" ? (
          // Native textarea: mobile gets real selection handles + OS "Select All",
          // which Monaco's custom-rendered editor does not support on touch.
          <textarea
            readOnly
            value={value}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="w-full h-full resize-none bg-app text-ink-muted font-mono p-3 outline-none border-0 selection:bg-blue-600/40"
            style={{ fontSize: `${editorFontSize}px`, lineHeight: 1.6 }}
          />
        ) : (
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full text-ink-faint text-sm">Loading editor...</div>
            }
          >
            <MonacoEditor
              height="100%"
              language={getLanguage(path)}
              value={value}
              onChange={handleChange}
              onMount={(editor, monaco) => {
                monacoRef.current = editor as unknown as MonacoHandle;
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
                refreshHistory();
              }}
              theme={monacoTheme}
              options={{
                minimap: { enabled: false },
                fontSize: editorFontSize,
                wordWrap: "on",
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                selectionHighlight: true,
                occurrencesHighlight: "singleFile",
                dragAndDrop: true,
              }}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
