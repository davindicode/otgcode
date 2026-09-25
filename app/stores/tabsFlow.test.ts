import { describe, expect, it } from "vitest";
import { useTabsStore } from "~/stores/tabsStore";

// Exercises the real store, so ordering and focus are checked together.
function reset() {
  useTabsStore.setState({ tabs: [], activeId: null });
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
    expect(useTabsStore.getState().activeId).toBe(b);

    // Closing the file returns to the explorer it came from, not the neighbour.
    useTabsStore.getState().close(b);
    expect(useTabsStore.getState().activeId).toBe(e1);
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
    expect(useTabsStore.getState().activeId).toBe(t1);
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
