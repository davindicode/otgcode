/**
 * Key sequences for the keyboard: a modifier plus a key, in the encoding
 * terminals actually expect. Pure, so the sequences are checked by tests
 * rather than by pressing every button in a shell.
 */
export type ComboMode = "none" | "shift" | "ctrl" | "ctrl+shift" | "alt" | "alt+shift";

export const COMBO_MODES: { id: ComboMode; label: string }[] = [
  // The default: these sets double as a plain character keyboard, which is
  // what you want on a phone before you want a modifier.
  { id: "none", label: "none" },
  { id: "shift", label: "Shift+" },
  { id: "ctrl", label: "Ctrl+" },
  { id: "ctrl+shift", label: "Ctrl+Shift+" },
  { id: "alt", label: "Alt+" },
  { id: "alt+shift", label: "Alt+Shift+" },
];

// xterm's modifier parameter, used by every CSI sequence below. 1 is "no
// modifier", which the builders turn into the plain form of the key rather
// than a `1;1` sequence no terminal emits.
export const MODIFIER_PARAM: Record<ComboMode, number> = {
  none: 1,
  shift: 2,
  ctrl: 5,
  "ctrl+shift": 6,
  alt: 3,
  "alt+shift": 4,
};

/**
 * What the digit keys send with Shift held, on a US layout.
 *
 * There is no layout-independent answer: the app sends characters straight to
 * the pty, so there is no keymap in between to consult. A physical key prints
 * both of these on it, which is the same bargain.
 */
const SHIFTED_DIGITS: Record<string, string> = {
  "1": "!",
  "2": "@",
  "3": "#",
  "4": "$",
  "5": "%",
  "6": "^",
  "7": "&",
  "8": "*",
  "9": "(",
  "0": ")",
};

function comboChar(ch: string, mode: ComboMode): string {
  const isLetter = ch >= "A" && ch <= "Z";
  switch (mode) {
    case "none":
      // A key is labelled with the key, not its output — `A` sends `a`, the
      // same bargain a physical keyboard makes.
      return isLetter ? ch.toLowerCase() : ch;
    case "shift":
      // Shift is a layout matter rather than a control sequence: the shifted
      // character, or the character itself where there is no shifted form (the
      // symbol set is already specific characters).
      return isLetter ? ch : (SHIFTED_DIGITS[ch] ?? ch);
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
/**
 * A key in one of the sets. Either it has a sequence of its own, or it is a
 * plain character and the modifier is applied the way it is for any letter —
 * which lets y and n sit in the set by usefulness rather than being appended
 * somewhere else.
 */
export type NamedKey = { label: string; title: string } & (
  | { seq: (m: number) => string; char?: never }
  | { char: string; seq?: never }
);

// m === 1 is unmodified, which has its own shorter canonical form — `CSI D`,
// not `CSI 1;1 D`. Terminals accept both, but programs that pattern-match on
// raw input only recognise the plain one.
const csi = (final: string) => (m: number) => (m === 1 ? `\x1b[${final}` : `\x1b[1;${m}${final}`);
const tilde = (code: number) => (m: number) => (m === 1 ? `\x1b[${code}~` : `\x1b[${code};${m}~`);

/**
 * `CSI <code> ; <mod> u` — the encoding for keys that have no modified form of
 * their own. Unmodified they send their original control character, which is
 * what every program understands; modified, they need this.
 */
const csiU = (code: number, plain: string) => (m: number) => (m === 1 ? plain : `\x1b[${code};${m}u`);

/**
 * The default set: everything a terminal needs that is not a character.
 *
 * Enter, Bksp, Esc and Tab used to sit in a separate always-present row that
 * could not take a modifier, which made two near-identical sets — this one and
 * that row — differing only by Ins/Del. One set, and the modifier applies to
 * all of it.
 */
export const MAIN_COMBO_KEYS: NamedKey[] = [
  // Ordered by how often a hand reaches for it, not by keyboard geography:
  // confirm and cancel, then moving the cursor, then answering the prompts a
  // coding CLI puts up, then paging through its output or tmux's scrollback.
  // Home/End/Ins/Del are real but rare, so they sit at the far end.
  { label: "Enter", title: "Enter / confirm", seq: csiU(13, "\r") },
  { label: "Bksp", title: "Backspace", seq: csiU(127, "\x7f") },
  { label: "Esc", title: "Escape / cancel", seq: csiU(27, "\x1b") },
  // Shift+Tab is back-tab, `CSI Z` — older and universally understood, where
  // the generic `CSI 9;2u` would reach almost nothing. It is what cycles
  // permission modes in Claude Code and reverse-completes in a shell.
  { label: "Tab", title: "Tab / complete", seq: (m) => (m === 2 ? "\x1b[Z" : csiU(9, "\t")(m)) },
  { label: "←", title: "Left", seq: csi("D") },
  { label: "→", title: "Right", seq: csi("C") },
  { label: "↑", title: "Up", seq: csi("A") },
  { label: "↓", title: "Down", seq: csi("B") },
  { label: "Y", title: "Yes — approve / confirm", char: "Y" },
  { label: "N", title: "No — deny / decline", char: "N" },
  { label: "PgUp", title: "Page up", seq: tilde(5) },
  { label: "PgDn", title: "Page down", seq: tilde(6) },
  { label: "Home", title: "Home", seq: csi("H") },
  { label: "End", title: "End", seq: csi("F") },
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

// main first: it is the set the keyboard opens on, and the one that covers
// what a terminal needs before it needs characters.
export const COMBO_SETS = ["main", "numbers", "letters", "function", "symbols"] as const;
export type ComboSet = (typeof COMBO_SETS)[number];

/** Sequence for a labelled key in one of the combo sets. */
export function comboSequence(label: string, mode: ComboMode): string {
  const symbol = SYMBOL_COMBO_KEYS.find((k) => k.label === label);
  if (symbol) return mode === "ctrl" && symbol.ctrl ? symbol.ctrl : comboChar(symbol.ch, mode);
  const named = [...MAIN_COMBO_KEYS, ...FN_COMBO_KEYS].find((k) => k.label === label);
  // Narrowed by which half of the union is present, not by a flag.
  if (named) return named.seq ? named.seq(MODIFIER_PARAM[mode]) : comboChar(named.char, mode);
  return comboChar(label, mode);
}
