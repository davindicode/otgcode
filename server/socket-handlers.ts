import { execFileSync } from "node:child_process";
import type { Server, Socket } from "socket.io";
import { createPty, killPty, reattachPty, releasePty, resizePty, writePty } from "./pty-manager.js";

interface CreateTerminal {
  sessionId: string;
  cwd?: string;
  tmuxSession?: string;
  /** tmux's own session id (`$7`), which survives a rename. */
  tmuxSessionId?: string;
  /** The pane's measured size, when it has one — see `dimension`. */
  cols?: number;
  rows?: number;
}

/**
 * A size straight off the wire, or undefined to let the PTY use its default.
 * node-pty hands these to the kernel, so a bogus one is worth refusing rather
 * than passing on.
 */
function dimension(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 1000 ? value : undefined;
}

/**
 * How to get back into a tab's tmux session.
 *
 * By id when we have one and it still exists, because a session renamed while
 * this tab was disconnected cannot be recognised any other way — attaching by
 * the old name would silently create a second, empty session beside the real
 * one. By name otherwise, with `-A` so a first connection creates it. An id
 * does not survive a tmux server restart, which the existence check catches.
 */
function tmuxArgs(name: string, id?: string): string[] {
  if (id && /^\$\d{1,10}$/.test(id)) {
    try {
      execFileSync("tmux", ["has-session", "-t", id], { timeout: 3000, stdio: "ignore" });
      return ["attach-session", "-t", id];
    } catch {
      // Gone, or a different tmux server than the one that issued it.
    }
  }
  return ["new", "-A", "-s", name];
}

export function registerSocketHandlers(io: Server): void {
  io.on("connection", (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Track sessions owned by this socket for cleanup
    const ownedSessions = new Set<string>();

    socket.on("create_terminal", (data: CreateTerminal) => {
      const { sessionId, cwd, tmuxSession } = data;
      console.log(
        `create_terminal: ${sessionId}, cwd: ${cwd || "(default)"}${tmuxSession ? `, tmux: ${tmuxSession}` : ""}`,
      );
      if (!sessionId) return;

      ownedSessions.add(sessionId);

      // A tmux tab runs tmux as its process rather than a shell that then
      // attaches. `new -A` attaches if the session exists and creates it
      // otherwise, so a reconnect lands back in the same session instead of a
      // bare shell outside it.
      const tmux = tmuxSession ? { shell: "tmux", args: tmuxArgs(tmuxSession, data.tmuxSessionId) } : {};

      const onData = (output: string) => socket.emit("terminal_output", { sessionId, data: output });
      const onExit = (exitCode: number) => {
        socket.emit("terminal_closed", { sessionId, exitCode });
        ownedSessions.delete(sessionId);
      };

      // A pty whose socket dropped is still running, for a minute. This is the
      // same client asking for the same session, so it gets that pty back
      // along with whatever it said in the meantime, rather than a new shell
      // beside a build that is still going. An empty string is a reattach of
      // something that stayed quiet, so the test is against null.
      const pending = reattachPty(sessionId, socket.id, { onData, onExit });
      if (pending !== null) {
        console.log(`create_terminal: ${sessionId} reattached (${pending.length} chars held)`);
        // Said before the held output, so the client knows not to reset the
        // modes of a screen something is still drawing on.
        socket.emit("terminal_ready", { sessionId, reattached: true });
        if (pending) socket.emit("terminal_output", { sessionId, data: pending });
        return;
      }

      createPty(sessionId, socket.id, {
        ...tmux,
        cwd,
        // tmux holds the session itself, so this pty is a client and not the
        // work. Keeping it alive past its socket would leave a second client
        // attached and tmux with nothing it thinks needs redrawing.
        persistent: !!tmuxSession,
        // Spawning at the pane's real size matters most for tmux: it paints a
        // whole screen the moment it attaches, so a default 80x24 spawn draws
        // 24 rows into a taller pane and leaves the rest blank until a resize
        // arrives to trigger a repaint.
        cols: dimension(data.cols),
        rows: dimension(data.rows),
        onData,
        onExit,
      });

      socket.emit("terminal_ready", { sessionId, reattached: false });
    });

    socket.on("terminal_input", (data: { sessionId: string; data: string }) => {
      if (data.sessionId && data.data) {
        writePty(data.sessionId, socket.id, data.data);
      }
    });

    socket.on("terminal_resize", (data: { sessionId: string; cols: number; rows: number }) => {
      const cols = dimension(data.cols);
      const rows = dimension(data.rows);
      // Dropped rather than clamped: a size this far off is a measurement that
      // went wrong, and guessing a replacement would resize the pty to
      // something the pane never was.
      if (!data.sessionId || !cols || !rows) return;
      resizePty(data.sessionId, socket.id, cols, rows);
    });

    socket.on("close_terminal", (data: { sessionId: string }) => {
      if (data.sessionId) {
        killPty(data.sessionId, socket.id);
        ownedSessions.delete(data.sessionId);
      }
    });

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
      for (const sessionId of ownedSessions) {
        // A dropped connection is usually about to come back, and taking the
        // shell with it meant a walk past a dead spot killed whatever was
        // running — so an ephemeral pty is held for a grace period rather than
        // killed. A tmux one is killed, because tmux is already the thing that
        // survives; the manager decides which this is.
        //
        // Still by owner: a reconnect may already have taken this id over with
        // a new socket, and a late disconnect must not touch that.
        releasePty(sessionId, socket.id);
      }
      ownedSessions.clear();
    });
  });
}
