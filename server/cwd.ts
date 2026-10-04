import { execFileSync, execSync } from "node:child_process";
import { readFileSync, readlinkSync } from "node:fs";
import type { Express } from "express";
import { getPtyPid } from "./pty-manager.js";

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

function readComm(pid: number): string {
  try {
    return readFileSync(`/proc/${pid}/comm`, "utf-8").trim();
  } catch {
    return "";
  }
}

function readTty(pid: number): string | null {
  try {
    return readlinkSync(`/proc/${pid}/fd/0`);
  } catch {
    return null;
  }
}

function findDeepestDescendant(pid: number, depth = 0): number {
  if (depth > 16) return pid;
  const children = getDirectChildren(pid);
  if (children.length === 0) return pid;
  return findDeepestDescendant(children[children.length - 1], depth + 1);
}

/** Every client on the tmux server, with what each is looking at. */
function listTmuxClients(): { tty: string; session: string; window: string; cwd: string }[] {
  try {
    // TMUX is dropped so this describes the whole server rather than the
    // session the app itself may have been started from.
    const env = { ...process.env };
    delete env.TMUX;
    const format = "#{client_tty}\t#{session_name}\t#{window_index}\t#{pane_current_path}";
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
        const [tty, session, window, cwd] = line.split("\t");
        return { tty, session, window, cwd };
      })
      .filter((client) => client.tty && client.cwd);
  } catch {
    // No tmux, or no server running.
    return [];
  }
}

interface TerminalPlace {
  cwd: string;
  /** Present only for a tab attached to tmux. */
  tmuxSession: string | null;
  /** The window that tab's client is on, which its controls report. */
  tmuxWindow: string | null;
}

function detectCwd(sessionId: string | undefined): TerminalPlace {
  if (sessionId) {
    const ptyPid = getPtyPid(sessionId);
    if (ptyPid) {
      // Ask tmux which pane this tab's own client is looking at.
      //
      // Matching on the client tty rather than asking tmux for "the" active
      // pane: without a client, tmux answers for whichever pane is globally
      // focused, which is wrong as soon as two tabs each have a client. And
      // `display-message -c` turned out not to be enough either — the server
      // may itself be running inside tmux, and the inherited $TMUX then scoped
      // the answer to *that* session instead of the client's. So the env var
      // goes, and the client is found by listing them all.
      //
      // The pty process itself is checked first: a tmux tab runs tmux as its
      // pty rather than a shell that then attaches, so looking only at the
      // pty's children found nothing and every tmux tab reported the default
      // directory. A client started by hand inside a terminal tab is still a
      // child, hence both.
      for (const candidate of [ptyPid, ...getDirectChildren(ptyPid)]) {
        const name = readComm(candidate);
        if (name !== "tmux" && !name.startsWith("tmux:")) continue;
        const tty = readTty(candidate);
        if (!tty || !tty.startsWith("/dev/")) continue;
        const match = listTmuxClients().find((client) => client.tty === tty);
        if (match) return { cwd: match.cwd, tmuxSession: match.session || null, tmuxWindow: match.window || null };
      }

      // No tmux client: walk to the deepest descendant of the PTY and read its cwd.
      try {
        const cwd = readlinkSync(`/proc/${findDeepestDescendant(ptyPid)}/cwd`);
        if (cwd) return { cwd, tmuxSession: null, tmuxWindow: null };
      } catch {}
      try {
        const cwd = readlinkSync(`/proc/${ptyPid}/cwd`);
        if (cwd) return { cwd, tmuxSession: null, tmuxWindow: null };
      } catch {}
    }
  }

  // No pty, or nothing readable from it: the configured default is the best
  // answer available. The caller only asks for terminal tabs, so there is no
  // tmux fallback here — a tmux pane's directory is answered above, from that
  // client specifically, rather than from whichever pane tmux has focused.
  return { cwd: process.env.DEFAULT_CWD || process.env.HOME || "/", tmuxSession: null, tmuxWindow: null };
}

export function mountCwdRoute(app: Express): void {
  app.get("/api/terminal/cwd", (req, res) => {
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
    res.json(detectCwd(sessionId));
  });
}
