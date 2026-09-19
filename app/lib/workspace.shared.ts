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

export interface Workspace {
  theme: Theme;
  /** Terminal font size in px. */
  fontSize: number;
  tabs: WorkspaceTab[];
  activeId: string | null;
}

export const MIN_FONT_SIZE = 6;
export const MAX_FONT_SIZE = 24;
export const DEFAULT_FONT_SIZE = 8;

const MAX_TABS = 32;
const MAX_STRING = 4096;
const KINDS: TabKind[] = ["terminal", "explorer", "viewer"];

export function defaultWorkspace(): Workspace {
  return { theme: "dark", fontSize: DEFAULT_FONT_SIZE, tabs: [], activeId: null };
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
  const font = typeof raw.fontSize === "number" && Number.isFinite(raw.fontSize) ? raw.fontSize : null;
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
    fontSize: font === null ? base.fontSize : Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(font))),
    tabs: nextTabs,
    activeId,
  };
}
