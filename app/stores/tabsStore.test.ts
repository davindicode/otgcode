import { describe, expect, it } from "vitest";
import { insertIndexFor, type Tab } from "./tabsStore";

const explorer = (id: string): Tab => ({ id, kind: "explorer", title: id });
const terminal = (id: string): Tab => ({ id, kind: "terminal", title: id });
const viewer = (id: string, openedFrom?: string): Tab => ({
  id,
  kind: "viewer",
  title: id,
  path: `/tmp/${id}`,
  openedFrom,
});

describe("insertIndexFor", () => {
  it("puts a file directly after the explorer it was opened from", () => {
    const tabs = [terminal("t1"), explorer("e1"), terminal("t2")];
    expect(insertIndexFor(tabs, "e1")).toBe(2);
  });

  it("keeps siblings in the order they were opened", () => {
    // e1 already has two files; a third goes after them, not between.
    const tabs = [explorer("e1"), viewer("a", "e1"), viewer("b", "e1"), terminal("t1")];
    expect(insertIndexFor(tabs, "e1")).toBe(3);
  });

  it("does not jump over files belonging to a different explorer", () => {
    const tabs = [explorer("e1"), viewer("a", "e2"), terminal("t1")];
    expect(insertIndexFor(tabs, "e1")).toBe(1);
  });

  it("groups each explorer separately", () => {
    const tabs = [explorer("e1"), viewer("a", "e1"), explorer("e2"), viewer("b", "e2")];
    expect(insertIndexFor(tabs, "e1")).toBe(2);
    expect(insertIndexFor(tabs, "e2")).toBe(4);
  });

  it("falls back to the end when the origin is unknown or already closed", () => {
    const tabs = [explorer("e1"), terminal("t1")];
    expect(insertIndexFor(tabs, undefined)).toBe(2);
    expect(insertIndexFor(tabs, "gone")).toBe(2);
  });

  it("handles an empty strip", () => {
    expect(insertIndexFor([], "e1")).toBe(0);
  });
});
