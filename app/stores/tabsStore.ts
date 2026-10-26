import { create } from "zustand";
import { apiPost } from "~/lib/api";
import { errorMessage } from "~/lib/errors";
import { basename } from "~/lib/paths";
import type { WorkspaceTab } from "~/lib/workspace.shared";
import { useFileStore } from "./fileStore";
import { useTerminalStore } from "./terminalStore";
import { showToast } from "./toastStore";

/**
 * The single tab strip for the whole app.
 *
 * Terminal and explorer tabs are created by the user from the + button.
 * Viewer tabs can't be: they only come from opening a file in an explorer,
 * which keeps the explorer an explorer instead of turning into an editor.
 *
 * This store owns tab identity and ordering; the per-tab content still lives
 * in terminalStore / fileStore, keyed by the same id.
 */
export type TabKind = "terminal" | "explorer" | "viewer" | "tmux";

/** 0 is the left pane, 1 the right. There are only ever the two. */
export type PaneIndex = 0 | 1;

export interface Tab {
  id: string;
  kind: TabKind;
  title: string;
  /**
   * Which pane draws this tab. Every tab has one even when only one pane is
   * showing: the assignment is what a narrow screen hides rather than
   * discards, so widening the window puts everything back where it was.
   */
  pane: PaneIndex;
  /** Viewer tabs only: absolute path of the file being shown. */
  path?: string;
  /** Viewer tabs only: the explorer tab this file was opened from. */
  openedFrom?: string;
  /** tmux tabs only: the session this tab is attached to. */
  tmuxSession?: string;
  /**
   * tmux tabs only: tmux's own id for that session, learned once it is
   * running. A rename does not change it, so it is how a tab finds its session
   * again after being renamed while disconnected.
   */
  tmuxSessionId?: string;
}

interface TabsState {
  tabs: Tab[];
  /**
   * The tab showing in each pane. Two entries rather than one active tab,
   * because in a split both panes show something at once — and the pane
   * without the cursor is still drawing its tab, which is the whole point.
   */
  activeIds: [string | null, string | null];
  /** Where a new tab opens, and the only pane a narrow screen shows. */
  focusedPane: PaneIndex;
  /**
   * Where the tab being dragged would land: which pane's strip, the tab the
   * caret sits in front of (null for the end of that strip), and the index in
   * this array that amounts to.
   *
   * Nothing is applied while the drag is going on. It used to be — the strip
   * reordered itself on every pointermove and the tab was redrawn in whichever
   * strip the pointer was over — and that made the gesture measure a layout it
   * was itself changing: a tab leaving a strip shortened the content that
   * strip scrolls, the browser clamped a scroll offset that content could no
   * longer reach, and the next pointermove read the tabs off their new
   * positions. The row of keyboard buttons in the composer has never had any
   * of this trouble because it only ever scrolls. So now this is the whole
   * preview, the strips are still underneath it, and the single move happens
   * when the drag is let go.
   *
   * Transient, and in the store rather than the strip because both strips have
   * to see it: the one the tab came from shades it, the one it is over draws
   * the caret.
   */
  drag: { id: string; pane: PaneIndex; before: string | null; index: number } | null;
  /**
   * Viewer tabs with edits not yet on disk, by tab id.
   *
   * The editor owns the edits; the strip owns the X that would throw them
   * away. This is the one fact that has to travel between them, so closing a
   * file can ask when there is something to lose and close silently when
   * there is not.
   */
  unsaved: Record<string, boolean>;

  openTerminal: (opts?: { id?: string; title?: string; cwd?: string }) => string;
  openExplorer: (opts?: { id?: string; title?: string; cwd?: string }) => string;
  /** Attach a tab to a tmux session, or focus the tab already on it. */
  openTmux: (session: string, opts?: { id?: string; tmuxSessionId?: string }) => string;
  /** Close every tab attached to a session that no longer exists. */
  closeTmuxTabs: (session: string) => void;
  /**
   * Re-read what tmux says about one tmux tab, correcting its name if the
   * session was renamed from inside tmux, and reporting the window its client
   * is on. Null when tmux could not be asked.
   */
  syncTmuxTab: (id: string) => Promise<{ name: string; window: string | null } | null>;
  /** The same for every tmux tab, for when the picker is about to list them. */
  syncTmuxNames: () => Promise<void>;
  /** Opens the file, or focuses its tab if it is already open. */
  openViewer: (path: string, fromTabId?: string) => string;
  close: (id: string) => void;
  setUnsaved: (id: string, unsaved: boolean) => void;
  /** Drag-to-reorder: `toIndex` indexes the strip with this tab taken out. */
  move: (id: string, toIndex: number) => void;
  /** Hand a tab to the other pane, keeping it the one that pane shows. */
  moveToPane: (id: string, pane: PaneIndex, toIndex?: number) => void;
  /** Preview a drag, or clear it with null. */
  setDrag: (drag: TabsState["drag"]) => void;
  /** Point the cursor at a pane without changing which tab it shows. */
  focusPane: (pane: PaneIndex) => void;
  /**
   * Remeasure the terminals on screen, for when a pane changed width under
   * them — the divider moved, the split was turned on or off, or the window
   * crossed the width where two panes stop fitting. A terminal sizes itself in
   * whole rows and columns, so it cannot follow a CSS width on its own.
   */
  refitVisible: () => void;
  /**
   * Bring every tab into the left pane, for leaving the split: a tab in a
   * pane that is not drawn would be a tab the user cannot reach.
   */
  mergePanes: () => void;
  setActive: (id: string) => void;
  /**
   * Renaming a tmux tab renames its session, so it is async and can fail — the
   * title only changes once tmux has agreed to it.
   */
  rename: (id: string, title: string) => Promise<void>;
  /** Replace the whole strip — used when restoring a saved workspace. */
  restore: (tabs: WorkspaceTab[], activeIds: (string | null)[], focusedPane?: number) => void;
}

let counter = 0;
const nextId = (kind: TabKind) => `${kind}-${Date.now()}-${++counter}`;

/**
 * Where a newly opened file belongs: directly after the explorer it came from,
 * and after any files already opened from that same explorer — so a file sits
 * beside its explorer and siblings stay in the order they were opened. Falls
 * back to the end of the strip when the origin is unknown or already closed.
 */
export function insertIndexFor(tabs: Tab[], fromTabId?: string): number {
  if (!fromTabId) return tabs.length;
  const origin = tabs.findIndex((t) => t.id === fromTabId);
  if (origin === -1) return tabs.length;
  let at = origin + 1;
  while (at < tabs.length && tabs[at].kind === "viewer" && tabs[at].openedFrom === fromTabId) at++;
  return at;
}

/**
 * Moves `from` to `to`, where `to` indexes the list *after* the item is taken
 * out — the same convention as splice, and what a drop position means: "third
 * of the ones that are left".
 */
export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return items;
  const rest = items.slice();
  const [item] = rest.splice(from, 1);
  const at = Math.max(0, Math.min(rest.length, to));
  if (at === from) return items;
  rest.splice(at, 0, item);
  return rest;
}

/**
 * `label N` with the lowest N no tab is using.
 *
 * Counting the tabs of a kind was wrong in both directions. Close Explorer 1
 * while Explorer 2 is open and the count says 1, so the next tab is a second
 * Explorer 2; rename a tab to Explorer 3 and the count cannot see it at all.
 * Reading the names is the only thing that survives renaming and closing,
 * which is the whole reason this function exists.
 *
 * Every tab is checked, not just this kind: the user reads one strip of tabs,
 * and two tabs reading `Explorer 2` are confusing whatever is behind them.
 */
/**
 * Whether this tab is the one its pane is drawing.
 *
 * Not the same as having the cursor: in a split, both panes draw a tab and
 * only one of them is focused. Everything that asks "am I on screen" — a
 * viewer deciding to watch its file, a composer drawer deciding to re-read a
 * directory — wants this rather than the focused tab.
 */
export function isTabVisible(state: Pick<TabsState, "tabs" | "activeIds">, id: string): boolean {
  const tab = state.tabs.find((t) => t.id === id);
  return !!tab && state.activeIds[tab.pane] === id;
}

/** The tab the user is typing into: the focused pane's. */
export function focusedTabId(state: Pick<TabsState, "activeIds" | "focusedPane">): string | null {
  return state.activeIds[state.focusedPane];
}

/**
 * The tab a pane should fall back to once `closing` is gone: its neighbour in
 * the same pane, looking right first and then left. Null when the pane is now
 * empty, which is a pane with nothing to draw rather than an error.
 */
export function neighbourInPane(tabs: Tab[], closing: Tab): string | null {
  const siblings = tabs.filter((t) => t.pane === closing.pane);
  const at = siblings.findIndex((t) => t.id === closing.id);
  if (at === -1) return null;
  const left = siblings.slice(0, at);
  const right = siblings.slice(at + 1);
  return right[0]?.id ?? left[left.length - 1]?.id ?? null;
}

export function nextTitle(tabs: Tab[], label: string): string {
  const taken = new Set(tabs.map((t) => t.title));
  let n = 1;
  while (taken.has(`${label} ${n}`)) n++;
  return `${label} ${n}`;
}

/** A new tab opens in the pane the user is working in. */
function showInPane(
  state: Pick<TabsState, "activeIds">,
  pane: PaneIndex,
  id: string | null,
): [string | null, string | null] {
  const next: [string | null, string | null] = [state.activeIds[0], state.activeIds[1]];
  next[pane] = id;
  return next;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeIds: [null, null],
  focusedPane: 0,
  drag: null,
  unsaved: {},

  openTerminal: ({ id, title, cwd } = {}) => {
    const tabId = id ?? nextId("terminal");
    const name = title || nextTitle(get().tabs, "Terminal");
    useTerminalStore.getState().createSession(tabId, name, cwd || undefined);
    set((s) => ({
      tabs: [...s.tabs, { id: tabId, kind: "terminal", title: name, pane: s.focusedPane }],
      activeIds: showInPane(s, s.focusedPane, tabId),
    }));
    return tabId;
  },

  openExplorer: ({ id, title, cwd } = {}) => {
    const tabId = id ?? nextId("explorer");
    const name = title || nextTitle(get().tabs, "Explorer");
    useFileStore.getState().createSession(tabId, name, cwd);
    set((s) => ({
      tabs: [...s.tabs, { id: tabId, kind: "explorer", title: name, pane: s.focusedPane }],
      activeIds: showInPane(s, s.focusedPane, tabId),
    }));
    return tabId;
  },

  openTmux: (session, { id, tmuxSessionId } = {}) => {
    const existing = get().tabs.find((t) => t.kind === "tmux" && t.tmuxSession === session);
    if (existing) {
      // Already open: show it in whichever pane it is already in, and go there.
      set((s) => ({ activeIds: showInPane(s, existing.pane, existing.id), focusedPane: existing.pane }));
      syncContentFocus(existing.id, get().tabs);
      return existing.id;
    }
    const tabId = id ?? nextId("tmux");
    useTerminalStore.getState().createSession(tabId, session, undefined, session, tmuxSessionId);
    set((s) => ({
      tabs: [
        ...s.tabs,
        { id: tabId, kind: "tmux", title: session, tmuxSession: session, tmuxSessionId, pane: s.focusedPane },
      ],
      activeIds: showInPane(s, s.focusedPane, tabId),
    }));
    return tabId;
  },

  syncTmuxTab: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (tab?.kind !== "tmux" || !tab.tmuxSession) return null;

    // The server resolves this from the tab's own tmux client, so it is what
    // tmux has now — not what the tab was opened with.
    let place: { tmuxSession?: string | null; tmuxSessionId?: string | null; tmuxWindow?: string | null };
    try {
      const res = await fetch(`/api/terminal/cwd?sessionId=${encodeURIComponent(id)}`);
      place = await res.json();
    } catch {
      return null;
    }
    const name = place.tmuxSession;
    // No name means tmux could not be asked — a dropped connection, or the
    // client is gone. Leave the tab alone rather than guessing.
    if (!name) return null;

    const tmuxSessionId = place.tmuxSessionId ?? tab.tmuxSessionId;
    if (name !== tab.tmuxSession || tmuxSessionId !== tab.tmuxSessionId) {
      set((st) => ({
        tabs: st.tabs.map((t) => (t.id === id ? { ...t, title: name, tmuxSession: name, tmuxSessionId } : t)),
      }));
      useTerminalStore.getState().renameSession(id, name, name, tmuxSessionId);
    }
    return { name, window: place.tmuxWindow ?? null };
  },

  syncTmuxNames: async () => {
    const ids = get()
      .tabs.filter((t) => t.kind === "tmux" && t.tmuxSession)
      .map((t) => t.id);
    await Promise.all(ids.map((id) => get().syncTmuxTab(id)));
  },

  closeTmuxTabs: (session) => {
    for (const tab of get().tabs.filter((t) => t.kind === "tmux" && t.tmuxSession === session)) {
      get().close(tab.id);
    }
  },

  openViewer: (path, fromTabId) => {
    // Beside the explorer it came from, in that explorer's pane — opening a
    // file from the left pane should not throw it to the right one.
    const origin = get().tabs.find((t) => t.id === fromTabId);
    const pane = origin?.pane ?? get().focusedPane;

    // Reopening a file that's already in a tab just focuses it, rather than
    // stacking duplicates of the same document. One file is one tab across
    // both panes, not one per pane: two editors over one file would be two
    // unsaved buffers racing each other to write it.
    const existing = get().tabs.find((t) => t.kind === "viewer" && t.path === path);
    if (existing) {
      // It comes to the pane that asked for it. Focusing it where it already
      // sits meant opening a file from the right pane's explorer jumped you to
      // the left pane — the file arrived, somewhere you were not looking.
      if (existing.pane !== pane) get().moveToPane(existing.id, pane);
      else set((s) => ({ activeIds: showInPane(s, pane, existing.id), focusedPane: pane }));
      return existing.id;
    }
    const tabId = nextId("viewer");
    const tab: Tab = { id: tabId, kind: "viewer", title: basename(path), path, openedFrom: fromTabId, pane };
    set((s) => {
      const at = insertIndexFor(s.tabs, fromTabId);
      return {
        tabs: [...s.tabs.slice(0, at), tab, ...s.tabs.slice(at)],
        activeIds: showInPane(s, pane, tabId),
        focusedPane: pane,
      };
    });
    return tabId;
  },

  setUnsaved: (id, unsaved) => {
    if (!!get().unsaved[id] === unsaved) return;
    const next = { ...get().unsaved };
    if (unsaved) next[id] = true;
    else delete next[id];
    set({ unsaved: next });
  },

  close: (id) => {
    const { tabs, activeIds } = get();
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;

    if (tab.kind === "terminal" || tab.kind === "tmux") useTerminalStore.getState().closeSession(id);
    if (tab.kind === "explorer") useFileStore.getState().closeSession(id);

    get().setUnsaved(id, false);

    const remaining = tabs.filter((t) => t.id !== id);
    // Closing a file returns you to the explorer you opened it from; failing
    // that, the neighbour in the same pane, rather than dumping you on an
    // unrelated tab or on one the other pane is already showing.
    const origin =
      tab.openedFrom && remaining.some((t) => t.id === tab.openedFrom && t.pane === tab.pane) ? tab.openedFrom : null;
    const was = activeIds[tab.pane];
    const nextActive = was === id ? (origin ?? neighbourInPane(tabs, tab)) : was;

    set({ tabs: remaining, activeIds: showInPane({ activeIds }, tab.pane, nextActive) });
    if (nextActive && nextActive !== was) syncContentFocus(nextActive, remaining);
  },

  move: (id, toIndex) => {
    const tabs = reorder(
      get().tabs,
      get().tabs.findIndex((t) => t.id === id),
      toIndex,
    );
    if (tabs !== get().tabs) set({ tabs });
  },

  moveToPane: (id, pane, toIndex) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab || tab.pane === pane) return;
    const from = tab.pane;
    // Reassigning the pane is a style change on a wrapper that stays put in
    // the tree, so the tab's terminal or editor is never torn down and rebuilt
    // — it just gets drawn in the other column.
    let tabs = get().tabs.map((t) => (t.id === id ? { ...t, pane } : t));
    if (toIndex !== undefined) {
      tabs = reorder(
        tabs,
        tabs.findIndex((t) => t.id === id),
        toIndex,
      );
    }
    const vacated = get().activeIds[from] === id ? neighbourInPane(get().tabs, tab) : get().activeIds[from];
    const activeIds: [string | null, string | null] = [get().activeIds[0], get().activeIds[1]];
    activeIds[from] = vacated;
    // It arrives as the tab that pane is showing: a tab moved somewhere you
    // cannot see it has gone missing as far as the user is concerned.
    activeIds[pane] = id;
    set({ tabs, activeIds, focusedPane: pane });
    // It is a different width in its new pane, which only a terminal minds.
    syncContentFocus(id, tabs);
    if (vacated) syncContentFocus(vacated, tabs);
  },

  setDrag: (drag) => set({ drag }),

  focusPane: (pane) => {
    if (get().focusedPane === pane) return;
    set({ focusedPane: pane });
    const id = get().activeIds[pane];
    if (id) syncContentFocus(id, get().tabs);
  },

  refitVisible: () => {
    const { activeIds, tabs } = get();
    for (const id of activeIds) if (id) syncContentFocus(id, tabs);
  },

  mergePanes: () => {
    const { tabs, activeIds, focusedPane } = get();
    if (tabs.every((t) => t.pane === 0)) {
      set({ focusedPane: 0 });
      return;
    }
    // Left pane's tabs first, then the right pane's, so the strip reads in the
    // order the two panes were laid out.
    const merged = [...tabs.filter((t) => t.pane === 0), ...tabs.filter((t) => t.pane === 1)].map((t) => ({
      ...t,
      pane: 0 as PaneIndex,
    }));
    // Whichever pane had the cursor keeps its tab, so leaving the split does
    // not move you off what you were working on.
    const keep = activeIds[focusedPane] ?? activeIds[0] ?? activeIds[1] ?? merged[0]?.id ?? null;
    set({ tabs: merged, activeIds: [keep, null], focusedPane: 0 });
    if (keep) syncContentFocus(keep, merged);
  },

  setActive: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    set((s) => ({ activeIds: showInPane(s, tab.pane, id), focusedPane: tab.pane }));
    syncContentFocus(id, get().tabs);
  },

  rename: async (id, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;

    // A tmux tab's title *is* its session's name, so the two can't drift: the
    // picker lists sessions from tmux, and a reconnect re-attaches by name.
    // tmux also adjusts names it won't take verbatim, so the name it reports
    // back is the one to show — not the one that was typed.
    if (tab.kind === "tmux" && tab.tmuxSession) {
      const renamed = await renameTmuxSession(tab.tmuxSession, trimmed);
      if (!renamed) return;
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, title: renamed, tmuxSession: renamed } : t)),
      }));
      useTerminalStore.getState().renameSession(id, renamed, renamed);
      return;
    }

    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title: trimmed } : t)) }));
    if (tab.kind === "terminal") useTerminalStore.getState().renameSession(id, trimmed);
    if (tab.kind === "explorer") useFileStore.getState().updateSession(id, { name: trimmed });
  },

  restore: (saved, activeIds, focusedPane = 0) => {
    const tabs: Tab[] = [];
    for (const tab of saved) {
      const pane: PaneIndex = tab.pane === 1 ? 1 : 0;
      if (tab.kind === "terminal") {
        useTerminalStore.getState().createSession(tab.id, tab.title, tab.cwd || undefined);
        tabs.push({ id: tab.id, kind: "terminal", title: tab.title, pane });
      } else if (tab.kind === "tmux" && tab.tmuxSession) {
        useTerminalStore
          .getState()
          .createSession(tab.id, tab.title, undefined, tab.tmuxSession, tab.tmuxSessionId || undefined);
        tabs.push({
          id: tab.id,
          kind: "tmux",
          title: tab.title,
          tmuxSession: tab.tmuxSession,
          tmuxSessionId: tab.tmuxSessionId || undefined,
          pane,
        });
      } else if (tab.kind === "explorer") {
        useFileStore.getState().createSession(tab.id, tab.title, tab.cwd);
        tabs.push({ id: tab.id, kind: "explorer", title: tab.title, pane });
      } else if (tab.kind === "viewer" && tab.path) {
        tabs.push({
          id: tab.id,
          kind: "viewer",
          title: tab.title || basename(tab.path),
          path: tab.path,
          openedFrom: tab.openedFrom || undefined,
          pane,
        });
      }
    }
    // A pane with tabs but no remembered active one shows its first, rather
    // than an empty column beside a full strip.
    const forPane = (pane: PaneIndex): string | null => {
      const saved = activeIds[pane];
      if (saved && tabs.some((t) => t.id === saved && t.pane === pane)) return saved;
      return tabs.find((t) => t.pane === pane)?.id ?? null;
    };
    const active: [string | null, string | null] = [forPane(0), forPane(1)];
    const focused: PaneIndex = active[focusedPane === 1 ? 1 : 0] ? (focusedPane === 1 ? 1 : 0) : 0;
    set({ tabs, activeIds: active, focusedPane: focused });
    for (const id of active) if (id) syncContentFocus(id, tabs);
  },
}));

/**
 * The content stores keep their own "active session" for the panes that read
 * it (the terminal focuses its xterm, the explorer its list). Keep them in
 * step with the tab strip.
 */
function syncContentFocus(id: string, tabs: Tab[]): void {
  const tab = tabs.find((t) => t.id === id);
  // Only a terminal needs anything on becoming visible: it measures itself
  // against the layout, and could not while it was hidden. An explorer is
  // ordinary DOM and simply appears.
  if (tab?.kind === "terminal" || tab?.kind === "tmux") useTerminalStore.getState().refitSession(id);
}

/** Shape for persistence — mirrors what the workspace file stores. */
export function toWorkspaceTabs(tabs: Tab[]): WorkspaceTab[] {
  const files = useFileStore.getState().sessions;
  const terminals = useTerminalStore.getState().sessions;
  return tabs.map((tab) => ({
    id: tab.id,
    kind: tab.kind,
    title: tab.title,
    openedFrom: tab.openedFrom ?? "",
    tmuxSession: tab.tmuxSession ?? "",
    tmuxSessionId: tab.tmuxSessionId ?? "",
    cwd:
      tab.kind === "explorer"
        ? (files[tab.id]?.cwd ?? "")
        : tab.kind === "terminal"
          ? (terminals[tab.id]?.cdCwd ?? "")
          : "",
    path: tab.path ?? "",
    pane: tab.pane,
  }));
}

/**
 * Renames the tmux session itself, returning the name it now has — which tmux
 * may have adjusted — or null when it refused, having shown why.
 */
async function renameTmuxSession(from: string, to: string): Promise<string | null> {
  try {
    const { name } = await apiPost<{ name?: string }>("/api/tmux/sessions", { op: "rename", name: from, to });
    if (!name) throw new Error("Could not rename the session");
    return name;
  } catch (err: unknown) {
    showToast(errorMessage(err, "Could not rename the session"));
    return null;
  }
}
