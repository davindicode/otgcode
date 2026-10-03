import type { Server, Socket } from "socket.io";
import { createPty, killPty, resizePty, writePty } from "./pty-manager.js";

interface CreateTerminal {
  sessionId: string;
  cwd?: string;
  tmuxSession?: string;
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
      const tmux = tmuxSession ? { shell: "tmux", args: ["new", "-A", "-s", tmuxSession] } : {};

      createPty(sessionId, socket.id, {
        ...tmux,
        cwd,
        // Spawning at the pane's real size matters most for tmux: it paints a
        // whole screen the moment it attaches, so a default 80x24 spawn draws
        // 24 rows into a taller pane and leaves the rest blank until a resize
        // arrives to trigger a repaint.
        cols: dimension(data.cols),
        rows: dimension(data.rows),
        onData: (output) => {
          socket.emit("terminal_output", { sessionId, data: output });
        },
        onExit: (exitCode) => {
          socket.emit("terminal_closed", { sessionId, exitCode });
          ownedSessions.delete(sessionId);
        },
      });

      socket.emit("terminal_ready", { sessionId });
    });

    socket.on("terminal_input", (data: { sessionId: string; data: string }) => {
      if (data.sessionId && data.data) {
        writePty(data.sessionId, socket.id, data.data);
      }
    });

    socket.on("terminal_resize", (data: { sessionId: string; cols: number; rows: number }) => {
      if (data.sessionId) {
        resizePty(data.sessionId, socket.id, data.cols, data.rows);
      }
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
        // A reconnect may already have replaced this ID with a PTY owned by a
        // new socket. Owner checking prevents stale disconnect cleanup from
        // killing that replacement.
        killPty(sessionId, socket.id);
      }
      ownedSessions.clear();
    });
  });
}
