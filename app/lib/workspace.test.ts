import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_FONT_SIZE,
  DEFAULT_FONT_SIZE,
  defaultWorkspace,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  sanitize,
  type WorkspaceTab,
} from "./workspace.shared";

const tab = (over: Partial<WorkspaceTab> = {}): WorkspaceTab => ({
  id: "t1",
  kind: "terminal",
  title: "Terminal 1",
  cwd: "/home/me",
  path: "",
  openedFrom: "",
  ...over,
});

describe("sanitize", () => {
  it("falls back to defaults for junk input", () => {
    expect(sanitize(null)).toEqual(defaultWorkspace());
    expect(sanitize("nope")).toEqual(defaultWorkspace());
    expect(sanitize(42)).toEqual(defaultWorkspace());
    expect(sanitize({})).toEqual(defaultWorkspace());
  });

  it("clamps the font size, ignoring non-numbers", () => {
    expect(sanitize({ fontSize: 14 }).fontSize).toBe(14);
    expect(sanitize({ fontSize: 1 }).fontSize).toBe(MIN_FONT_SIZE);
    expect(sanitize({ fontSize: 400 }).fontSize).toBe(MAX_FONT_SIZE);
    // Number(null) is 0 and Number(true) is 1 — neither should clamp to the min.
    expect(sanitize({ fontSize: null }).fontSize).toBe(DEFAULT_FONT_SIZE);
    expect(sanitize({ fontSize: true }).fontSize).toBe(DEFAULT_FONT_SIZE);
    expect(sanitize({ fontSize: "12" }).fontSize).toBe(DEFAULT_FONT_SIZE);
  });

  it("only accepts known themes", () => {
    expect(sanitize({ theme: "light" }).theme).toBe("light");
    expect(sanitize({ theme: "dark" }).theme).toBe("dark");
    expect(sanitize({ theme: "solarized" }).theme).toBe("dark");
  });

  it("keeps well-formed tabs of every kind", () => {
    const result = sanitize({
      tabs: [
        tab(),
        tab({ id: "e1", kind: "explorer", title: "Explorer 1", cwd: "/tmp" }),
        tab({ id: "v1", kind: "viewer", title: "main.ts", cwd: "", path: "/tmp/main.ts" }),
      ],
      activeId: "e1",
    });
    expect(result.tabs.map((t) => t.kind)).toEqual(["terminal", "explorer", "viewer"]);
    expect(result.activeId).toBe("e1");
  });

  it("drops malformed tabs", () => {
    const result = sanitize({
      tabs: [
        tab(),
        tab({ id: "" }),
        tab({ id: "t1" }), // duplicate id
        { ...tab({ id: "x1" }), kind: "wat" },
        "not an object",
        null,
      ],
      activeId: null,
    });
    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0].id).toBe("t1");
  });

  it("drops a viewer tab with no file, since it can't be reopened", () => {
    const result = sanitize({ tabs: [tab({ id: "v1", kind: "viewer", path: "" })], activeId: null });
    expect(result.tabs).toEqual([]);
  });

  it("drops an activeId that matches no tab", () => {
    expect(sanitize({ tabs: [tab()], activeId: "gone" }).activeId).toBeNull();
  });

  it("caps tab count and string length so the file can't grow without bound", () => {
    const many = Array.from({ length: 100 }, (_, i) => tab({ id: `t${i}` }));
    expect(sanitize({ tabs: many, activeId: null }).tabs).toHaveLength(32);
    const long = sanitize({ tabs: [tab({ cwd: "/".repeat(10_000) })], activeId: null });
    expect(long.tabs[0].cwd).toHaveLength(4096);
  });

  it("merges a partial update onto the existing state", () => {
    const base = sanitize({ theme: "light", fontSize: 12, tabs: [tab()], activeId: "t1" });
    const merged = sanitize({ fontSize: 16 }, base);
    expect(merged.fontSize).toBe(16);
    // Untouched keys survive the patch.
    expect(merged.theme).toBe("light");
    expect(merged.tabs).toHaveLength(1);
    expect(merged.activeId).toBe("t1");
  });

  it("lets an explicit empty list close every tab", () => {
    const base = sanitize({ tabs: [tab()], activeId: "t1" });
    const cleared = sanitize({ tabs: [], activeId: null }, base);
    expect(cleared.tabs).toEqual([]);
    expect(cleared.activeId).toBeNull();
  });

  it("clamps the editor font size independently of the terminal's", () => {
    const result = sanitize({ fontSize: 10, editorFontSize: 18 });
    expect(result.fontSize).toBe(10);
    expect(result.editorFontSize).toBe(18);
    expect(sanitize({ editorFontSize: 99 }).editorFontSize).toBe(MAX_FONT_SIZE);
    expect(sanitize({ editorFontSize: "big" }).editorFontSize).toBe(DEFAULT_EDITOR_FONT_SIZE);
  });

  it("keeps well-formed custom commands and drops the rest", () => {
    const result = sanitize({
      customCommands: [
        { label: "deploy", command: "./deploy.sh" },
        { label: "deploy", command: "duplicate label" },
        { label: "", command: "no label" },
        { label: "no command", command: "" },
        "not an object",
      ],
    });
    expect(result.customCommands).toEqual([{ label: "deploy", command: "./deploy.sh" }]);
  });

  it("dedupes hidden command labels and ignores non-strings", () => {
    expect(sanitize({ hiddenCommands: ["ls", "ls", "", 7, "top"] }).hiddenCommands).toEqual(["ls", "top"]);
  });

  it("caps custom commands so the file can't grow without bound", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ label: `c${i}`, command: "x" }));
    expect(sanitize({ customCommands: many }).customCommands).toHaveLength(40);
  });

  it("leaves commands untouched when the patch omits them", () => {
    const base = sanitize({ customCommands: [{ label: "deploy", command: "./deploy.sh" }], hiddenCommands: ["ls"] });
    const merged = sanitize({ fontSize: 12 }, base);
    expect(merged.customCommands).toEqual([{ label: "deploy", command: "./deploy.sh" }]);
    expect(merged.hiddenCommands).toEqual(["ls"]);
  });

  it("keeps the explorer a file was opened from, so grouping survives a reload", () => {
    const result = sanitize({
      tabs: [
        tab({ id: "e1", kind: "explorer", title: "Explorer 1", cwd: "/tmp" }),
        tab({ id: "v1", kind: "viewer", title: "main.ts", path: "/tmp/main.ts", openedFrom: "e1" }),
      ],
      activeId: "v1",
    });
    expect(result.tabs[1].openedFrom).toBe("e1");
  });
});
