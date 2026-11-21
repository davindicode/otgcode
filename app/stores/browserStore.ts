import { create } from "zustand";

/**
 * The ports listed in the localhost popup. Each row is just a port the user
 * wants quick access to — opening one goes to a real browser tab through the
 * /proxy/:port route, so nothing here tracks page state.
 */
export interface BrowserTab {
  id: string;
  /** "" while the row is still being typed. */
  port: string;
}

interface BrowserState {
  tabs: BrowserTab[];
  addTab: () => void;
  removeTab: (id: string) => void;
  setTabPort: (id: string, port: string) => void;
}

export const useBrowserStore = create<BrowserState>((set) => ({
  tabs: [],

  addTab: () => set((s) => ({ tabs: [...s.tabs, { id: `browser-${Date.now()}`, port: "" }] })),

  removeTab: (id) => set((s) => ({ tabs: s.tabs.filter((t) => t.id !== id) })),

  setTabPort: (id, port) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, port } : t)) })),
}));
