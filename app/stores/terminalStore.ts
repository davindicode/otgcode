import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { create } from "zustand";
import { DEFAULT_FONT_SIZE } from "~/lib/constants";
import { getSocket } from "~/lib/socket";
import { useAuthStore } from "./authStore";
import { useWorkspaceStore } from "./workspaceStore";

interface TerminalSession {
  id: string;
  name: string;
  status: "connecting" | "connected" | "error" | "disconnected";
  terminal: Terminal | null;
  fitAddon: FitAddon | null;
  error: string | null;
  outputBuffer: string[];
  /** Set when this terminal *is* a tmux session rather than a shell. */
  tmuxSession?: string;
  cdCwd: string;
}

interface TerminalState {
  sessions: Record<string, TerminalSession>;
  activeSessionId: string | null;
  socketConnected: boolean;
  fontSize: number;
  defaultCwd: string;

  initSocket: () => void;
  createSession: (sessionId: string, name?: string, cwd?: string, tmuxSession?: string) => void;
  registerTerminal: (sessionId: string, terminal: Terminal, fitAddon: FitAddon) => void;
  sendInput: (sessionId: string, data: string) => void;
  resizeTerminal: (sessionId: string, rows: number, cols: number) => void;
  closeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string) => void;
  renameSession: (sessionId: string, name: string) => void;
  setFontSize: (size: number) => void;
  setDefaultCwd: (cwd: string) => void;
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
        if (session.status !== "connected") {
          set({
            sessions: {
              ...get().sessions,
              [session.id]: { ...get().sessions[session.id], status: "connecting" },
            },
          });
          socket.emit("create_terminal", {
            sessionId: session.id,
            cwd: get().defaultCwd || undefined,
            // The whole point of a tmux tab: reconnecting re-attaches rather
            // than leaving you in a fresh shell outside the session.
            tmuxSession: session.tmuxSession,
            // The pane has been on screen since before the drop, so its size
            // is known here. Spawning the PTY at it means tmux's first paint
            // already fills the pane, instead of drawing 80x24 and waiting for
            // a resize to repaint the rest.
            cols: session.terminal?.cols,
            rows: session.terminal?.rows,
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
        // Tmux and full-screen editors can leave xterm input modes enabled.
        // Disable mouse/focus/paste reporting without clearing scrollback; the
        // replacement PTY is a plain shell and must not inherit those modes.
        session.terminal?.write("\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1004l\x1b[?1006l\x1b[?2004l");
        updated[id] = { ...session, status: "disconnected" };
      }
      set({ sessions: updated });
    });

    // The server rejects the handshake when the access password is on and the
    // session cookie is missing or stale (expired, or invalidated by a password
    // change). Surface the lock screen instead of retrying forever.
    socket.on("connect_error", (err: Error) => {
      if (err?.message === "unauthorized") useAuthStore.getState().lock();
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

      // The PTY is spawned at 80x24 and the server drops a resize for a session
      // it hasn't created yet, so a terminal that measured itself before the
      // PTY existed never got its real size across. A shell reflows at its next
      // prompt and hides it; tmux paints a whole screen the moment it attaches,
      // so a tmux tab sat drawn at 80x24 until some unrelated layout change
      // resized the pane. Push the size here, where the PTY is known to exist.
      if (session.terminal) {
        // A no-op while this tab is hidden: the fit addon can't measure a
        // display:none pane. It re-fits from its ResizeObserver when shown.
        session.fitAddon?.fit();
        socket.emit("terminal_resize", {
          sessionId: data.sessionId,
          cols: session.terminal.cols,
          rows: session.terminal.rows,
        });
      }
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

  createSession: (sessionId, name, cwd, tmuxSession) => {
    const { sessions } = get();
    const socket = getSocket();

    set({
      sessions: {
        ...sessions,
        [sessionId]: {
          id: sessionId,
          name: name || `Terminal ${Object.keys(sessions).length + 1}`,
          status: socket.connected ? "connecting" : "disconnected",
          terminal: null,
          fitAddon: null,
          error: null,
          outputBuffer: [],
          tmuxSession,
          cdCwd: "",
        },
      },
      activeSessionId: sessionId,
    });

    // Socket.IO buffers emits while offline. Avoid buffering this create because
    // the connect handler owns recreation and would otherwise create it twice.
    if (socket.connected) {
      socket.emit("create_terminal", { sessionId, cwd: cwd || get().defaultCwd || undefined, tmuxSession });
    }
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
    const session = get().sessions[sessionId];
    if (socket.connected && session?.status === "connected") {
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
    useWorkspaceStore.getState().setFontSize(size);
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
  setCdCwd: (sessionId, cwd) => {
    const { sessions } = get();
    const session = sessions[sessionId];
    if (!session) return;
    set({ sessions: { ...sessions, [sessionId]: { ...session, cdCwd: cwd } } });
  },
}));
