/**
 * Animated single-line progress for long console waits, so a slow step reads
 * as "working" rather than "hung".
 *
 * Only animates on a TTY: piped into a log file or a CI job, a carriage-return
 * animation turns into thousands of junk lines, so there it degrades to one
 * static line.
 */

const BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const ASCII = ["-", "\\", "|", "/"];
const FRAME_MS = 80;

// Braille renders as tofu in terminals without a capable font; fall back when
// the environment doesn't advertise UTF-8.
export function frames(): string[] {
  const encoding = `${process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG || ""}`;
  return /utf-?8/i.test(encoding) ? BRAILLE : ASCII;
}

export interface Progress {
  /** Print a line without the spinner overwriting it. */
  log: (message: string) => void;
  /** Stop animating and clear the line. */
  stop: () => void;
}

let restoreCursor: (() => void) | null = null;

// A spinner hides the cursor; if the process dies mid-spin (Ctrl+C) it has to
// come back, or the user is left with an invisible cursor in their shell.
function armCursorRestore(): void {
  if (restoreCursor) return;
  const restore = () => {
    if (process.stdout.isTTY) process.stdout.write("\x1b[?25h");
  };
  restoreCursor = restore;
  process.once("exit", restore);
  process.once("SIGINT", () => {
    restore();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    restore();
    process.exit(143);
  });
}

export function startProgress(label: string): Progress {
  if (!process.stdout.isTTY) {
    console.log(`  ${label}...`);
    return { log: (message) => console.log(message), stop: () => {} };
  }

  const set = frames();
  let i = 0;
  armCursorRestore();
  process.stdout.write("\x1b[?25l");

  const draw = () => {
    process.stdout.write(`\r\x1b[2K  \x1b[36m${set[i++ % set.length]}\x1b[0m ${label}`);
  };
  draw();
  const timer = setInterval(draw, FRAME_MS);
  // Don't let the animation alone hold the process open.
  timer.unref?.();

  let stopped = false;
  const clear = () => {
    clearInterval(timer);
    process.stdout.write("\r\x1b[2K");
  };

  return {
    log: (message) => {
      if (stopped) {
        console.log(message);
        return;
      }
      process.stdout.write("\r\x1b[2K");
      console.log(message);
      draw();
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      clear();
      process.stdout.write("\x1b[?25h");
    },
  };
}
