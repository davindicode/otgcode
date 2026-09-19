/**
 * Shape and validation for the persisted workspace (open tabs + preferences).
 * Pure on purpose: the client imports the types and constants from here, while
 * `workspace.server.ts` adds the filesystem side.
 */

export type Theme = "dark" | "light";

/** Terminal and explorer tabs are user-created; viewer tabs come from opening
 *  a file in an explorer. */
export type TabKind = "terminal" | "explorer" | "viewer";

export interface WorkspaceTab {
  id: string;
  kind: TabKind;
  title: string;
  /** Explorer: the directory it was showing. Terminal: its working directory. */
  cwd: string;
  /** Viewer: the file it was showing. */
  path: string;
}

/** A command button the user added to the cmds group. */
export interface CustomCommand {
  label: string;
  command: string;
}

export interface Workspace {
  theme: Theme;
  /** Terminal font size in px. */
  fontSize: number;
  /** Code editor font size in px. */
  editorFontSize: number;
  tabs: WorkspaceTab[];
  activeId: string | null;
  /** Commands the user added to the cmds group. */
  customCommands: CustomCommand[];
  /** Labels of built-in commands the user removed from the cmds group. */
  hiddenCommands: string[];
}

export const MIN_FONT_SIZE = 6;
export const MAX_FONT_SIZE = 24;
export const DEFAULT_FONT_SIZE = 8;
export const DEFAULT_EDITOR_FONT_SIZE = 13;
const MAX_CUSTOM_COMMANDS = 40;

const MAX_TABS = 32;
const MAX_STRING = 4096;
const KINDS: TabKind[] = ["terminal", "explorer", "viewer"];

export function defaultWorkspace(): Workspace {
  return {
    theme: "dark",
    fontSize: DEFAULT_FONT_SIZE,
    editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
    tabs: [],
    activeId: null,
    customCommands: [],
    hiddenCommands: [],
  };
}

function str(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_STRING) : "";
}

function tabs(value: unknown): WorkspaceTab[] {
  if (!Array.isArray(value)) return [];
  const out: WorkspaceTab[] = [];
  const seen = new Set<string>();
  for (const raw of value.slice(0, MAX_TABS)) {
    if (!raw || typeof raw !== "object") continue;
    const tab = raw as Record<string, unknown>;
    const id = str(tab.id);
    const kind = KINDS.find((k) => k === tab.kind);
    if (!id || !kind || seen.has(id)) continue;
    // A viewer tab with no file can't be reopened, so it isn't worth keeping.
    const path = str(tab.path);
    if (kind === "viewer" && !path) continue;
    seen.add(id);
    out.push({ id, kind, title: str(tab.title), cwd: str(tab.cwd), path });
  }
  return out;
}

function commands(value: unknown): CustomCommand[] {
  if (!Array.isArray(value)) return [];
  const out: CustomCommand[] = [];
  const seen = new Set<string>();
  for (const raw of value.slice(0, MAX_CUSTOM_COMMANDS)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const label = str(entry.label).trim();
    const command = str(entry.command);
    if (!label || !command || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, command });
  }
  return out;
}

function labels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const raw of value.slice(0, MAX_CUSTOM_COMMANDS)) {
    const label = str(raw).trim();
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

/**
 * Coerce whatever is on disk (or came from the browser) into a valid
 * Workspace. Unknown keys are dropped and every value is clamped, so a stale
 * or hand-edited file can never break the app.
 */
export function sanitize(input: unknown, base: Workspace = defaultWorkspace()): Workspace {
  if (!input || typeof input !== "object") return base;
  const raw = input as Record<string, unknown>;

  // Only real numbers count: Number(null) is 0 and Number(true) is 1, which
  // would silently clamp junk to the minimum instead of keeping the old value.
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const clamp = (v: number) => Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(v)));
  const font = num(raw.fontSize);
  const editorFont = num(raw.editorFontSize);
  const nextTabs = raw.tabs === undefined ? base.tabs : tabs(raw.tabs);

  const activeId =
    raw.activeId === undefined
      ? base.activeId && nextTabs.some((t) => t.id === base.activeId)
        ? base.activeId
        : null
      : typeof raw.activeId === "string" && nextTabs.some((t) => t.id === raw.activeId)
        ? raw.activeId
        : null;

  return {
    theme: raw.theme === "light" || raw.theme === "dark" ? raw.theme : base.theme,
    fontSize: font === null ? base.fontSize : clamp(font),
    editorFontSize: editorFont === null ? base.editorFontSize : clamp(editorFont),
    tabs: nextTabs,
    activeId,
    customCommands: raw.customCommands === undefined ? base.customCommands : commands(raw.customCommands),
    hiddenCommands: raw.hiddenCommands === undefined ? base.hiddenCommands : labels(raw.hiddenCommands),
  };
}
