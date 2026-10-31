import { existsSync } from "node:fs";
import * as pty from "node-pty";

function getDefaultShell(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "cmd.exe";
  }
  // Use SHELL env if set (user's login shell)
  if (process.env.SHELL && existsSync(process.env.SHELL)) {
    return process.env.SHELL;
  }
  // macOS default is zsh, Linux is usually bash
  if (existsSync("/bin/zsh")) return "/bin/zsh";
  if (existsSync("/bin/bash")) return "/bin/bash";
  return "/bin/sh";
}

interface PtySession {
  id: string;
  ownerId: string;
  process: pty.IPty;
  onData: (data: string) => void;
  onExit: (exitCode: number) => void;
  /**
   * The process behind this pty keeps the user's work itself, so there is
   * nothing here for a grace period to protect. True for a tmux tab: tmux is
   * a server with its own lifetime and this pty is only a client of it.
   */
  persistent: boolean;
  /**
   * Set while no socket owns this pty: what it has said since, and the timer
   * that gives up waiting for someone to come back for it.
   */
  detached?: { buffer: string; timer: NodeJS.Timeout };
}

/**
 * How long an ephemeral pty outlives the socket that was reading it.
 *
 * A dropped connection used to take the shell with it, which on a phone meant
 * a walk past a dead spot killed a running build. A socket.io reconnect takes
 * a second or two, so this only has to cover the gap — and it deliberately
 * does no more: a terminal that survived for hours would be a worse tmux,
 * without the part where you can attach to it from somewhere else. Closing the
 * tab still kills it immediately, because that was asked for.
 *
 * It is for the ptys that *are* the work. A `persistent` one is not: see
 * `releasePty`.
 */
const GRACE_MS = 60_000;

/**
 * How much a detached pty may say before the oldest of it is dropped.
 *
 * Something still running writes to a terminal nobody is reading, and that
 * output has to go somewhere until a reader returns. A bound is the difference
 * between holding a minute of a build log and holding whatever `yes` produces
 * in a minute. Trimmed from the front: the end is the part worth seeing.
 */
const BUFFER_CHARS = 256 * 1024;

const sessions = new Map<string, PtySession>();

export function createPty(
  sessionId: string,
  ownerId: string,
  options: {
    shell?: string;
    /** Arguments for `shell`. A tmux tab spawns tmux itself, not a shell. */
    args?: string[];
    cwd?: string;
    cols?: number;
    rows?: number;
    /** See `PtySession.persistent`. Off by default: a shell is the work. */
    persistent?: boolean;
    onData: (data: string) => void;
    onExit: (exitCode: number) => void;
  },
): void {
  if (sessions.has(sessionId)) {
    killPty(sessionId);
  }

  const shell = options.shell || process.env.DEFAULT_SHELL || getDefaultShell();
  const cwd = options.cwd || process.env.DEFAULT_CWD || process.env.HOME || process.env.USERPROFILE || "/";

  const args = options.args ?? [];
  console.log(`pty-manager: spawning "${shell}" ${args.join(" ")} in "${cwd}"`);

  let proc: pty.IPty;
  try {
    proc = pty.spawn(shell, args, {
      name: "xterm-256color",
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd,
      env: process.env as Record<string, string>,
    });
  } catch (err) {
    console.error(`pty-manager: failed to spawn "${shell}" in "${cwd}":`, err);
    options.onExit(1);
    return;
  }

  const session: PtySession = {
    id: sessionId,
    ownerId,
    process: proc,
    onData: options.onData,
    onExit: options.onExit,
    persistent: options.persistent ?? false,
  };

  proc.onData((data) => {
    if (sessions.get(sessionId) !== session) return;
    if (session.detached) {
      const held = session.detached.buffer + data;
      session.detached.buffer = held.length > BUFFER_CHARS ? held.slice(held.length - BUFFER_CHARS) : held;
      return;
    }
    session.onData(data);
  });

  proc.onExit(({ exitCode }) => {
    // A replacement PTY may already exist under the same client session ID.
    // Ignore this stale process's exit instead of deleting/closing its successor.
    if (sessions.get(sessionId) !== session) return;
    // Exited while nobody was reading it: there is nothing to tell and nothing
    // left to reattach to, so it goes now rather than at the end of its grace.
    if (session.detached) {
      clearTimeout(session.detached.timer);
      sessions.delete(sessionId);
      return;
    }
    session.onExit(exitCode);
    sessions.delete(sessionId);
  });

  sessions.set(sessionId, session);
}

export function writePty(sessionId: string, ownerId: string, data: string): void {
  const session = sessions.get(sessionId);
  if (session?.ownerId === ownerId) {
    session.process.write(data);
  }
}

export function resizePty(sessionId: string, ownerId: string, cols: number, rows: number): void {
  const session = sessions.get(sessionId);
  if (session?.ownerId === ownerId) {
    try {
      session.process.resize(cols, rows);
    } catch {
      // Ignore resize errors for dead processes
    }
  }
}

/**
 * Give up a pty whose socket went away: hold it for the grace period, or kill
 * it where holding it buys nothing. True when it is being held.
 *
 * A `persistent` pty is killed, and that is not a compromise — it is the whole
 * reason tmux tabs exist. Holding one means a tmux client that nobody is
 * reading stays attached, and three things then go wrong at the next
 * connection. tmux has no reason to repaint, because from where it sits the
 * client never left, so a reloaded page gets a blank screen with only the
 * parts a program happens to redraw on its own — a spinner turning in the
 * dark. The modes go the same way: tmux sends mouse reporting only when what
 * it believes the terminal is in differs from what the pane wants, so a brand
 * new terminal never gets it and the TUI in there loses scrolling and clicking
 * until the next attach. And until the old client's grace runs out there are
 * two clients attached, so tmux sizes the window to the smaller of them.
 * Killing it costs nothing: tmux is still holding the session, and the next
 * connection attaches afresh — a full repaint, the modes re-sent, the size its
 * own.
 *
 * False also when there is nothing of ours to give up — no such session, or
 * one a reconnect has already taken over, which is what the ownership check is
 * for: a late disconnect must not touch the pty that replaced it.
 */
export function releasePty(sessionId: string, ownerId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session || session.ownerId !== ownerId || session.detached) return false;
  if (session.persistent) {
    killPty(sessionId, ownerId);
    return false;
  }
  session.detached = { buffer: "", timer: setTimeout(() => killPty(sessionId), GRACE_MS) };
  return true;
}

/**
 * Hand a detached pty to a new socket, with whatever it said while it waited.
 *
 * `null` means there was nothing to reattach and the caller should spawn —
 * which is not the same as `""`, a reattach of something that stayed quiet.
 */
export function reattachPty(
  sessionId: string,
  ownerId: string,
  handlers: { onData: (data: string) => void; onExit: (exitCode: number) => void },
): string | null {
  const session = sessions.get(sessionId);
  if (!session?.detached) return null;
  clearTimeout(session.detached.timer);
  const pending = session.detached.buffer;
  session.detached = undefined;
  session.ownerId = ownerId;
  session.onData = handlers.onData;
  session.onExit = handlers.onExit;
  return pending;
}

export function killPty(sessionId: string, ownerId?: string): void {
  const session = sessions.get(sessionId);
  if (session && (ownerId === undefined || session.ownerId === ownerId)) {
    if (session.detached) clearTimeout(session.detached.timer);
    try {
      session.process.kill();
    } catch {
      // Already dead
    }
    sessions.delete(sessionId);
  }
}

export function getPtyPid(sessionId: string): number | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  return session.process.pid;
}

/**
 * The slave device this pty is attached to — `/dev/pts/3`, `/dev/ttys004`.
 *
 * tmux names each of its clients by exactly this, so it is how a tab's own
 * client is picked out of `list-clients` without guessing from process names
 * or reading anything out of /proc. node-pty keeps it on `ptsName`, which its
 * typings do not declare but `UnixTerminal` has had since 0.x.
 */
export function getPtyTty(sessionId: string): string | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const tty = (session.process as { ptsName?: unknown }).ptsName;
  return typeof tty === "string" && tty.startsWith("/dev/") ? tty : null;
}

/**
 * Every live session id. Nothing in the app needs this — the one caller is the
 * test, which uses it to observe that create and kill did what they claim and
 * to clean up between cases. Kept for that: the ownership rules it checks are
 * what stop a reconnect from killing the pty it just replaced.
 */
export function getSessionIds(): string[] {
  return Array.from(sessions.keys());
}
