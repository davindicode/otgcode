/**
 * Key sequences for the combos drawer: a modifier plus a key, in the encoding
 * terminals actually expect. Pure, so the sequences are checked by tests
 * rather than by pressing every button in a shell.
 */
export type StickyMode = "none" | "ctrl" | "ctrl+shift" | "alt" | "alt+shift";

export const STICKY_MODES: { id: StickyMode; label: string }[] = [
  // The default: these sets double as a plain character keyboard, which is
  // what you want on a phone before you want a modifier.
  { id: "none", label: "none" },
  { id: "ctrl", label: "Ctrl+" },
  { id: "ctrl+shift", label: "Ctrl+Shift+" },
  { id: "alt", label: "Alt+" },
  { id: "alt+shift", label: "Alt+Shift+" },
];

// xterm's modifier parameter, used by every CSI sequence below. 1 is "no
// modifier", which the builders turn into the plain form of the key rather
// than a `1;1` sequence no terminal emits.
export const MODIFIER_PARAM: Record<StickyMode, number> = {
  none: 1,
  ctrl: 5,
  "ctrl+shift": 6,
  alt: 3,
  "alt+shift": 4,
};

export function getStickyKey(ch: string, mode: StickyMode): string {
  const isLetter = ch >= "A" && ch <= "Z";
  switch (mode) {
    case "none":
      // Unmodified, a letter key sends its lowercase character; the label is
      // lowercased to match, so the button says what it sends.
      return isLetter ? ch.toLowerCase() : ch;
    case "ctrl":
      // Ctrl+Letter = control code, Ctrl+Digit = send via CSI u
      return isLetter ? String.fromCharCode(ch.charCodeAt(0) - 64) : `\x1b[${ch.charCodeAt(0)};5u`;
    case "ctrl+shift":
      return `\x1b[${ch.charCodeAt(0)};6u`;
    case "alt":
      return `\x1b${isLetter ? ch.toLowerCase() : ch}`;
    case "alt+shift":
      return `\x1b${ch}`;
  }
}

/**
 * Named keys with a modifier, in the standard xterm encoding: arrows and
 * Home/End take a CSI parameter, the tilde keys carry theirs before the `~`,
 * and F1–F4 are the SS3 letters while F5 up are tilde keys.
 */
export type NamedKey = { label: string; title: string; seq: (m: number) => string };

// m === 1 is unmodified, which has its own shorter canonical form — `CSI D`,
// not `CSI 1;1 D`. Terminals accept both, but programs that pattern-match on
// raw input only recognise the plain one.
const csi = (final: string) => (m: number) => (m === 1 ? `\x1b[${final}` : `\x1b[1;${m}${final}`);
const tilde = (code: number) => (m: number) => (m === 1 ? `\x1b[${code}~` : `\x1b[${code};${m}~`);

export const NAV_COMBO_KEYS: NamedKey[] = [
  { label: "←", title: "Left", seq: csi("D") },
  { label: "→", title: "Right", seq: csi("C") },
  { label: "↑", title: "Up", seq: csi("A") },
  { label: "↓", title: "Down", seq: csi("B") },
  { label: "Home", title: "Home", seq: csi("H") },
  { label: "End", title: "End", seq: csi("F") },
  { label: "PgUp", title: "Page up", seq: tilde(5) },
  { label: "PgDn", title: "Page down", seq: tilde(6) },
  { label: "Ins", title: "Insert", seq: tilde(2) },
  { label: "Del", title: "Delete", seq: tilde(3) },
];

export const FN_COMBO_KEYS: NamedKey[] = [
  { label: "F1", title: "F1", seq: csi("P") },
  { label: "F2", title: "F2", seq: csi("Q") },
  { label: "F3", title: "F3", seq: csi("R") },
  { label: "F4", title: "F4", seq: csi("S") },
  { label: "F5", title: "F5", seq: tilde(15) },
  { label: "F6", title: "F6", seq: tilde(17) },
  { label: "F7", title: "F7", seq: tilde(18) },
  { label: "F8", title: "F8", seq: tilde(19) },
  { label: "F9", title: "F9", seq: tilde(20) },
  { label: "F10", title: "F10", seq: tilde(21) },
  { label: "F11", title: "F11", seq: tilde(23) },
  { label: "F12", title: "F12", seq: tilde(24) },
];

/**
 * Punctuation that has a real control code under Ctrl — these are the ones
 * terminal programs actually bind, so they're worth a button. Under Alt they
 * fall back to ESC + the character.
 */
export const SYMBOL_COMBO_KEYS: { label: string; title: string; ch: string; ctrl?: string }[] = [
  { label: "Space", title: "NUL / set mark", ch: " ", ctrl: "\x00" },
  { label: "[", title: "Escape", ch: "[", ctrl: "\x1b" },
  { label: "\\", title: "Quit (SIGQUIT)", ch: "\\", ctrl: "\x1c" },
  { label: "]", title: "Group separator", ch: "]", ctrl: "\x1d" },
  { label: "^", title: "Record separator", ch: "^", ctrl: "\x1e" },
  { label: "_", title: "Unit separator / undo", ch: "_", ctrl: "\x1f" },
  { label: "?", title: "Backspace / help", ch: "?", ctrl: "\x7f" },
  { label: "-", title: "Undo (readline)", ch: "-" },
  { label: ".", title: "Last argument", ch: "." },
  { label: "/", title: "Undo (readline)", ch: "/" },
];

export const COMBO_SETS = ["numbers", "letters", "nav", "function", "symbols"] as const;
export type ComboSet = (typeof COMBO_SETS)[number];

/** Sequence for a labelled key in one of the combo sets. */
export function comboSequence(label: string, mode: StickyMode): string {
  const symbol = SYMBOL_COMBO_KEYS.find((k) => k.label === label);
  if (symbol) return mode === "ctrl" && symbol.ctrl ? symbol.ctrl : getStickyKey(symbol.ch, mode);
  const named = [...NAV_COMBO_KEYS, ...FN_COMBO_KEYS].find((k) => k.label === label);
  if (named) return named.seq(MODIFIER_PARAM[mode]);
  return getStickyKey(label, mode);
}
