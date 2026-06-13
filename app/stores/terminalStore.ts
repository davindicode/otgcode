import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { create } from "zustand";
import { DEFAULT_FONT_SIZE } from "~/lib/constants";
import { getSocket } from "~/lib/socket";

interface TerminalSession {
  id: string;
  name: string;
  status: "connecting" | "connected" | "error" | "disconnected";
  terminal: Terminal | null;
  fitAddon: FitAddon | null;
  error: string | null;
  outputBuffer: string[];
  inTmux: boolean;
  inEditor: "nano" | "vim" | null;
  cdCwd: string;
}

interface TerminalState {
  sessions: Record<string, TerminalSession>;
  activeSessionId: string | null;
  socketConnected: boolean;
  fontSize: number;
  defaultCwd: string;

  initSocket: () => void;
  createSession: (sessionId: string, name?: string, cwd?: string) => void;
  registerTerminal: (sessionId: string, terminal: Terminal, fitAddon: FitAddon) => void;
  sendInput: (sessionId: string, data: string) => void;
  resizeTerminal: (sessionId: string, rows: number, cols: number) => void;
  closeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string) => void;
  renameSession: (sessionId: string, name: string) => void;
  setFontSize: (size: number) => void;
  setDefaultCwd: (cwd: string) => void;
  setInTmux: (sessionId: string, inTmux: boolean) => void;
  setInEditor: (sessionId: string, editor: "nano" | "vim" | null) => void;
  setCdCwd: (sessionId: string, cwd: string) => void;
}

let socketInitialized = false;

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: {},
  activeSessionId: null,
  socketConnected: false,
  fontSize: DEFAULT_FONT_SIZE,
  defaultCwd: "",

  initSocket: () => {
    if (socketInitialized) return;
    socketInitialized = true;

    const socket = getSocket();

    socket.on("connect", () => {
      set({ socketConnected: true });

      // On reconnect, re-create all existing sessions (server killed PTYs on disconnect)
      const { sessions } = get();
      for (const session of Object.values(sessions)) {
        if (session.status === "disconnected" || session.status === "error") {
          socket.emit("create_terminal", {
            sessionId: session.id,
            cwd: get().defaultCwd || undefined,
          });
          set({
            sessions: {
              ...get().sessions,
              [session.id]: { ...get().sessions[session.id], status: "connecting", inTmux: false, inEditor: null },
            },
          });
        }
      }
    });

    socket.on("disconnect", () => {
      set({ socketConnected: false });
      // Mark all sessions as disconnected
      const { sessions } = get();
      const updated: Record<string, (typeof sessions)[string]> = {};
      for (const [id, session] of Object.entries(sessions)) {
        updated[id] = { ...session, status: "disconnected" };
      }
      set({ sessions: updated });
    });

    socket.on("terminal_ready", (data: { sessionId: string }) => {
      const { sessions } = get();
      const session = sessions[data.sessionId];
      if (!session) return;

      const connectedMsg = "\x1b[1;32mConnected!\x1b[0m\r\n";
      if (session.terminal) {
        session.terminal.write(connectedMsg);
      }
      set({
        sessions: {
          ...sessions,
          [data.sessionId]: {
            ...session,
            status: "connected",
            outputBuffer: session.terminal ? session.outputBuffer : [...session.outputBuffer, connectedMsg],
          },
        },
      });
    });

    socket.on("terminal_output", (data: { sessionId: string; data: string }) => {
      const { sessions } = get();
      const session = sessions[data.sessionId];
      if (!session) return;

      if (session.terminal) {
        session.terminal.write(data.data);
      } else {
        set({
          sessions: {
            ...sessions,
            [data.sessionId]: {
              ...session,
              outputBuffer: [...session.outputBuffer, data.data],
            },
          },
        });
      }
    });

    socket.on("terminal_error", (data: { sessionId: string; error: string }) => {
      const { sessions } = get();
      const session = sessions[data.sessionId];
      if (!session) return;

      const errorMsg = "\r\n\x1b[1;31mError: " + data.error + "\x1b[0m";
      if (session.terminal) {
        session.terminal.write(errorMsg);
      }
      set({
        sessions: {
          ...sessions,
          [data.sessionId]: {
            ...session,
            status: "error",
            error: data.error,
            outputBuffer: session.terminal ? session.outputBuffer : [...session.outputBuffer, errorMsg],
          },
        },
      });
    });

    socket.on("terminal_closed", (data: { sessionId: string; exitCode: number }) => {
      const { sessions } = get();
      const session = sessions[data.sessionId];
      if (!session) return;

      const msg = "\r\n\x1b[1;33mSession closed (exit " + data.exitCode + ").\x1b[0m";
      if (session.terminal) {
        session.terminal.write(msg);
      }
      set({
        sessions: {
          ...sessions,
          [data.sessionId]: { ...session, status: "disconnected" },
        },
      });
    });
  },

  createSession: (sessionId, name, cwd) => {
    const { sessions } = get();
    const socket = getSocket();

    set({
      sessions: {
        ...sessions,
        [sessionId]: {
          id: sessionId,
          name: name || `Terminal ${Object.keys(sessions).length + 1}`,
          status: "connecting",
          terminal: null,
          fitAddon: null,
          error: null,
          outputBuffer: [],
          inTmux: false,
          inEditor: null,
          cdCwd: "",
        },
      },
      activeSessionId: sessionId,
    });

    socket.emit("create_terminal", { sessionId, cwd: cwd || get().defaultCwd || undefined });
  },

  registerTerminal: (sessionId, terminal, fitAddon) => {
    const { sessions } = get();
    const session = sessions[sessionId];
    if (!session) return;

    // Flush buffered output
    for (const data of session.outputBuffer) {
      terminal.write(data);
    }

    set({
      sessions: {
        ...sessions,
        [sessionId]: { ...session, terminal, fitAddon, outputBuffer: [] },
      },
    });
  },

  sendInput: (sessionId, data) => {
    const socket = getSocket();
    if (socket.connected) {
      socket.emit("terminal_input", { sessionId, data });
    }
  },

  resizeTerminal: (sessionId, rows, cols) => {
    const socket = getSocket();
    if (socket.connected) {
      socket.emit("terminal_resize", { sessionId, cols, rows });
    }
  },

  closeSession: (sessionId) => {
    const { sessions, activeSessionId } = get();
    const session = sessions[sessionId];
    if (!session) return;

    const socket = getSocket();
    socket.emit("close_terminal", { sessionId });

    if (session.terminal) {
      session.terminal.dispose();
    }

    const newSessions = { ...sessions };
    delete newSessions[sessionId];

    const remainingIds = Object.keys(newSessions);
    const newActiveId =
      activeSessionId === sessionId
        ? remainingIds.length > 0
          ? remainingIds[remainingIds.length - 1]
          : null
        : activeSessionId;

    set({ sessions: newSessions, activeSessionId: newActiveId });
  },

  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId });
    const { sessions } = get();
    const session = sessions[sessionId];
    if (session?.fitAddon && session.terminal) {
      setTimeout(() => session.fitAddon!.fit(), 50);
    }
  },

  renameSession: (sessionId, name) => {
    const { sessions } = get();
    const session = sessions[sessionId];
    if (!session) return;
    set({
      sessions: { ...sessions, [sessionId]: { ...session, name } },
    });
  },

  setFontSize: (size) => {
    set({ fontSize: size });
    // Apply to all existing terminal instances
    const { sessions } = get();
    for (const session of Object.values(sessions)) {
      if (session.terminal) {
        session.terminal.options.fontSize = size;
        if (session.fitAddon) {
          session.fitAddon.fit();
          const socket = getSocket();
          if (socket.connected) {
            socket.emit("terminal_resize", {
              sessionId: session.id,
              cols: session.terminal.cols,
              rows: session.terminal.rows,
            });
          }
        }
      }
    }
  },
  setDefaultCwd: (cwd) => set({ defaultCwd: cwd }),
  setInTmux: (sessionId, inTmux) => {
    const { sessions } = get();
    const session = sessions[sessionId];
    if (!session) return;
    set({ sessions: { ...sessions, [sessionId]: { ...session, inTmux } } });
  },
  setInEditor: (sessionId, editor) => {
    const { sessions } = get();
    const session = sessions[sessionId];
    if (!session) return;
    set({ sessions: { ...sessions, [sessionId]: { ...session, inEditor: editor } } });
  },
  setCdCwd: (sessionId, cwd) => {
    const { sessions } = get();
    const session = sessions[sessionId];
    if (!session) return;
    set({ sessions: { ...sessions, [sessionId]: { ...session, cdCwd: cwd } } });
  },
}));
