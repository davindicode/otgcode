import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { create } from "zustand";
import { DEFAULT_FONT_SIZE } from "~/lib/constants";
import { getSocket } from "~/lib/socket";
import { useAuthStore } from "./authStore";
import { usePresenceStore } from "./presenceStore";
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
  /**
   * Which socket connection this session's pty was asked for. Compared against
   * the current one to decide what needs recreating, because `status` is a
   * belief about the server that can be wrong — and a session believed
   * connected with no pty behind it is a tab where nothing works and nothing
   * says why.
   */
  gen: number;
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
  /** Ask for a new pty for a session whose own has gone. */
  restartSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string) => void;
  /** `tmuxSession` moves with the name for a tmux tab: the two are the same thing. */
  renameSession: (sessionId: string, name: string, tmuxSession?: string) => void;
  setFontSize: (size: number) => void;
  setDefaultCwd: (cwd: string) => void;
  setCdCwd: (sessionId: string, cwd: string) => void;
}

let socketInitialized = false;

/**
 * Bumped on every socket connection. A session carries the generation its pty
 * was requested in; anything older has no pty on the server, because the
 * server kills them when their socket goes.
 */
let generation = 0;

/** Asks the server for this session's pty, and records that we did. */
function requestPty(
  sessionId: string,
  get: () => TerminalState,
  set: (partial: Partial<TerminalState>) => void,
  cwd?: string,
): void {
  const socket = getSocket();
  const session = get().sessions[sessionId];
  if (!session || !socket.connected) return;

  set({
    sessions: { ...get().sessions, [sessionId]: { ...session, status: "connecting", gen: generation } },
  });

  socket.emit("create_terminal", {
    sessionId,
    cwd: cwd || get().defaultCwd || undefined,
    // The whole point of a tmux tab: reconnecting re-attaches rather than
    // leaving you in a fresh shell outside the session.
    tmuxSession: session.tmuxSession,
    // The pane has been on screen since before the drop, so its size is known
    // here. Spawning the pty at it means tmux's first paint already fills the
    // pane, instead of drawing 80x24 and waiting for a resize to repaint it.
    cols: session.terminal?.cols,
    rows: session.terminal?.rows,
  });
}

/**
 * Everything a departing pty can leave switched on in the terminal.
 *
 * A full-screen program — opencode, an editor, tmux — runs on the alternate
 * screen with a scroll region, a hidden cursor and its own attributes. Killing
 * its pty sends none of the sequences that would undo that, so the next shell
 * drew its prompt inside the dead program's frame. Scrollback is deliberately
 * kept: this resets modes, it does not wipe what you were looking at.
 */
const RESET_MODES = [
  "\x1b[?1049l", // leave the alternate screen, back to the normal buffer
  "\x1b[!p", // soft reset: scroll region, origin mode, character sets
  "\x1b[?25h", // show the cursor, which a TUI may have hidden
  "\x1b[0m", // drop colours and attributes
  "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l", // mouse reporting
  "\x1b[?1004l", // focus reporting
  "\x1b[?2004l", // bracketed paste
].join("");

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
      generation += 1;
      set({ socketConnected: true });
      usePresenceStore.getState().clear();

      // The server kills a socket's ptys when it goes, so every session from an
      // earlier connection needs a new one. Keying this on the generation
      // rather than on `status` is what makes it reliable: a session left
      // marked "connected" across a drop used to be skipped here, leaving a tab
      // that looked fine, ignored every keystroke, and never redrew.
      for (const session of Object.values(get().sessions)) {
        if (session.gen !== generation) requestPty(session.id, get, set);
      }
    });

    socket.on("disconnect", () => {
      set({ socketConnected: false });
      // Mark all sessions as disconnected
      const { sessions } = get();
      const updated: Record<string, (typeof sessions)[string]> = {};
      for (const [id, session] of Object.entries(sessions)) {
        session.terminal?.write(RESET_MODES);
        updated[id] = { ...session, status: "disconnected" };
      }
      set({ sessions: updated });
    });

    // Two handshake refusals, both of which retrying cannot fix, so each
    // replaces the app with something actionable instead of a spinner:
    // "unauthorized" is a missing or stale session cookie (expired, or
    // invalidated by a password change), and "busy" is another device holding
    // the single app session.
    socket.on("connect_error", (err: Error & { data?: { since?: number } }) => {
      if (err?.message === "unauthorized") {
        useAuthStore.getState().lock();
        return;
      }
      if (err?.message === "busy") {
        usePresenceStore.getState().setBusy(err.data?.since ?? null);
        // Stop the automatic retries; the user decides whether to take over.
        socket.disconnect();
      }
    });

    // Another device took the session. Stand down rather than reconnecting
    // into a tug of war over it.
    socket.on("displaced", () => {
      usePresenceStore.getState().setDisplaced();
      socket.disconnect();
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
          // Not this generation yet: until the pty is asked for, the connect
          // handler is the one that should ask.
          gen: -1,
          cdCwd: "",
        },
      },
      activeSessionId: sessionId,
    });

    // Socket.IO buffers emits made while offline, which would create this twice
    // once the connect handler also asks. Leave it to that handler instead.
    if (socket.connected) requestPty(sessionId, get, set, cwd);
  },

  restartSession: (sessionId) => {
    const session = get().sessions[sessionId];
    if (!session) return;
    session.terminal?.write("\r\n\x1b[2;37mReconnecting…\x1b[0m\r\n");
    requestPty(sessionId, get, set);
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

  renameSession: (sessionId, name, tmuxSession) => {
    const { sessions } = get();
    const session = sessions[sessionId];
    if (!session) return;
    set({
      sessions: {
        ...sessions,
        // Reconnecting re-attaches by this name, so a stale one would land the
        // tab in a brand new session beside the one it was showing.
        [sessionId]: { ...session, name, ...(tmuxSession ? { tmuxSession } : {}) },
      },
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
