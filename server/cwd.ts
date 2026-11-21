import { execFileSync, execSync } from "node:child_process";
import { readlinkSync } from "node:fs";
import type { Express } from "express";
import { getPtyPid, getPtyTty } from "./pty-manager.js";

/**
 * Which directory a terminal tab is sitting in.
 *
 * An Express route rather than a React Router one, because it has to read the
 * live pty table. The route version imported `pty-manager` across the layer
 * boundary, and Vite inlined a *second copy* of that module into the server
 * bundle — with its own empty session map. `getPtyPid` therefore always
 * returned null and this endpoint always answered with the default directory,
 * on tmux tabs and plain terminal tabs alike. Keeping it beside the module
 * whose state it reads is the fix.
 *
 * Nothing here guesses. A directory this cannot establish comes back as null,
 * because the caller is a picker whose buttons are directories: one wrong
 * answer and every button in it sends the terminal somewhere else. It used to
 * answer with the default directory, which on a host where the probe never
 * worked meant the picker quietly claimed the login directory every time it
 * was reopened.
 */

function getDirectChildren(pid: number): number[] {
  try {
    return execSync(`pgrep -P ${pid}`, { encoding: "utf-8", timeout: 2000 })
      .trim()
      .split("\n")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

function findDeepestDescendant(pid: number, depth = 0): number {
  if (depth > 16) return pid;
  const children = getDirectChildren(pid);
  if (children.length === 0) return pid;
  return findDeepestDescendant(children[children.length - 1], depth + 1);
}

/**
 * A running process's working directory, or null.
 *
 * Linux keeps it in /proc. macOS has no /proc at all, which is what made this
 * endpoint useless there: every read threw and the default directory was handed
 * back as though it were an answer. `lsof` is that platform's own way to ask
 * and ships with the OS; its field output is one line per field, so the cwd is
 * the line beginning `n`.
 */
function processCwd(pid: number): string | null {
  if (process.platform === "linux") {
    try {
      return readlinkSync(`/proc/${pid}/cwd`) || null;
    } catch {
      return null;
    }
  }
  try {
    const out = execFileSync("lsof", ["-a", "-d", "cwd", "-p", String(pid), "-Fn"], {
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const line = out.split("\n").find((l) => l.startsWith("n/"));
    return line ? line.slice(1) : null;
  } catch {
    return null;
  }
}

/** Every client on the tmux server, with what each is looking at. */
function listTmuxClients(): { tty: string; session: string; id: string; window: string; cwd: string }[] {
  try {
    // TMUX is dropped so this describes the whole server rather than the
    // session the app itself may have been started from.
    const env = { ...process.env };
    delete env.TMUX;
    const format = "#{client_tty}\t#{session_name}\t#{session_id}\t#{window_index}\t#{pane_current_path}";
    const out = execFileSync("tmux", ["list-clients", "-F", format], {
      encoding: "utf-8",
      timeout: 2000,
      env,
    });
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [tty, session, id, window, cwd] = line.split("\t");
        return { tty, session, id, window, cwd };
      })
      .filter((client) => client.tty && client.cwd);
  } catch {
    // No tmux, or no server running.
    return [];
  }
}

interface TerminalPlace {
  /** Null when it could not be established. Never a guess — see the note above. */
  cwd: string | null;
  /** Present only for a tab attached to tmux. */
  tmuxSession: string | null;
  /** tmux's own id for that session, which a rename does not change. */
  tmuxSessionId: string | null;
  /** The window that tab's client is on, which its controls report. */
  tmuxWindow: string | null;
}

const NOWHERE: TerminalPlace = { cwd: null, tmuxSession: null, tmuxSessionId: null, tmuxWindow: null };

function detectCwd(sessionId: string | undefined): TerminalPlace {
  if (!sessionId) return NOWHERE;

  // The tab's own tmux client, found by the device its pty is attached to.
  //
  // Matching on the tty rather than asking tmux for "the" active pane:
  // without a client, tmux answers for whichever pane is globally focused,
  // which is wrong as soon as two tabs each have a client. And
  // `display-message -c` turned out not to be enough either — the server may
  // itself be running inside tmux, and the inherited $TMUX then scoped the
  // answer to *that* session instead of the client's.
  //
  // The tty comes from the pty we opened, not from the process tree. Walking
  // the tree for something named `tmux` and reading its stdin link needed
  // /proc twice over, so on macOS it found nothing, every tmux tab fell
  // through, and the fallback below could not read a cwd there either.
  const tty = getPtyTty(sessionId);
  if (tty) {
    const client = listTmuxClients().find((c) => c.tty === tty);
    if (client) {
      return {
        cwd: client.cwd,
        tmuxSession: client.session || null,
        tmuxSessionId: client.id || null,
        tmuxWindow: client.window || null,
      };
    }
  }

  // No tmux client on this pty: it is running a shell, so the directory is
  // whatever the innermost thing under it is in. The deepest descendant first,
  // because a shell running `vim` or a coding CLI is not the process that
  // moved; the pty itself as the fallback, for a pty with no children yet.
  const ptyPid = getPtyPid(sessionId);
  if (!ptyPid) return NOWHERE;
  const cwd = processCwd(findDeepestDescendant(ptyPid)) ?? processCwd(ptyPid);
  return { ...NOWHERE, cwd };
}

export function mountCwdRoute(app: Express): void {
  app.get("/api/terminal/cwd", (req, res) => {
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
    res.json(detectCwd(sessionId));
  });
}
