import { create } from "zustand";
import { DEFAULT_FONT_SIZE, type Theme, type Workspace } from "~/lib/workspace.shared";

/**
 * Mirrors the workspace file on the host. Layout and open tabs live there
 * rather than in browser storage, so a refresh, a reconnect, or opening the
 * tunnel on another device restores the same workspace.
 */
interface WorkspaceState {
  loaded: boolean;
  theme: Theme;
  fontSize: number;
  restored: Workspace | null;

  hydrate: () => Promise<void>;
  setTheme: (theme: Theme) => void;
  setFontSize: (size: number) => void;
  /** Persist the current tab strip. */
  saveTabs: (patch: Pick<Workspace, "tabs" | "activeId">) => void;
}

// Dragging a divider fires continuously; batch writes so the disk sees one.
const WRITE_DELAY_MS = 600;
let pending: Partial<Workspace> = {};
let timer: ReturnType<typeof setTimeout> | null = null;

function queue(patch: Partial<Workspace>) {
  pending = { ...pending, ...patch };
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, WRITE_DELAY_MS);
}

function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const body = pending;
  pending = {};
  if (Object.keys(body).length === 0) return;
  fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // Survives the request outliving the page on a refresh or tab close.
    keepalive: true,
  }).catch(() => {
    // Persistence is a convenience; a failed write must not disturb the UI.
  });
}

if (typeof window !== "undefined") {
  // Don't lose the last drag or tab change on the way out.
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  loaded: false,
  theme: "dark",
  fontSize: DEFAULT_FONT_SIZE,
  restored: null,

  hydrate: async () => {
    try {
      const res = await fetch("/api/workspace");
      if (!res.ok) throw new Error("unavailable");
      const data = (await res.json()) as Workspace;
      set({
        loaded: true,
        theme: data.theme,
        fontSize: data.fontSize,
        restored: data,
      });
    } catch {
      set({ loaded: true });
    }
  },

  setTheme: (theme) => {
    set({ theme });
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.classList.toggle("dark", theme === "dark");
    queue({ theme });
  },

  setFontSize: (size) => {
    set({ fontSize: size });
    queue({ fontSize: size });
  },

  saveTabs: (patch) => queue(patch),
}));
