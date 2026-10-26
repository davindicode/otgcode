import { describe, expect, it } from "vitest";
import { focusedTabId, type PaneIndex, useTabsStore } from "~/stores/tabsStore";

// Exercises the real store, so ordering and focus are checked together.
function reset() {
  useTabsStore.setState({ tabs: [], activeIds: [null, null], focusedPane: 0 });
}

describe("opening files from an explorer", () => {
  it("lands them beside their explorer and returns focus on close", () => {
    reset();
    const s = useTabsStore.getState();
    const t1 = s.openTerminal();
    const e1 = s.openExplorer();
    const t2 = s.openTerminal();

    // Two files from e1, opened in order.
    const a = useTabsStore.getState().openViewer("/tmp/a.ts", e1);
    const b = useTabsStore.getState().openViewer("/tmp/b.ts", e1);

    expect(useTabsStore.getState().tabs.map((t) => t.id)).toEqual([t1, e1, a, b, t2]);
    expect(focusedTabId(useTabsStore.getState())).toBe(b);

    // Closing the file returns to the explorer it came from, not the neighbour.
    useTabsStore.getState().close(b);
    expect(focusedTabId(useTabsStore.getState())).toBe(e1);
  });

  it("falls back to a neighbour when the origin explorer is gone", () => {
    reset();
    const s = useTabsStore.getState();
    const e1 = s.openExplorer();
    const t1 = s.openTerminal();
    const a = useTabsStore.getState().openViewer("/tmp/a.ts", e1);

    useTabsStore.getState().close(e1);
    useTabsStore.getState().setActive(a);
    useTabsStore.getState().close(a);
    expect(focusedTabId(useTabsStore.getState())).toBe(t1);
  });

  it("focuses an already-open file instead of duplicating it", () => {
    reset();
    const e1 = useTabsStore.getState().openExplorer();
    const a = useTabsStore.getState().openViewer("/tmp/a.ts", e1);
    useTabsStore.getState().setActive(e1);
    const again = useTabsStore.getState().openViewer("/tmp/a.ts", e1);
    expect(again).toBe(a);
    expect(useTabsStore.getState().tabs.filter((t) => t.kind === "viewer")).toHaveLength(1);
  });
});

describe("two panes", () => {
  const paneOf = (id: string): PaneIndex | undefined => useTabsStore.getState().tabs.find((t) => t.id === id)?.pane;

  it("opens a new tab in the pane with the cursor", () => {
    reset();
    useTabsStore.getState().focusPane(1);
    const t = useTabsStore.getState().openTerminal();
    expect(paneOf(t)).toBe(1);
    expect(useTabsStore.getState().activeIds).toEqual([null, t]);
  });

  it("opens a file into its explorer's pane, not the focused one", () => {
    reset();
    const e1 = useTabsStore.getState().openExplorer();
    useTabsStore.getState().focusPane(1);
    useTabsStore.getState().openTerminal();
    const a = useTabsStore.getState().openViewer("/tmp/a.ts", e1);
    expect(paneOf(a)).toBe(0);
  });

  it("shows a moved tab in the pane it arrives in, and backfills the one it left", () => {
    reset();
    const t1 = useTabsStore.getState().openTerminal();
    const t2 = useTabsStore.getState().openTerminal();
    expect(useTabsStore.getState().activeIds).toEqual([t2, null]);

    useTabsStore.getState().moveToPane(t2, 1);
    expect(paneOf(t2)).toBe(1);
    // The left pane falls back to what is left rather than going blank.
    expect(useTabsStore.getState().activeIds).toEqual([t1, t2]);
    expect(useTabsStore.getState().focusedPane).toBe(1);
  });

  it("keeps each pane's active tab independent", () => {
    reset();
    const left = useTabsStore.getState().openTerminal();
    const right = useTabsStore.getState().openTerminal();
    useTabsStore.getState().moveToPane(right, 1);
    useTabsStore.getState().setActive(left);

    expect(useTabsStore.getState().focusedPane).toBe(0);
    // Focusing the left pane must not stop the right one showing its tab.
    expect(useTabsStore.getState().activeIds).toEqual([left, right]);
  });

  it("closes to a neighbour in the same pane, never one the other pane shows", () => {
    reset();
    const a = useTabsStore.getState().openTerminal();
    const b = useTabsStore.getState().openTerminal();
    const c = useTabsStore.getState().openTerminal();
    useTabsStore.getState().moveToPane(c, 1);
    useTabsStore.getState().setActive(b);

    useTabsStore.getState().close(b);
    expect(useTabsStore.getState().activeIds).toEqual([a, c]);
  });

  it("leaves the left pane empty rather than stealing from the right", () => {
    reset();
    const only = useTabsStore.getState().openTerminal();
    const right = useTabsStore.getState().openTerminal();
    useTabsStore.getState().moveToPane(right, 1);

    useTabsStore.getState().close(only);
    expect(useTabsStore.getState().activeIds).toEqual([null, right]);
  });

  it("brings every tab back to one pane when the split is turned off", () => {
    reset();
    const a = useTabsStore.getState().openTerminal();
    const b = useTabsStore.getState().openTerminal();
    useTabsStore.getState().moveToPane(b, 1);

    useTabsStore.getState().mergePanes();
    expect(useTabsStore.getState().tabs.map((t) => t.pane)).toEqual([0, 0]);
    expect(useTabsStore.getState().tabs.map((t) => t.id)).toEqual([a, b]);
    // The pane that had the cursor keeps its tab, so merging does not move you.
    expect(useTabsStore.getState().activeIds).toEqual([b, null]);
    expect(useTabsStore.getState().focusedPane).toBe(0);
  });

  it("restores each pane's own tab, and its first when that one is gone", () => {
    reset();
    const saved = [
      {
        id: "l1",
        kind: "terminal" as const,
        title: "L1",
        cwd: "",
        path: "",
        openedFrom: "",
        tmuxSession: "",
        tmuxSessionId: "",
        pane: 0,
      },
      {
        id: "r1",
        kind: "terminal" as const,
        title: "R1",
        cwd: "",
        path: "",
        openedFrom: "",
        tmuxSession: "",
        tmuxSessionId: "",
        pane: 1,
      },
      {
        id: "r2",
        kind: "terminal" as const,
        title: "R2",
        cwd: "",
        path: "",
        openedFrom: "",
        tmuxSession: "",
        tmuxSessionId: "",
        pane: 1,
      },
    ];
    useTabsStore.getState().restore(saved, ["gone", "r2"], 1);
    expect(useTabsStore.getState().activeIds).toEqual(["l1", "r2"]);
    expect(useTabsStore.getState().focusedPane).toBe(1);
  });
});

describe("dragging a tab between panes", () => {
  it("offers a landing place without moving anything", () => {
    reset();
    const a = useTabsStore.getState().openTerminal();
    const b = useTabsStore.getState().openTerminal();

    useTabsStore.getState().setDrag({ id: b, pane: 1, before: null, index: 1 });
    const state = useTabsStore.getState();
    // Nothing has happened yet: the tab, its order and both panes are as they
    // were. A drag that rearranged the strip as it went was measuring a layout
    // it was changing underneath itself.
    expect(state.tabs.map((t) => t.id)).toEqual([a, b]);
    expect(state.tabs.find((t) => t.id === b)?.pane).toBe(0);
    expect(state.activeIds).toEqual([b, null]);
  });

  it("leaves nothing behind when the drag is abandoned", () => {
    reset();
    const t = useTabsStore.getState().openTerminal();
    useTabsStore.getState().setDrag({ id: t, pane: 1, before: null, index: 0 });
    useTabsStore.getState().setDrag(null);

    const state = useTabsStore.getState();
    expect(state.drag).toBeNull();
    expect(state.tabs.find((x) => x.id === t)?.pane).toBe(0);
    expect(state.activeIds).toEqual([t, null]);
  });

  it("commits the pane and the place in one go when it is let go", () => {
    reset();
    const a = useTabsStore.getState().openTerminal();
    const b = useTabsStore.getState().openTerminal();
    const c = useTabsStore.getState().openTerminal();
    useTabsStore.getState().moveToPane(c, 1);

    // Dropped in front of c, in the right pane — what the caret was showing.
    useTabsStore.getState().moveToPane(a, 1, 1);
    const state = useTabsStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual([b, a, c]);
    expect(state.tabs.find((t) => t.id === a)?.pane).toBe(1);
    expect(state.activeIds).toEqual([b, a]);
  });
});

describe("reopening a file that is already open", () => {
  it("brings its tab to the pane that asked, rather than jumping you to it", () => {
    reset();
    const left = useTabsStore.getState().openExplorer();
    const a = useTabsStore.getState().openViewer("/tmp/a.ts", left);

    // A second explorer in the right pane asks for the same file.
    const right = useTabsStore.getState().openExplorer();
    useTabsStore.getState().moveToPane(right, 1);
    const again = useTabsStore.getState().openViewer("/tmp/a.ts", right);

    expect(again).toBe(a);
    // Still one tab for the file: two editors over it would be two unsaved
    // buffers racing to write it.
    expect(useTabsStore.getState().tabs.filter((t) => t.kind === "viewer")).toHaveLength(1);
    // And it is here, in the pane that asked, not where it was.
    expect(useTabsStore.getState().tabs.find((t) => t.id === a)?.pane).toBe(1);
    expect(useTabsStore.getState().activeIds[1]).toBe(a);
    expect(useTabsStore.getState().focusedPane).toBe(1);
  });
});
