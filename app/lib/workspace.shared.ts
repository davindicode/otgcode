/**
 * Shape and validation for the persisted workspace (layout + open tabs).
 * Pure on purpose: the client imports the types and constants from here, while
 * `workspace.server.ts` adds the filesystem side.
 */
export type Theme = "dark" | "light";

export interface FileTab {
  id: string;
  name: string;
  cwd: string;
}

export interface TerminalTab {
  id: string;
  name: string;
  cwd: string;
}

export interface Workspace {
  theme: Theme;
  /** Explorer width as a percentage of the desktop split. */
  paneSplit: number;
  /** Terminal font size in px. */
  fontSize: number;
  files: { tabs: FileTab[]; activeId: string | null };
  terminals: { tabs: TerminalTab[]; activeId: string | null };
}

export const MIN_PANE_SPLIT = 15;
export const MAX_PANE_SPLIT = 72;
export const DEFAULT_PANE_SPLIT = 25;
export const MIN_FONT_SIZE = 6;
export const MAX_FONT_SIZE = 24;
export const DEFAULT_FONT_SIZE = 8;
const MAX_TABS = 24;
const MAX_STRING = 4096;

export function defaultWorkspace(): Workspace {
  return {
    theme: "dark",
    paneSplit: DEFAULT_PANE_SPLIT,
    fontSize: DEFAULT_FONT_SIZE,
    files: { tabs: [], activeId: null },
    terminals: { tabs: [], activeId: null },
  };
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.slice(0, MAX_STRING) : fallback;
}

function tabs(value: unknown): { id: string; name: string; cwd: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { id: string; name: string; cwd: string }[] = [];
  const seen = new Set<string>();
  for (const raw of value.slice(0, MAX_TABS)) {
    if (!raw || typeof raw !== "object") continue;
    const tab = raw as Record<string, unknown>;
    const id = str(tab.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: str(tab.name), cwd: str(tab.cwd) });
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
  const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
  const split = num(raw.paneSplit);
  const font = num(raw.fontSize);
  const filesIn = (raw.files ?? {}) as Record<string, unknown>;
  const terminalsIn = (raw.terminals ?? {}) as Record<string, unknown>;

  const fileTabs = raw.files === undefined ? base.files.tabs : tabs(filesIn.tabs);
  const terminalTabs = raw.terminals === undefined ? base.terminals.tabs : tabs(terminalsIn.tabs);

  const activeOf = (value: unknown, list: { id: string }[], fallback: string | null) => {
    if (value === undefined) return fallback && list.some((t) => t.id === fallback) ? fallback : null;
    const id = typeof value === "string" ? value : null;
    return id && list.some((t) => t.id === id) ? id : null;
  };

  return {
    theme: raw.theme === "light" || raw.theme === "dark" ? raw.theme : base.theme,
    paneSplit: split === null ? base.paneSplit : Math.min(MAX_PANE_SPLIT, Math.max(MIN_PANE_SPLIT, Math.round(split))),
    fontSize: font === null ? base.fontSize : Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(font))),
    files: {
      tabs: fileTabs,
      activeId: activeOf(filesIn.activeId, fileTabs, base.files.activeId),
    },
    terminals: {
      tabs: terminalTabs,
      activeId: activeOf(terminalsIn.activeId, terminalTabs, base.terminals.activeId),
    },
  };
}
