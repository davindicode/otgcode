import { marked } from "marked";
import { lazy, Suspense, useMemo, useState } from "react";
import { copyText } from "~/lib/clipboard";
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

function MarkdownPreview({ content, fontSize }: { content: string; fontSize: number }) {
  const html = useMemo(() => {
    marked.setOptions({ breaks: true, gfm: true });
    return marked.parse(content) as string;
  }, [content]);

  return (
    <div
      className="prose prose-invert max-w-none p-4 overflow-auto h-full bg-[#0d0d1a]"
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
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">Could not parse notebook</div>
    );
  }

  return (
    <div className="overflow-auto h-full bg-[#0d0d1a] p-4 space-y-3" style={{ fontSize: `${fontSize}px` }}>
      {cells.map((cell, i) => (
        <div key={i} className="rounded border border-gray-700 overflow-hidden">
          {/* Cell header */}
          <div className="flex items-center gap-2 px-3 py-1 bg-[#16162a] text-xs text-gray-400">
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                cell.cell_type === "code" ? "bg-blue-900/50 text-blue-300" : "bg-green-900/50 text-green-300"
              }`}
            >
              {cell.cell_type}
            </span>
            <span>[{i + 1}]</span>
          </div>
          {/* Cell source */}
          <div className="bg-[#1a1a2e]">
            {cell.cell_type === "markdown" ? (
              <div
                className="prose prose-invert prose-sm max-w-none p-3"
                dangerouslySetInnerHTML={{
                  __html: marked.parse(joinSource(cell.source)) as string,
                }}
              />
            ) : (
              <pre className="p-3 text-sm text-gray-200 overflow-x-auto font-mono">{joinSource(cell.source)}</pre>
            )}
          </div>
          {/* Cell outputs */}
          {cell.outputs && cell.outputs.length > 0 && (
            <div className="border-t border-gray-700 bg-[#0d0d1a] p-3">
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
                      <pre className="text-sm text-gray-300 overflow-x-auto font-mono whitespace-pre-wrap">{text}</pre>
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

export default function CodeEditor({ path, content, onSave, onClose }: CodeEditorProps) {
  const ext = getExt(path);
  const canPreview = PREVIEWABLE.has(ext);
  const [value, setValue] = useState(content);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<"edit" | "plain" | "preview">(canPreview ? "preview" : "edit");
  const [editorFontSize, setEditorFontSize] = useState(6);
  const isHtml = ext === "html" || ext === "htm";
  const [htmlZoom, setHtmlZoom] = useState(100);
  const [copied, setCopied] = useState(false);

  const handleCopyAll = () => {
    copyText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleChange = (v: string | undefined) => {
    if (v !== undefined) {
      setValue(v);
      setDirty(v !== content);
    }
  };

  const handleSave = () => {
    onSave(value);
    setDirty(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#16162a] border-b border-gray-700 shrink-0">
        <span
          className="text-sm text-gray-300 whitespace-nowrap min-w-0 flex-1 overflow-hidden text-ellipsis select-none"
          title={path}
        >
          {path}
        </span>
        <CopyPathButton path={path} />
        <button
          onClick={handleCopyAll}
          className="p-1 text-gray-400 hover:text-white transition-colors shrink-0"
          title={copied ? "Copied!" : "Copy file contents"}
        >
          {copied ? (
            <svg
              className="w-3.5 h-3.5 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          )}
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center bg-[#0d0d1a] rounded overflow-hidden border border-gray-700">
            <button
              onClick={() => setMode("edit")}
              className={`px-2 py-0.5 text-xs transition-colors ${
                mode === "edit" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              Edit
            </button>
            <button
              onClick={() => setMode("plain")}
              title="Plain text — easier selection & copy on mobile"
              className={`px-2 py-0.5 text-xs transition-colors ${
                mode === "plain" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              Plain
            </button>
            {canPreview && (
              <button
                onClick={() => setMode("preview")}
                className={`px-2 py-0.5 text-xs transition-colors ${
                  mode === "preview" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                Preview
              </button>
            )}
          </div>
          {/* Font size / Zoom controls */}
          {isHtml && mode === "preview" ? (
            <div className="flex items-center gap-1 border border-gray-700 rounded overflow-hidden">
              <button
                onClick={() => setHtmlZoom((z) => Math.max(25, z - 25))}
                className="px-2 py-0.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700"
              >
                -
              </button>
              <button
                onClick={() => setHtmlZoom(100)}
                className="px-2 py-0.5 text-[10px] text-gray-400 hover:text-white hover:bg-gray-700 tabular-nums"
              >
                {htmlZoom}%
              </button>
              <button
                onClick={() => setHtmlZoom((z) => Math.min(300, z + 25))}
                className="px-2 py-0.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700"
              >
                +
              </button>
            </div>
          ) : (
            <div className="flex items-center border border-gray-700 rounded overflow-hidden">
              <button
                onClick={() => setEditorFontSize((s) => Math.max(6, s - 1))}
                className="px-1.5 py-0.5 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors leading-none"
              >
                <span className="text-[9px] font-bold">a</span>
              </button>
              <span className="text-[10px] text-gray-500 w-5 text-center tabular-nums">{editorFontSize}</span>
              <button
                onClick={() => setEditorFontSize((s) => Math.min(32, s + 1))}
                className="px-1.5 py-0.5 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors leading-none"
              >
                <span className="text-[14px] font-bold">A</span>
              </button>
            </div>
          )}
          <a
            href={`/api/files/download?path=${encodeURIComponent(path)}`}
            download
            className="p-1 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded transition-colors"
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
            className="p-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
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

      {/* Content */}
      <div className="flex-1 min-h-0">
        {mode === "preview" && canPreview ? (
          ext === "ipynb" ? (
            <NotebookPreview content={value} fontSize={editorFontSize} />
          ) : ext === "html" || ext === "htm" ? (
            <HtmlPreview content={value} zoom={htmlZoom} />
          ) : (
            <MarkdownPreview content={value} fontSize={editorFontSize} />
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
            className="w-full h-full resize-none bg-[#0d0d1a] text-gray-200 font-mono p-3 outline-none border-0 selection:bg-blue-600/40"
            style={{ fontSize: `${editorFontSize}px`, lineHeight: 1.6 }}
          />
        ) : (
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full text-gray-500 text-sm">Loading editor...</div>
            }
          >
            <MonacoEditor
              height="100%"
              language={getLanguage(path)}
              value={value}
              onChange={handleChange}
              theme="vs-dark"
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
