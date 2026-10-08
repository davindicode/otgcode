import { create } from "zustand";
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

export interface Tab {
  id: string;
  kind: TabKind;
  title: string;
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
  activeId: string | null;

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
  /** Drag-to-reorder: `toIndex` indexes the strip with this tab taken out. */
  move: (id: string, toIndex: number) => void;
  setActive: (id: string) => void;
  /**
   * Renaming a tmux tab renames its session, so it is async and can fail — the
   * title only changes once tmux has agreed to it.
   */
  rename: (id: string, title: string) => Promise<void>;
  /** Replace the whole strip — used when restoring a saved workspace. */
  restore: (tabs: WorkspaceTab[], activeId: string | null) => void;
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

function nextTitle(tabs: Tab[], kind: TabKind, label: string): string {
  const used = tabs.filter((t) => t.kind === kind).length;
  return `${label} ${used + 1}`;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeId: null,

  openTerminal: ({ id, title, cwd } = {}) => {
    const tabId = id ?? nextId("terminal");
    const name = title || nextTitle(get().tabs, "terminal", "Terminal");
    useTerminalStore.getState().createSession(tabId, name, cwd || undefined);
    set((s) => ({ tabs: [...s.tabs, { id: tabId, kind: "terminal", title: name }], activeId: tabId }));
    return tabId;
  },

  openExplorer: ({ id, title, cwd } = {}) => {
    const tabId = id ?? nextId("explorer");
    const name = title || nextTitle(get().tabs, "explorer", "Explorer");
    useFileStore.getState().createSession(tabId, name, cwd);
    set((s) => ({ tabs: [...s.tabs, { id: tabId, kind: "explorer", title: name }], activeId: tabId }));
    return tabId;
  },

  openTmux: (session, { id, tmuxSessionId } = {}) => {
    const existing = get().tabs.find((t) => t.kind === "tmux" && t.tmuxSession === session);
    if (existing) {
      set({ activeId: existing.id });
      syncContentFocus(existing.id, get().tabs);
      return existing.id;
    }
    const tabId = id ?? nextId("tmux");
    useTerminalStore.getState().createSession(tabId, session, undefined, session, tmuxSessionId);
    set((s) => ({
      tabs: [...s.tabs, { id: tabId, kind: "tmux", title: session, tmuxSession: session, tmuxSessionId }],
      activeId: tabId,
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
    // Reopening a file that's already in a tab just focuses it, rather than
    // stacking duplicates of the same document.
    const existing = get().tabs.find((t) => t.kind === "viewer" && t.path === path);
    if (existing) {
      set({ activeId: existing.id });
      return existing.id;
    }
    const tabId = nextId("viewer");
    const tab: Tab = { id: tabId, kind: "viewer", title: basename(path), path, openedFrom: fromTabId };
    set((s) => {
      const at = insertIndexFor(s.tabs, fromTabId);
      return { tabs: [...s.tabs.slice(0, at), tab, ...s.tabs.slice(at)], activeId: tabId };
    });
    return tabId;
  },

  close: (id) => {
    const { tabs, activeId } = get();
    const index = tabs.findIndex((t) => t.id === id);
    if (index === -1) return;
    const tab = tabs[index];

    if (tab.kind === "terminal" || tab.kind === "tmux") useTerminalStore.getState().closeSession(id);
    if (tab.kind === "explorer") useFileStore.getState().closeSession(id);

    const remaining = tabs.filter((t) => t.id !== id);
    // Closing a file returns you to the explorer you opened it from; failing
    // that, the neighbour, rather than dumping you on an unrelated tab.
    const origin = tab.openedFrom && remaining.some((t) => t.id === tab.openedFrom) ? tab.openedFrom : null;
    const nextActive =
      activeId === id ? (origin ?? remaining[index]?.id ?? remaining[index - 1]?.id ?? null) : activeId;

    set({ tabs: remaining, activeId: nextActive });
    if (nextActive && nextActive !== activeId) syncContentFocus(nextActive, remaining);
  },

  move: (id, toIndex) => {
    const tabs = reorder(
      get().tabs,
      get().tabs.findIndex((t) => t.id === id),
      toIndex,
    );
    if (tabs !== get().tabs) set({ tabs });
  },

  setActive: (id) => {
    set({ activeId: id });
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

  restore: (saved, activeId) => {
    const tabs: Tab[] = [];
    for (const tab of saved) {
      if (tab.kind === "terminal") {
        useTerminalStore.getState().createSession(tab.id, tab.title, tab.cwd || undefined);
        tabs.push({ id: tab.id, kind: "terminal", title: tab.title });
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
        });
      } else if (tab.kind === "explorer") {
        useFileStore.getState().createSession(tab.id, tab.title, tab.cwd);
        tabs.push({ id: tab.id, kind: "explorer", title: tab.title });
      } else if (tab.kind === "viewer" && tab.path) {
        tabs.push({
          id: tab.id,
          kind: "viewer",
          title: tab.title || basename(tab.path),
          path: tab.path,
          openedFrom: tab.openedFrom || undefined,
        });
      }
    }
    const active = activeId && tabs.some((t) => t.id === activeId) ? activeId : (tabs[0]?.id ?? null);
    set({ tabs, activeId: active });
    if (active) syncContentFocus(active, tabs);
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
  }));
}

/**
 * Renames the tmux session itself, returning the name it now has — which tmux
 * may have adjusted — or null when it refused, having shown why.
 */
async function renameTmuxSession(from: string, to: string): Promise<string | null> {
  try {
    const res = await fetch("/api/tmux/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "rename", name: from, to }),
    });
    const data = (await res.json()) as { name?: string; error?: string };
    if (data.error || !data.name) {
      showToast(data.error || "Could not rename the session");
      return null;
    }
    return data.name;
  } catch {
    showToast("Could not reach the server");
    return null;
  }
}
