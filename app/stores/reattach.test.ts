import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers: Record<string, (data: unknown) => void> = {};
const emit = vi.fn();
vi.mock("~/lib/socket", () => ({
  getSocket: () => ({
    connected: true,
    emit,
    on: (event: string, handler: (data: unknown) => void) => {
      handlers[event] = handler;
    },
    off: vi.fn(),
  }),
  hasSocket: () => true,
}));

const apiPost = vi.fn(() => Promise.resolve({}));
vi.mock("~/lib/api", () => ({ apiPost }));

const { useTerminalStore } = await import("~/stores/terminalStore");

const write = vi.fn();

function seed(tmuxSession?: string) {
  useTerminalStore.setState({
    sessions: {
      t1: {
        id: "t1",
        name: tmuxSession ?? "shell",
        status: "connecting",
        // biome-ignore lint/suspicious/noExplicitAny: a stub of the fields the handler touches
        terminal: { write, element: { offsetWidth: 0, offsetHeight: 0 }, cols: 96, rows: 30 } as any,
        fitAddon: null,
        error: null,
        outputBuffer: [],
        tmuxSession,
        gen: 1,
        cdCwd: "",
      },
    },
  });
}

beforeEach(() => {
  apiPost.mockClear();
  write.mockClear();
  emit.mockClear();
  useTerminalStore.getState().initSocket();
});

describe("a pty handed back after a drop", () => {
  it("asks tmux to repaint, because tmux does not know this screen is new", () => {
    // The password screen reloads the page: the pty is still waiting out its
    // grace on the server, but the terminal looking at it has never been drawn
    // into, and tmux sees no reason to redraw a client that never left.
    seed("work");

    handlers.terminal_ready({ sessionId: "t1", reattached: true });

    expect(apiPost).toHaveBeenCalledWith("/api/tmux/sessions", { op: "refresh", name: "work" });
    // Nothing written over whatever it is drawing.
    expect(write).not.toHaveBeenCalled();
  });

  it("says nothing to a plain shell, which has no repaint to ask for", () => {
    seed(undefined);

    handlers.terminal_ready({ sessionId: "t1", reattached: true });

    expect(apiPost).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("greets a fresh pty and resets its modes instead", () => {
    seed("work");

    handlers.terminal_ready({ sessionId: "t1", reattached: false });

    expect(apiPost).not.toHaveBeenCalled();
    const written = write.mock.calls[0][0] as string;
    expect(written).toContain("Connected!");
    // Out of the alternate screen: this is a new shell, not the old one.
    expect(written).toContain("\x1b[?1049l");
  });
});
