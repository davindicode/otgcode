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
  write.mockClear();
  emit.mockClear();
  useTerminalStore.getState().initSocket();
});

describe("a pty handed back after a drop", () => {
  it("is left to carry on, with nothing written over it", () => {
    // The same shell, still running, mid-draw in whatever it was drawing. A
    // greeting or a mode reset lands inside that.
    seed(undefined);

    handlers.terminal_ready({ sessionId: "t1", reattached: true });

    expect(write).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().sessions.t1.status).toBe("connected");
  });

  it("greets a fresh pty and resets its modes", () => {
    seed(undefined);

    handlers.terminal_ready({ sessionId: "t1", reattached: false });

    const written = write.mock.calls[0][0] as string;
    expect(written).toContain("Connected!");
    // Out of the alternate screen: this is a new shell, not the old one.
    expect(written).toContain("\x1b[?1049l");
  });
});
