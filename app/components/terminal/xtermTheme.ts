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
  background: "#f7f8fc",
  foreground: "#24262f",
  cursor: "#24262f",
  cursorAccent: "#f7f8fc",
  selectionBackground: "#b6d7f5",
  black: "#24262f",
  red: "#c72e2e",
  green: "#2f7d32",
  yellow: "#9a6d00",
  blue: "#1667c4",
  magenta: "#9c27b0",
  cyan: "#00796b",
  white: "#5c6070",
  brightBlack: "#767d92",
  brightRed: "#e03131",
  brightGreen: "#37913b",
  brightYellow: "#b07d00",
  brightBlue: "#1c7ed6",
  brightMagenta: "#b338c7",
  brightCyan: "#0b8f80",
  brightWhite: "#14141f",
};

export function xtermTheme(theme: Theme): ITheme {
  return theme === "light" ? LIGHT : DARK;
}
