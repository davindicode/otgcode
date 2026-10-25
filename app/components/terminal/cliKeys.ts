/**
 * Per-CLI keyboard buttons: the keys and slash commands each coding CLI binds.
 *
 * Separate from `combos.ts`, which encodes a modifier onto any key. These are
 * specific bindings read out of each CLI, so they are data rather than
 * encoding — and pure data, so a test can check the sequences instead of
 * someone pressing every button in a shell.
 */

export interface QuickKey {
  label: string;
  key: string;
  title: string;
}

/** Ctrl+<letter> is that letter's code minus 64, which is the control code. */
export function ctrl(letter: string): string {
  return String.fromCharCode(letter.toUpperCase().charCodeAt(0) - 64);
}

/**
 * Keys pressed one after another, written in one go.
 *
 * A leader key is just the first of two: nothing about it needs a pause, and
 * the pty delivers both in the order they were written. `Esc Esc` already
 * worked this way.
 */
function chord(...keys: string[]): string {
  return keys.join("");
}

/**
 * opencode's leader, which almost all of its own bindings sit behind — so
 * `ctrl+x b` toggles the sidebar, and plain `ctrl+x` does nothing on its own.
 */
const OC = ctrl("x");

/** Claude Code uses the same prefix for a handful of its bindings. */
const CC = ctrl("x");

// Keys every coding CLI shares, shown with that CLI's own.
export const CODE_COMMON_KEYS: QuickKey[] = [
  { label: "Ctrl+C", key: ctrl("c"), title: "Cancel / interrupt / quit" },
  // Not "clear screen": in Claude Code this empties the prompt you are typing,
  // and in Codex it clears the transcript view. opencode binds it to nothing.
  { label: "Ctrl+L", key: ctrl("l"), title: "Clear the input (Claude) / clear the view (Codex)" },
  { label: "Ctrl+J", key: "\n", title: "Newline without sending — all three" },
  { label: "Esc Esc", key: "\x1b\x1b", title: "Rewind history (Claude) / edit previous message (Codex)" },
];

// Per-vendor CLI groups: keys and slash commands. The vendor name is also the
// command that starts it.
export interface CliVendor {
  name: string;
  keys: QuickKey[];
  /**
   * Typed into the CLI *without* a trailing Enter.
   *
   * An Enter in the same write as the text does not submit: measured against
   * opencode, both `/help\n` and `/help\r` leave the command sitting in the
   * input box, while writing `/help` and then `\r` opens the palette and runs
   * it. So the command used to end up as prose in a prompt rather than a
   * command. The Enter button beside these chips is that second write.
   */
  slashCmds: { label: string; title: string; command: string }[];
}

export const CLI_VENDORS: CliVendor[] = [
  {
    name: "claude",
    keys: [
      { label: "Shift+Tab", key: "\x1b[Z", title: "Cycle permission modes" },
      { label: "Ctrl+O", key: ctrl("o"), title: "Toggle the full transcript" },
      { label: "Ctrl+T", key: ctrl("t"), title: "Toggle the todo list" },
      { label: "Ctrl+R", key: ctrl("r"), title: "Search prompt history" },
      { label: "Alt+T", key: "\x1bt", title: "Toggle extended thinking" },
      { label: "Alt+P", key: "\x1bp", title: "Model picker" },
      { label: "Alt+O", key: "\x1bo", title: "Toggle fast mode" },
      // Its own prefix, like opencode's leader but for a handful of bindings.
      { label: "Ctrl+X Enter", key: chord(CC, "\r"), title: "Queue this message instead of sending it now" },
      { label: "Ctrl+X Ctrl+S", key: chord(CC, ctrl("s")), title: "Send now, ahead of the queue" },
      { label: "Ctrl+X Ctrl+K", key: chord(CC, ctrl("k")), title: "Stop every background agent" },
      { label: "Ctrl+X Ctrl+A", key: chord(CC, ctrl("a")), title: "Toggle the panel above the prompt" },
      { label: "Ctrl+_", key: ctrl("_"), title: "Undo the last turn" },
      { label: "Ctrl+S", key: ctrl("s"), title: "Stash the draft" },
      { label: "Ctrl+]", key: ctrl("]"), title: "Open the current artifact" },
    ],
    slashCmds: [
      { label: "/clear", title: "Clear conversation context", command: "/clear" },
      { label: "/compact", title: "Compact conversation to save context", command: "/compact" },
      { label: "/cost", title: "Show token usage and cost", command: "/cost" },
      { label: "/help", title: "Show available commands", command: "/help" },
      { label: "/model", title: "Show or switch model", command: "/model" },
      { label: "/exit", title: "Exit Claude Code", command: "/exit" },
      { label: "/config", title: "Open config", command: "/config" },
      { label: "/memory", title: "Edit CLAUDE.md memory", command: "/memory" },
      { label: "/review", title: "Review a PR", command: "/review" },
      { label: "/context", title: "Show context window usage", command: "/context" },
      { label: "/resume", title: "Resume a past session", command: "/resume" },
      { label: "/agents", title: "Manage subagents", command: "/agents" },
      { label: "/status", title: "Show account and system status", command: "/status" },
      { label: "/rewind", title: "Rewind to an earlier point", command: "/rewind" },
      { label: "/vim", title: "Toggle vim mode", command: "/vim" },
    ],
  },
  {
    name: "codex",
    keys: [
      { label: "Shift+Tab", key: "\x1b[Z", title: "Cycle approval modes" },
      { label: "Ctrl+O", key: ctrl("o"), title: "Copy the last response as Markdown" },
      { label: "Ctrl+V", key: ctrl("v"), title: "Attach the image on the clipboard" },
      { label: "Ctrl+T", key: ctrl("t"), title: "Toggle raw scrollback" },
    ],
    slashCmds: [
      { label: "/help", title: "Show available commands", command: "/help" },
      { label: "/model", title: "Show or switch model", command: "/model" },
      { label: "/exit", title: "Exit Codex", command: "/exit" },
      { label: "/clear", title: "Clear conversation", command: "/clear" },
      { label: "/approval", title: "Change approval mode", command: "/approval" },
      { label: "/review", title: "Review the working tree", command: "/review" },
      { label: "/compact", title: "Compact conversation", command: "/compact" },
    ],
  },
  {
    name: "opencode",
    keys: [
      // Everything with a leader is `ctrl+x` then the key. The previous set
      // here was the old Go TUI's, where these were plain Ctrl chords — on the
      // current build every one of them did something else or nothing at all,
      // and `Ctrl+X` alone was labelled "cancel generation" when it is the
      // leader. Escape is what interrupts.
      { label: "Ctrl+X B", key: chord(OC, "b"), title: "Toggle the sidebar" },
      { label: "Ctrl+P", key: ctrl("p"), title: "Command palette" },
      { label: "Ctrl+X N", key: chord(OC, "n"), title: "New session" },
      { label: "Ctrl+X L", key: chord(OC, "l"), title: "List sessions" },
      { label: "Ctrl+X M", key: chord(OC, "m"), title: "List models" },
      { label: "Ctrl+X A", key: chord(OC, "a"), title: "List agents" },
      { label: "Ctrl+X C", key: chord(OC, "c"), title: "Compact the session" },
      { label: "Ctrl+X E", key: chord(OC, "e"), title: "Open the external editor" },
      { label: "Ctrl+X U", key: chord(OC, "u"), title: "Undo the last message" },
      { label: "Ctrl+X R", key: chord(OC, "r"), title: "Redo" },
      { label: "Ctrl+X Y", key: chord(OC, "y"), title: "Copy the message" },
      { label: "Ctrl+X G", key: chord(OC, "g"), title: "Session timeline" },
      { label: "Ctrl+X S", key: chord(OC, "s"), title: "View status" },
      { label: "Ctrl+R", key: ctrl("r"), title: "Rename the session" },
      { label: "Ctrl+T", key: ctrl("t"), title: "Cycle model variants" },
    ],
    slashCmds: [
      { label: "/help", title: "Show available commands", command: "/help" },
      { label: "/exit", title: "Exit OpenCode", command: "/exit" },
      { label: "/clear", title: "Clear conversation", command: "/clear" },
      { label: "/compact", title: "Compact context", command: "/compact" },
    ],
  },
];
