import { describe, expect, it } from "vitest";
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_PANE_SPLIT,
  defaultWorkspace,
  MAX_FONT_SIZE,
  MAX_PANE_SPLIT,
  MIN_FONT_SIZE,
  MIN_PANE_SPLIT,
  sanitize,
} from "./workspace.shared";

describe("sanitize", () => {
  it("falls back to defaults for junk input", () => {
    expect(sanitize(null)).toEqual(defaultWorkspace());
    expect(sanitize("nope")).toEqual(defaultWorkspace());
    expect(sanitize(42)).toEqual(defaultWorkspace());
    expect(sanitize({})).toEqual(defaultWorkspace());
  });

  it("clamps the pane split into a usable range", () => {
    expect(sanitize({ paneSplit: 40 }).paneSplit).toBe(40);
    expect(sanitize({ paneSplit: 0 }).paneSplit).toBe(MIN_PANE_SPLIT);
    expect(sanitize({ paneSplit: 999 }).paneSplit).toBe(MAX_PANE_SPLIT);
    // Non-numbers keep the previous value rather than clamping to the minimum.
    expect(sanitize({ paneSplit: "wide" }).paneSplit).toBe(DEFAULT_PANE_SPLIT);
    expect(sanitize({ paneSplit: Number.NaN }).paneSplit).toBe(DEFAULT_PANE_SPLIT);
    expect(sanitize({ paneSplit: null }).paneSplit).toBe(DEFAULT_PANE_SPLIT);
    expect(sanitize({ paneSplit: true }).paneSplit).toBe(DEFAULT_PANE_SPLIT);
  });

  it("clamps the font size", () => {
    expect(sanitize({ fontSize: 14 }).fontSize).toBe(14);
    expect(sanitize({ fontSize: 1 }).fontSize).toBe(MIN_FONT_SIZE);
    expect(sanitize({ fontSize: 400 }).fontSize).toBe(MAX_FONT_SIZE);
    expect(sanitize({ fontSize: null }).fontSize).toBe(DEFAULT_FONT_SIZE);
  });

  it("only accepts known themes", () => {
    expect(sanitize({ theme: "light" }).theme).toBe("light");
    expect(sanitize({ theme: "dark" }).theme).toBe("dark");
    expect(sanitize({ theme: "solarized" }).theme).toBe("dark");
  });

  it("keeps well-formed tabs and drops malformed ones", () => {
    const result = sanitize({
      files: {
        tabs: [
          { id: "a", name: "Explorer 1", cwd: "/home/me" },
          { id: "", name: "no id", cwd: "/" },
          { id: "a", name: "duplicate", cwd: "/" },
          "not an object",
          null,
        ],
        activeId: "a",
      },
    });
    expect(result.files.tabs).toEqual([{ id: "a", name: "Explorer 1", cwd: "/home/me" }]);
    expect(result.files.activeId).toBe("a");
  });

  it("drops an activeId that no longer matches a tab", () => {
    const result = sanitize({ terminals: { tabs: [{ id: "t1", name: "1", cwd: "/" }], activeId: "gone" } });
    expect(result.terminals.activeId).toBeNull();
  });

  it("caps tab count and string length so the file can't grow without bound", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ id: `t${i}`, name: "x", cwd: "/" }));
    expect(sanitize({ files: { tabs: many, activeId: null } }).files.tabs.length).toBe(24);
    const long = sanitize({ files: { tabs: [{ id: "a", name: "n", cwd: "/".repeat(10_000) }], activeId: null } });
    expect(long.files.tabs[0].cwd.length).toBe(4096);
  });

  it("merges a partial update onto the existing state", () => {
    const base = sanitize({
      theme: "light",
      paneSplit: 40,
      fontSize: 12,
      files: { tabs: [{ id: "f1", name: "Explorer", cwd: "/tmp" }], activeId: "f1" },
    });
    const merged = sanitize({ paneSplit: 55 }, base);
    expect(merged.paneSplit).toBe(55);
    // Untouched keys survive the patch.
    expect(merged.theme).toBe("light");
    expect(merged.fontSize).toBe(12);
    expect(merged.files.tabs).toEqual([{ id: "f1", name: "Explorer", cwd: "/tmp" }]);
    expect(merged.files.activeId).toBe("f1");
  });

  it("lets an explicit empty tab list clear the tabs", () => {
    const base = sanitize({ files: { tabs: [{ id: "f1", name: "e", cwd: "/" }], activeId: "f1" } });
    expect(sanitize({ files: { tabs: [], activeId: null } }, base).files.tabs).toEqual([]);
  });
});
