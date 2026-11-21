import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emit = vi.fn();
vi.mock("~/lib/socket", () => ({
  getSocket: () => ({ connected: true, emit, on: vi.fn(), off: vi.fn() }),
  hasSocket: () => true,
}));

const { useTerminalStore } = await import("~/stores/terminalStore");

/**
 * A terminal whose element reports the given box. `display: none` is the
 * zero case: an element with no layout box measures 0 either way, which is
 * what tells a fit apart from a guess.
 */
function seed(box: { offsetWidth: number; offsetHeight: number }) {
  const terminal = { element: box, cols: 96, rows: 30 };
  useTerminalStore.setState({
    sessions: {
      t1: {
        id: "t1",
        name: "tmux",
        status: "connected",
        // biome-ignore lint/suspicious/noExplicitAny: a stub of the two fields the fit reads
        terminal: terminal as any,
        // biome-ignore lint/suspicious/noExplicitAny: ditto
        fitAddon: { fit } as any,
        error: null,
        outputBuffer: [],
        tmuxSession: "work",
        gen: 1,
        cdCwd: "",
      },
    },
  });
}

const fit = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  emit.mockClear();
  fit.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("re-fitting a terminal pane", () => {
  it("measures a pane that is on screen and tells the pty", () => {
    seed({ offsetWidth: 800, offsetHeight: 400 });

    useTerminalStore.getState().refitSession("t1");
    vi.runAllTimers();

    expect(fit).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("terminal_resize", { sessionId: "t1", cols: 96, rows: 30 });
  });

  // The ResizeObserver fires with a zero-sized box as a tab is switched away
  // from. Measuring there proposes about 17x9 — `getComputedStyle` reports the
  // pane's `height: 100%` verbatim once it has no layout box — and pushing that
  // to the pty SIGWINCHed a running full-screen program into a corner.
  it("leaves the pty alone while the pane is not on screen", () => {
    seed({ offsetWidth: 0, offsetHeight: 0 });

    useTerminalStore.getState().refitSession("t1");
    vi.runAllTimers();

    expect(fit).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
