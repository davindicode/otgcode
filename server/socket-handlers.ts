import type { Server, Socket } from "socket.io";
import { createPty, writePty, resizePty, killPty } from "./pty-manager.js";

export function registerSocketHandlers(io: Server): void {
  io.on("connection", (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Track sessions owned by this socket for cleanup
    const ownedSessions = new Set<string>();

    socket.on("create_terminal", (data: { sessionId: string; cwd?: string }) => {
      const { sessionId, cwd } = data;
      console.log(`create_terminal: ${sessionId}, cwd: ${cwd || "(default)"}`);
      if (!sessionId) return;

      ownedSessions.add(sessionId);

      createPty(sessionId, {
        cwd,
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
        writePty(data.sessionId, data.data);
      }
    });

    socket.on("terminal_resize", (data: { sessionId: string; cols: number; rows: number }) => {
      if (data.sessionId) {
        resizePty(data.sessionId, data.cols, data.rows);
      }
    });

    socket.on("close_terminal", (data: { sessionId: string }) => {
      if (data.sessionId) {
        killPty(data.sessionId);
        ownedSessions.delete(data.sessionId);
      }
    });

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
      for (const sessionId of ownedSessions) {
        killPty(sessionId);
      }
      ownedSessions.clear();
    });
  });
}
