import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emit = vi.fn();
vi.mock("~/lib/socket", () => ({
  getSocket: () => ({ connected: true, emit, on: vi.fn(), off: vi.fn() }),
  hasSocket: () => true,
}));

const { useTerminalStore } = await import("~/stores/terminalStore");

const paste = vi.fn();

/** A session with or without the terminal that decides the paste markers. */
function seed(withTerminal: boolean) {
  useTerminalStore.setState({
    sessions: {
      t1: {
        id: "t1",
        name: "shell",
        status: "connected",
        // biome-ignore lint/suspicious/noExplicitAny: a stub of the one method this path calls
        terminal: withTerminal ? ({ paste } as any) : null,
        fitAddon: null,
        error: null,
        outputBuffer: [],
        gen: 1,
        cdCwd: "",
      },
    },
  });
}

beforeEach(() => {
  emit.mockClear();
  paste.mockClear();
});
afterEach(() => useTerminalStore.setState({ sessions: {} }));

describe("sending text the user wrote", () => {
  // The whole point: xterm.js brackets it, and only when the program asked for
  // bracketing. Building the markers here would send them to a program that
  // never asked, which prints them.
  it("hands it to the terminal rather than down the keystroke path", () => {
    seed(true);

    useTerminalStore.getState().pasteInput("t1", "why is the z score so high!!");

    expect(paste).toHaveBeenCalledWith("why is the z score so high!!");
    expect(emit).not.toHaveBeenCalled();
  });

  // The Enter has to be a write of its own: inside the paste markers it is a
  // newline in the draft, and in the same write as the text a coding CLI does
  // not take it as a send at all. See `slashCmds`.
  it("runs a command line as the text first, then Enter", () => {
    seed(true);

    useTerminalStore.getState().runInput("t1", "cd '/tmp/why not!'");

    expect(paste).toHaveBeenCalledWith("cd '/tmp/why not!'");
    expect(emit).toHaveBeenCalledWith("terminal_input", { sessionId: "t1", data: "\r" });
    expect(paste.mock.invocationCallOrder[0]).toBeLessThan(emit.mock.invocationCallOrder[0]);
  });

  it("falls back to the socket when there is no terminal to ask", () => {
    seed(false);

    useTerminalStore.getState().pasteInput("t1", "ls");

    expect(emit).toHaveBeenCalledWith("terminal_input", { sessionId: "t1", data: "ls" });
  });
});
