import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { useAuthStore } from "~/stores/authStore";
import { watchForExpiredSession } from "./api";

/**
 * The watcher wraps `fetch` once per page, so the stub goes in first and the
 * watcher wraps that; each case then steers the stub rather than reinstalling.
 */
let status = 200;
let installed: typeof window.fetch;

beforeAll(() => {
  window.fetch = (async () =>
    new Response(JSON.stringify({ error: "Authentication required" }), { status })) as typeof fetch;
  watchForExpiredSession();
  installed = window.fetch;
});

afterEach(() => {
  status = 200;
  useAuthStore.setState({ enabled: false, authenticated: true });
});

const locked = () => useAuthStore.getState().enabled && !useAuthStore.getState().authenticated;

describe("watchForExpiredSession", () => {
  it("shows the lock screen when any API call reports an expired session", async () => {
    status = 401;
    await fetch("/api/files/list?dir=/tmp");
    expect(locked()).toBe(true);
  });

  it("leaves the response untouched, so callers are unaffected", async () => {
    status = 401;
    const res = await fetch("/api/files/list");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Authentication required" });
  });

  it("does not treat a refused password as an expired session", async () => {
    // /api/auth/login answers 401 for a wrong password, which is not this.
    status = 401;
    await fetch("/api/auth/login");
    expect(locked()).toBe(false);
  });

  it("ignores a 401 from somewhere that is not our own API", async () => {
    status = 401;
    await fetch("https://example.com/api/thing");
    expect(locked()).toBe(false);
  });

  it("ignores any other status", async () => {
    status = 403;
    await fetch("/api/files/list");
    expect(locked()).toBe(false);
  });

  it("wraps fetch only once, however many times it is called", () => {
    watchForExpiredSession();
    watchForExpiredSession();
    expect(window.fetch).toBe(installed);
  });
});
