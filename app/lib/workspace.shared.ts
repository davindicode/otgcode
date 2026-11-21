/**
 * Shape and validation for the persisted workspace (open tabs + preferences).
 * Pure on purpose: the client imports the types and constants from here, while
 * `workspace.server.ts` adds the filesystem side.
 */

export type Theme = "dark" | "light";

/** Terminal and explorer tabs are user-created; viewer tabs come from opening
 *  a file in an explorer. */
export type TabKind = "terminal" | "explorer" | "viewer" | "tmux";

export interface WorkspaceTab {
  id: string;
  kind: TabKind;
  title: string;
  /** Explorer: the directory it was showing. Terminal: its working directory. */
  cwd: string;
  /** Viewer: the file it was showing. */
  path: string;
  /** Viewer: the explorer tab it was opened from, so grouping survives a reload. */
  openedFrom: string;
  /** tmux: the session this tab is attached to. */
  tmuxSession: string;
  /** tmux tabs: tmux's own id for the session, stable across renames. */
  tmuxSessionId: string;
  /** Which pane the tab sits in: 0 is the left pane, 1 the right. */
  pane: number;
}

/** A command button the user added to the cmds group. */
export interface CustomCommand {
  label: string;
  command: string;
}

/** A slash command the user added, scoped to one coding CLI. */
export interface SlashCommand extends CustomCommand {
  /** CLI_VENDORS name: claude, codex, opencode. */
  vendor: string;
}

export interface Workspace {
  theme: Theme;
  /** Terminal font size in px. */
  fontSize: number;
  /** Code editor font size in px. */
  editorFontSize: number;
  tabs: WorkspaceTab[];
  /**
   * The tab showing in each pane, by pane index, `null` where a pane has none.
   * One entry per pane rather than a single active tab, because in a split both
   * panes show something and only one of them has the cursor.
   */
  activeIds: (string | null)[];
  /** How many panes the user wants. A narrow screen still shows one. */
  panes: PaneCount;
  /** The left pane's share of the width, as a fraction. */
  split: number;
  /** Which pane has the user's attention: where a new tab opens. */
  focusedPane: number;
  /** Commands the user added to the cmds group. */
  customCommands: CustomCommand[];
  /** Labels of built-in commands the user removed from the cmds group. */
  hiddenCommands: string[];
  /** Slash commands the user added, per CLI. */
  customSlash: SlashCommand[];
  /** Built-in slash commands the user removed, as `vendor:label`. */
  hiddenSlash: string[];
}

/** Also enforced server-side in auth.ts. */
export const MIN_PASSWORD_LENGTH = 6;

/** One pane, or two side by side. Three was not worth two dividers. */
export type PaneCount = 1 | 2;

/**
 * Narrower than this and a split is two cramped columns rather than two
 * usable ones; taller than wide and it is worse still, which is every phone
 * and a tablet held upright. The preference is kept either way — it applies
 * again as soon as there is room.
 */
export const SPLIT_MIN_WIDTH_PX = 900;
export const SPLIT_MEDIA_QUERY = `(min-width: ${SPLIT_MIN_WIDTH_PX}px) and (min-aspect-ratio: 1/1)`;

/** A pane narrower than this is not worth keeping open. */
export const MIN_PANE_PX = 320;
export const MIN_SPLIT = 0.2;
export const MAX_SPLIT = 0.8;
export const DEFAULT_SPLIT = 0.5;

export const MIN_FONT_SIZE = 6;
export const MAX_FONT_SIZE = 24;
export const DEFAULT_FONT_SIZE = 8;
export const DEFAULT_EDITOR_FONT_SIZE = 13;
const MAX_CUSTOM_COMMANDS = 40;

const MAX_TABS = 32;
const MAX_STRING = 4096;
const KINDS: TabKind[] = ["terminal", "explorer", "viewer", "tmux"];

export function defaultWorkspace(): Workspace {
  return {
    theme: "dark",
    fontSize: DEFAULT_FONT_SIZE,
    editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
    tabs: [],
    activeIds: [null, null],
    panes: 1,
    split: DEFAULT_SPLIT,
    focusedPane: 0,
    customCommands: [],
    hiddenCommands: [],
    customSlash: [],
    hiddenSlash: [],
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
    // A tab that can't be reopened isn't worth keeping: a viewer needs its
    // file, a tmux tab needs its session name.
    const path = str(tab.path);
    const tmuxSession = str(tab.tmuxSession);
    if (kind === "viewer" && !path) continue;
    if (kind === "tmux" && !tmuxSession) continue;
    seen.add(id);
    out.push({
      id,
      kind,
      title: str(tab.title),
      cwd: str(tab.cwd),
      path,
      openedFrom: str(tab.openedFrom),
      tmuxSession,
      // Empty until the tab has attached and tmux has told us its id, which
      // is also true of a tab that has never been opened yet. Reconnecting by
      // name is the behaviour in that window.
      tmuxSessionId: str(tab.tmuxSessionId),
      // Anything that is not the right pane is the left one. A tab in a pane
      // that does not exist would be a tab with nowhere to be drawn.
      pane: tab.pane === 1 ? 1 : 0,
    });
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

/** Same shape as `commands`, plus the CLI it belongs to. */
function slashCommands(value: unknown): SlashCommand[] {
  if (!Array.isArray(value)) return [];
  const out: SlashCommand[] = [];
  const seen = new Set<string>();
  for (const raw of value.slice(0, MAX_CUSTOM_COMMANDS)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const vendor = str(entry.vendor).trim();
    const label = str(entry.label).trim();
    const command = str(entry.command);
    const key = `${vendor}:${label}`;
    if (!vendor || !label || !command || seen.has(key)) continue;
    seen.add(key);
    out.push({ vendor, label, command });
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

  /**
   * A pane's active tab has to be a tab that exists and is in that pane —
   * otherwise a pane would be told to show something that is not there, or is
   * somewhere else, and would draw nothing at all.
   */
  const paneActive = (value: unknown, pane: number): string | null =>
    typeof value === "string" && nextTabs.some((t) => t.id === value && t.pane === pane) ? value : null;

  const rawActive = Array.isArray(raw.activeIds) ? raw.activeIds : null;
  const activeIds =
    raw.activeIds === undefined
      ? [paneActive(base.activeIds[0], 0), paneActive(base.activeIds[1], 1)]
      : [paneActive(rawActive?.[0], 0), paneActive(rawActive?.[1], 1)];

  const panes: PaneCount = raw.panes === 2 ? 2 : raw.panes === 1 ? 1 : base.panes;
  const rawSplit = num(raw.split);
  const split =
    rawSplit === null ? base.split : Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, Math.round(rawSplit * 1000) / 1000));
  const focusedPane = raw.focusedPane === 1 ? 1 : raw.focusedPane === 0 ? 0 : base.focusedPane;

  return {
    theme: raw.theme === "light" || raw.theme === "dark" ? raw.theme : base.theme,
    fontSize: font === null ? base.fontSize : clamp(font),
    editorFontSize: editorFont === null ? base.editorFontSize : clamp(editorFont),
    tabs: nextTabs,
    activeIds,
    panes,
    split,
    focusedPane,
    customCommands: raw.customCommands === undefined ? base.customCommands : commands(raw.customCommands),
    hiddenCommands: raw.hiddenCommands === undefined ? base.hiddenCommands : labels(raw.hiddenCommands),
    customSlash: raw.customSlash === undefined ? base.customSlash : slashCommands(raw.customSlash),
    hiddenSlash: raw.hiddenSlash === undefined ? base.hiddenSlash : labels(raw.hiddenSlash),
  };
}
