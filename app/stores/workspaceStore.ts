import { create } from "zustand";
import {
  type CustomCommand,
  DEFAULT_EDITOR_FONT_SIZE,
  DEFAULT_FONT_SIZE,
  type Theme,
  type Workspace,
} from "~/lib/workspace.shared";

/**
 * Mirrors the workspace file on the host. Layout and open tabs live there
 * rather than in browser storage, so a refresh, a reconnect, or opening the
 * tunnel on another device restores the same workspace.
 */
interface WorkspaceState {
  loaded: boolean;
  theme: Theme;
  fontSize: number;
  editorFontSize: number;
  customCommands: CustomCommand[];
  hiddenCommands: string[];
  restored: Workspace | null;

  hydrate: () => Promise<void>;
  setTheme: (theme: Theme) => void;
  setFontSize: (size: number) => void;
  setEditorFontSize: (size: number) => void;
  addCommand: (command: CustomCommand) => void;
  /** Remove a custom command, or hide a built-in one. */
  removeCommand: (label: string, isCustom: boolean) => void;
  restoreCommand: (label: string) => void;
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

// Matches the .theme-transition duration in app.css.
const THEME_FADE_MS = 260;
let fadeTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Swap the theme behind a short cross-fade. The transition class only lives
 * for the length of the swap — leaving it on would delay every hover and
 * active state in the app by the same amount.
 */
function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.add("theme-transition");
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");

  // Re-toggling mid-fade restarts the window rather than cutting it short.
  if (fadeTimer) clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => {
    root.classList.remove("theme-transition");
    fadeTimer = null;
  }, THEME_FADE_MS);
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  loaded: false,
  theme: "dark",
  fontSize: DEFAULT_FONT_SIZE,
  editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
  customCommands: [],
  hiddenCommands: [],
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
        editorFontSize: data.editorFontSize,
        customCommands: data.customCommands,
        hiddenCommands: data.hiddenCommands,
        restored: data,
      });
    } catch {
      set({ loaded: true });
    }
  },

  setTheme: (theme) => {
    set({ theme });
    applyTheme(theme);
    queue({ theme });
  },

  setFontSize: (size) => {
    set({ fontSize: size });
    queue({ fontSize: size });
  },

  setEditorFontSize: (size) => {
    set({ editorFontSize: size });
    queue({ editorFontSize: size });
  },

  addCommand: (command) => {
    const customCommands = [...get().customCommands.filter((c) => c.label !== command.label), command];
    set({ customCommands });
    queue({ customCommands });
  },

  removeCommand: (label, isCustom) => {
    if (isCustom) {
      const customCommands = get().customCommands.filter((c) => c.label !== label);
      set({ customCommands });
      queue({ customCommands });
      return;
    }
    if (get().hiddenCommands.includes(label)) return;
    const hiddenCommands = [...get().hiddenCommands, label];
    set({ hiddenCommands });
    queue({ hiddenCommands });
  },

  restoreCommand: (label) => {
    const hiddenCommands = get().hiddenCommands.filter((l) => l !== label);
    set({ hiddenCommands });
    queue({ hiddenCommands });
  },

  saveTabs: (patch) => queue(patch),
}));
