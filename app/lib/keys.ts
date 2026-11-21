/** Modifier state of a keyboard event, narrowed to what shortcuts care about. */
export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/**
 * Ctrl+S on Windows/Linux, Cmd+S on macOS. Alt is excluded so Ctrl+Alt+S
 * (a distinct chord, and AltGr+S on some layouts) isn't swallowed.
 */
export function isSaveShortcut(e: ShortcutEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s";
}
