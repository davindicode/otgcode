import { afterEach, describe, expect, it, vi } from "vitest";

const spawned = vi.hoisted(() => [] as MockPty[]);

interface MockPty {
  pid: number;
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  emitData: (data: string) => void;
  emitExit: (exitCode?: number) => void;
}

vi.mock("node-pty", () => ({
  spawn: vi.fn(() => {
    let dataHandler = (_data: string) => {};
    let exitHandler = (_event: { exitCode: number }) => {};
    const proc: MockPty & {
      onData: (handler: (data: string) => void) => void;
      onExit: (handler: (event: { exitCode: number }) => void) => void;
    } = {
      pid: spawned.length + 1,
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: (handler) => {
        dataHandler = handler;
      },
      onExit: (handler) => {
        exitHandler = handler;
      },
      emitData: (data) => dataHandler(data),
      emitExit: (exitCode = 0) => exitHandler({ exitCode }),
    };
    spawned.push(proc);
    return proc;
  }),
}));

import { createPty, detachPty, getSessionIds, killPty, reattachPty, resizePty, writePty } from "./pty-manager";

afterEach(() => {
  for (const sessionId of getSessionIds()) killPty(sessionId);
  spawned.length = 0;
  // The grace-period cases run on fake timers; leaving them installed would
  // quietly change what every test after them is measuring.
  vi.useRealTimers();
});

describe("PTY ownership across reconnects", () => {
  it("does not let stale exit callbacks remove a replacement PTY", () => {
    const oldData = vi.fn();
    const oldExit = vi.fn();
    const newData = vi.fn();
    const newExit = vi.fn();

    createPty("terminal-1", "old-socket", { onData: oldData, onExit: oldExit });
    const oldPty = spawned[0];
    createPty("terminal-1", "new-socket", { onData: newData, onExit: newExit });
    const newPty = spawned[1];

    expect(oldPty.kill).toHaveBeenCalledOnce();
    oldPty.emitData("stale output");
    oldPty.emitExit(0);
    writePty("terminal-1", "new-socket", "input");

    expect(oldData).not.toHaveBeenCalled();
    expect(oldExit).not.toHaveBeenCalled();
    expect(newPty.write).toHaveBeenCalledWith("input");
    expect(getSessionIds()).toEqual(["terminal-1"]);
  });

  it("rejects input, resize, and cleanup from a stale socket owner", () => {
    createPty("terminal-1", "new-socket", { onData: vi.fn(), onExit: vi.fn() });
    const proc = spawned[0];

    writePty("terminal-1", "old-socket", "stale input");
    resizePty("terminal-1", "old-socket", 120, 40);
    killPty("terminal-1", "old-socket");

    expect(proc.write).not.toHaveBeenCalled();
    expect(proc.resize).not.toHaveBeenCalled();
    expect(proc.kill).not.toHaveBeenCalled();
    expect(getSessionIds()).toEqual(["terminal-1"]);
  });
});

describe("surviving a dropped socket", () => {
  const GRACE_MS = 60_000;

  it("keeps the shell alive, and hands it back with what it said in the meantime", () => {
    vi.useFakeTimers();
    const gone = vi.fn();
    createPty("terminal-1", "old-socket", { onData: gone, onExit: vi.fn() });
    const proc = spawned[0];

    expect(detachPty("terminal-1", "old-socket")).toBe(true);
    proc.emitData("build finished\n");
    // Nobody is reading it, so nothing is delivered — and nothing is lost.
    expect(gone).not.toHaveBeenCalled();
    expect(proc.kill).not.toHaveBeenCalled();

    const onData = vi.fn();
    vi.advanceTimersByTime(GRACE_MS - 1000);
    expect(reattachPty("terminal-1", "new-socket", { onData, onExit: vi.fn() })).toBe("build finished\n");

    // And it is the new socket's now, for both directions.
    proc.emitData("still here");
    writePty("terminal-1", "new-socket", "input");
    expect(onData).toHaveBeenCalledWith("still here");
    expect(proc.write).toHaveBeenCalledWith("input");

    // The grace timer went with the reattach rather than firing later.
    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(proc.kill).not.toHaveBeenCalled();
    expect(getSessionIds()).toEqual(["terminal-1"]);
  });

  it("gives up when nothing comes back for it", () => {
    vi.useFakeTimers();
    createPty("terminal-1", "old-socket", { onData: vi.fn(), onExit: vi.fn() });
    const proc = spawned[0];
    detachPty("terminal-1", "old-socket");

    vi.advanceTimersByTime(GRACE_MS - 1);
    expect(proc.kill).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(proc.kill).toHaveBeenCalledOnce();
    expect(getSessionIds()).toEqual([]);
    // Too late to come back for: the next asker gets told to spawn.
    expect(reattachPty("terminal-1", "new-socket", { onData: vi.fn(), onExit: vi.fn() })).toBeNull();
  });

  it("tells a reattach apart from nothing to reattach to", () => {
    vi.useFakeTimers();
    createPty("terminal-1", "old-socket", { onData: vi.fn(), onExit: vi.fn() });
    detachPty("terminal-1", "old-socket");

    // A pty that stayed quiet reattaches with an empty string, which is not
    // the same answer as "there is nothing here" — one spawns, one does not.
    expect(reattachPty("terminal-1", "new-socket", { onData: vi.fn(), onExit: vi.fn() })).toBe("");
    expect(reattachPty("terminal-2", "new-socket", { onData: vi.fn(), onExit: vi.fn() })).toBeNull();
  });

  it("will not let a late disconnect detach the pty that replaced it", () => {
    vi.useFakeTimers();
    createPty("terminal-1", "old-socket", { onData: vi.fn(), onExit: vi.fn() });
    detachPty("terminal-1", "old-socket");
    reattachPty("terminal-1", "new-socket", { onData: vi.fn(), onExit: vi.fn() });

    // The old socket's cleanup arrives after the reconnect has taken over.
    expect(detachPty("terminal-1", "old-socket")).toBe(false);
    const onData = vi.fn();
    reattachPty("terminal-1", "newer-socket", { onData, onExit: vi.fn() });
    spawned[0].emitData("x");
    // Still attached to the socket that owns it, not buffering for a ghost.
    expect(onData).not.toHaveBeenCalled();
    expect(getSessionIds()).toEqual(["terminal-1"]);
  });

  it("drops the oldest output rather than holding everything a runaway writes", () => {
    vi.useFakeTimers();
    createPty("terminal-1", "old-socket", { onData: vi.fn(), onExit: vi.fn() });
    const proc = spawned[0];
    detachPty("terminal-1", "old-socket");

    proc.emitData("a".repeat(200 * 1024));
    proc.emitData("b".repeat(200 * 1024));
    const pending = reattachPty("terminal-1", "new-socket", { onData: vi.fn(), onExit: vi.fn() }) ?? "";

    // Bounded, and it is the end that was kept: that is the part worth seeing.
    expect(pending.length).toBe(256 * 1024);
    expect(pending.endsWith("b".repeat(1000))).toBe(true);
  });

  it("stops holding a shell that exited while nobody was reading", () => {
    vi.useFakeTimers();
    const onExit = vi.fn();
    createPty("terminal-1", "old-socket", { onData: vi.fn(), onExit });
    const proc = spawned[0];
    detachPty("terminal-1", "old-socket");

    proc.emitExit(0);

    // Nothing to tell and nothing left to reattach to, so it goes now.
    expect(onExit).not.toHaveBeenCalled();
    expect(getSessionIds()).toEqual([]);
    expect(reattachPty("terminal-1", "new-socket", { onData: vi.fn(), onExit: vi.fn() })).toBeNull();
  });

  it("still kills it outright when the tab is closed", () => {
    createPty("terminal-1", "a-socket", { onData: vi.fn(), onExit: vi.fn() });
    const proc = spawned[0];

    killPty("terminal-1", "a-socket");

    expect(proc.kill).toHaveBeenCalledOnce();
    expect(getSessionIds()).toEqual([]);
  });
});
