import { create } from "zustand";
import { basename } from "~/lib/paths";
import type { WorkspaceTab } from "~/lib/workspace.shared";
import { useFileStore } from "./fileStore";
import { useTerminalStore } from "./terminalStore";

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
export type TabKind = "terminal" | "explorer" | "viewer";

export interface Tab {
  id: string;
  kind: TabKind;
  title: string;
  /** Viewer tabs only: absolute path of the file being shown. */
  path?: string;
  /** Viewer tabs only: the explorer tab this file was opened from. */
  openedFrom?: string;
}

interface TabsState {
  tabs: Tab[];
  activeId: string | null;

  openTerminal: (opts?: { id?: string; title?: string; cwd?: string }) => string;
  openExplorer: (opts?: { id?: string; title?: string; cwd?: string }) => string;
  /** Opens the file, or focuses its tab if it is already open. */
  openViewer: (path: string, fromTabId?: string) => string;
  close: (id: string) => void;
  setActive: (id: string) => void;
  rename: (id: string, title: string) => void;
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

    if (tab.kind === "terminal") useTerminalStore.getState().closeSession(id);
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

  setActive: (id) => {
    set({ activeId: id });
    syncContentFocus(id, get().tabs);
  },

  rename: (id, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title: trimmed } : t)) }));
    const tab = get().tabs.find((t) => t.id === id);
    if (tab?.kind === "terminal") useTerminalStore.getState().renameSession(id, trimmed);
    if (tab?.kind === "explorer") useFileStore.getState().updateSession(id, { name: trimmed });
  },

  restore: (saved, activeId) => {
    const tabs: Tab[] = [];
    for (const tab of saved) {
      if (tab.kind === "terminal") {
        useTerminalStore.getState().createSession(tab.id, tab.title, tab.cwd || undefined);
        tabs.push({ id: tab.id, kind: "terminal", title: tab.title });
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
  if (tab?.kind === "terminal") useTerminalStore.getState().setActiveSession(id);
  if (tab?.kind === "explorer") useFileStore.getState().setActiveSession(id);
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
    cwd:
      tab.kind === "explorer"
        ? (files[tab.id]?.cwd ?? "")
        : tab.kind === "terminal"
          ? (terminals[tab.id]?.cdCwd ?? "")
          : "",
    path: tab.path ?? "",
  }));
}
