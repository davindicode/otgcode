import type { Server as SocketIOServer } from "socket.io";
import { describe, expect, it } from "vitest";
import { activeSession, claimSession, gatePresence, releaseSession } from "./presence";

/** The lock is module state, so each case starts from an empty one. */
function reset() {
  const held = activeSession();
  if (held) releaseSession(held.socketId);
}

describe("claimSession", () => {
  it("admits the first device", () => {
    reset();
    expect(claimSession("phone", "s1")).toEqual({ ok: true, displaced: null });
    expect(activeSession()?.deviceId).toBe("phone");
  });

  it("refuses a second device and says who has it", () => {
    reset();
    claimSession("phone", "s1", { now: 1000 });
    const result = claimSession("laptop", "s2");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.holder).toMatchObject({ deviceId: "phone", since: 1000 });
    // The refused connection must not have taken the lock.
    expect(activeSession()?.socketId).toBe("s1");
  });

  it("lets the same device reclaim without asking", () => {
    reset();
    claimSession("phone", "s1");
    // A refresh or a dropped tunnel: new socket, same browser.
    expect(claimSession("phone", "s2")).toEqual({ ok: true, displaced: "s1" });
    expect(activeSession()?.socketId).toBe("s2");
  });

  it("hands the lock over when a second device insists", () => {
    reset();
    claimSession("phone", "s1");
    expect(claimSession("laptop", "s2", { takeover: true })).toEqual({ ok: true, displaced: "s1" });
    expect(activeSession()?.deviceId).toBe("laptop");
  });

  it("treats a device that cannot identify itself as a new one each time", () => {
    reset();
    claimSession("", "s1");
    // Two blank ids must not match each other, or private windows would
    // silently displace one another.
    expect(claimSession("", "s2").ok).toBe(false);
  });

  it("frees the lock only for the socket that holds it", () => {
    reset();
    claimSession("phone", "s1");
    releaseSession("someone-else");
    expect(activeSession()?.socketId).toBe("s1");
    releaseSession("s1");
    expect(activeSession()).toBeNull();
    // And then anyone may take it.
    expect(claimSession("laptop", "s2")).toEqual({ ok: true, displaced: null });
  });
});

describe("a holder whose socket is no longer on the server", () => {
  /** Enough of a Socket.IO server to answer the liveness check. */
  function connected(has: (id: string) => boolean) {
    gatePresence({ use: () => {}, sockets: { sockets: { has } } } as unknown as SocketIOServer);
  }

  it("is dropped rather than left holding the app shut", () => {
    reset();
    connected((id) => id !== "s1");
    claimSession("phone", "s1");

    // The disconnect handler never ran — a crash, a missed event — and the
    // lock is the only way in, so the stale holder cannot be taken at its
    // word. This is also what `/api/auth/status` leans on: a gate shown to
    // the next device has to be about a device that is actually there.
    expect(activeSession()).toBeNull();
    expect(claimSession("laptop", "s2")).toEqual({ ok: true, displaced: null });

    connected(() => true);
  });
});
