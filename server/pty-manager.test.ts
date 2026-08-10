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

import { createPty, getSessionIds, killPty, resizePty, writePty } from "./pty-manager";

afterEach(() => {
  for (const sessionId of getSessionIds()) killPty(sessionId);
  spawned.length = 0;
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
