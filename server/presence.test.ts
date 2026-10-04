import { describe, expect, it } from "vitest";
import { activeSession, claimSession, releaseSession } from "./presence";

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
