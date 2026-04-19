import { create } from "zustand";

export type TabId = "terminal" | "files" | "browser";

interface UiState {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: "terminal",
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
