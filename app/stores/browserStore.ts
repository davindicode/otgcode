import { create } from "zustand";

export interface BrowserTab {
  id: string;
  port: string; // "" = pending input
  refreshKey: number;
  error: string | null;
}

interface BrowserState {
  tabs: BrowserTab[];
  activeTabId: string | null;

  addTab: () => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setTabPort: (id: string, port: string) => void;
  setTabError: (id: string, error: string | null) => void;
  refreshTab: (id: string) => void;
}

export const useBrowserStore = create<BrowserState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab: () => {
    const id = `browser-${Date.now()}`;
    const tab: BrowserTab = { id, port: "", refreshKey: 0, error: null };
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: id,
    }));
  },

  removeTab: (id) => {
    const { tabs, activeTabId } = get();
    const newTabs = tabs.filter((t) => t.id !== id);
    let newActive = activeTabId;
    if (activeTabId === id) {
      const idx = tabs.findIndex((t) => t.id === id);
      newActive = newTabs.length > 0 ? newTabs[Math.min(idx, newTabs.length - 1)].id : null;
    }
    set({ tabs: newTabs, activeTabId: newActive });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  setTabPort: (id, port) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, port, error: null, refreshKey: 0 } : t)),
    }));
  },

  setTabError: (id, error) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, error } : t)),
    }));
  },

  refreshTab: (id) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, refreshKey: t.refreshKey + 1 } : t)),
    }));
  },
}));
