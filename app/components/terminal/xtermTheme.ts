import type { ITheme } from "@xterm/xterm";
import type { Theme } from "~/lib/workspace.shared";

// The dark set is the original VS Code-ish palette. The light set keeps the
// same hues but darkens them to stay legible on a pale background — ANSI
// colours tuned for a dark terminal wash out badly otherwise.
const DARK: ITheme = {
  background: "#1a1a2e",
  foreground: "#e0e0e0",
  cursor: "#e0e0e0",
  cursorAccent: "#1a1a2e",
  selectionBackground: "#264f78",
  black: "#1a1a2e",
  red: "#f44747",
  green: "#6a9955",
  yellow: "#dcdcaa",
  blue: "#569cd6",
  magenta: "#c586c0",
  cyan: "#4ec9b0",
  white: "#d4d4d4",
  brightBlack: "#808080",
  brightRed: "#f44747",
  brightGreen: "#6a9955",
  brightYellow: "#dcdcaa",
  brightBlue: "#569cd6",
  brightMagenta: "#c586c0",
  brightCyan: "#4ec9b0",
  brightWhite: "#ffffff",
};

const LIGHT: ITheme = {
  background: "#edf0f6",
  foreground: "#24262f",
  cursor: "#24262f",
  cursorAccent: "#edf0f6",
  selectionBackground: "#b6d7f5",
  black: "#24262f",
  red: "#c72e2e",
  green: "#2f7d32",
  yellow: "#966a00",
  blue: "#1667c4",
  magenta: "#9c27b0",
  cyan: "#00796b",
  white: "#5c6070",
  brightBlack: "#6a7083",
  brightRed: "#d72f2f",
  brightGreen: "#318235",
  brightYellow: "#936800",
  brightBlue: "#1973c4",
  brightMagenta: "#b338c7",
  brightCyan: "#098073",
  brightWhite: "#14141f",
};

/**
 * The canvas background is read from --t-terminal rather than duplicated here:
 * the container paints the same token, and any pixel the canvas doesn't cover
 * falls through to it. Two hard-coded copies drifted apart once already and
 * showed as bands at the edges of the terminal.
 */
function terminalBackground(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue("--t-terminal").trim();
  return value || fallback;
}

export function xtermTheme(theme: Theme): ITheme {
  const base = theme === "light" ? LIGHT : DARK;
  const background = terminalBackground(base.background ?? fallback(theme));
  return { ...base, background, cursorAccent: background };
}

const fallback = (theme: Theme) => (theme === "light" ? "#edf0f6" : "#0b0b16");
