import { afterEach, describe, expect, it, vi } from "vitest";
import { useTabsStore } from "~/stores/tabsStore";
import { useTerminalStore } from "~/stores/terminalStore";
import { useToastStore } from "~/stores/toastStore";

/** Stands in for /api/tmux/sessions, which is what tmux itself answers for. */
function stubApi(reply: { name?: string; error?: string }, status = 200) {
  const calls: unknown[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    calls.push(JSON.parse(init.body));
    return { ok: status < 400, status, json: async () => reply } as Response;
  });
  return calls;
}

/** A reply that never reached the route: a status, and HTML rather than JSON. */
function stubBrokenApi(status: number) {
  vi.stubGlobal("fetch", async () => {
    return {
      ok: false,
      status,
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    } as unknown as Response;
  });
}

function seedTmuxTab(session: string) {
  useToastStore.setState({ toasts: [] });
  useTabsStore.setState({
    tabs: [{ id: "tab-1", kind: "tmux", title: session, tmuxSession: session }],
    activeId: "tab-1",
  });
  useTerminalStore.setState({
    sessions: {
      "tab-1": {
        id: "tab-1",
        name: session,
        status: "connected",
        terminal: null,
        fitAddon: null,
        error: null,
        outputBuffer: [],
        tmuxSession: session,
        gen: 1,
        cdCwd: "",
      },
    },
  });
}

const tab = () => useTabsStore.getState().tabs[0];
const session = () => useTerminalStore.getState().sessions["tab-1"];
const toasts = () => useToastStore.getState().toasts.map((t) => t.message);

afterEach(() => vi.unstubAllGlobals());

describe("renaming a tmux tab", () => {
  it("renames the session, and keeps the reconnect name with it", async () => {
    seedTmuxTab("work");
    const calls = stubApi({ name: "deploy" });

    await useTabsStore.getState().rename("tab-1", "deploy");

    expect(calls).toEqual([{ op: "rename", name: "work", to: "deploy" }]);
    expect(tab().title).toBe("deploy");
    // Reconnecting attaches by this, so a stale value opens a second session.
    expect(tab().tmuxSession).toBe("deploy");
    expect(session().tmuxSession).toBe("deploy");
    expect(session().name).toBe("deploy");
  });

  it("shows the name tmux settled on, not the one that was typed", async () => {
    seedTmuxTab("work");
    // tmux rewrites `.` to `_`, so the server reports back what now exists.
    stubApi({ name: "has_dot" });

    await useTabsStore.getState().rename("tab-1", "has.dot");

    expect(tab().title).toBe("has_dot");
    expect(tab().tmuxSession).toBe("has_dot");
  });

  it("leaves the tab alone when tmux refuses, and says why", async () => {
    seedTmuxTab("work");
    stubApi({ error: "A session with that name already exists" });

    await useTabsStore.getState().rename("tab-1", "taken");

    expect(tab().title).toBe("work");
    expect(tab().tmuxSession).toBe("work");
    expect(toasts()).toEqual(["A session with that name already exists"]);
  });

  it("treats a reply that never reached the route as a failure", async () => {
    seedTmuxTab("work");
    // An SSR crash or a proxy's error page answers with HTML and no `error`
    // field, which a `data.error` check alone reads as a successful rename.
    stubBrokenApi(502);

    await useTabsStore.getState().rename("tab-1", "deploy");

    expect(tab().title).toBe("work");
    expect(toasts()).toEqual(["Request failed (502)"]);
  });

  it("does not touch tmux for a plain terminal tab", async () => {
    useTabsStore.setState({ tabs: [{ id: "t", kind: "terminal", title: "Terminal 1" }], activeId: "t" });
    const calls = stubApi({ name: "nope" });

    await useTabsStore.getState().rename("t", "builds");

    expect(calls).toEqual([]);
    expect(useTabsStore.getState().tabs[0].title).toBe("builds");
  });
});
