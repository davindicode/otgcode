import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_FONT_SIZE,
  DEFAULT_FONT_SIZE,
  DEFAULT_SPLIT,
  defaultWorkspace,
  MAX_FONT_SIZE,
  MAX_SPLIT,
  MIN_FONT_SIZE,
  MIN_SPLIT,
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
  tmuxSession: "",
  tmuxSessionId: "",
  pane: 0,
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
      activeIds: ["e1", null],
    });
    expect(result.tabs.map((t) => t.kind)).toEqual(["terminal", "explorer", "viewer"]);
    expect(result.activeIds[0]).toBe("e1");
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
      activeIds: [null, null],
    });
    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0].id).toBe("t1");
  });

  it("drops a viewer tab with no file, since it can't be reopened", () => {
    const result = sanitize({ tabs: [tab({ id: "v1", kind: "viewer", path: "" })], activeIds: [null, null] });
    expect(result.tabs).toEqual([]);
  });

  it("drops a pane's active tab when no such tab is in it", () => {
    expect(sanitize({ tabs: [tab()], activeIds: ["gone", null] }).activeIds[0]).toBeNull();
  });

  it("caps tab count and string length so the file can't grow without bound", () => {
    const many = Array.from({ length: 100 }, (_, i) => tab({ id: `t${i}` }));
    expect(sanitize({ tabs: many, activeIds: [null, null] }).tabs).toHaveLength(32);
    const long = sanitize({ tabs: [tab({ cwd: "/".repeat(10_000) })], activeIds: [null, null] });
    expect(long.tabs[0].cwd).toHaveLength(4096);
  });

  it("merges a partial update onto the existing state", () => {
    const base = sanitize({ theme: "light", fontSize: 12, tabs: [tab()], activeIds: ["t1", null] });
    const merged = sanitize({ fontSize: 16 }, base);
    expect(merged.fontSize).toBe(16);
    // Untouched keys survive the patch.
    expect(merged.theme).toBe("light");
    expect(merged.tabs).toHaveLength(1);
    expect(merged.activeIds[0]).toBe("t1");
  });

  it("lets an explicit empty list close every tab", () => {
    const base = sanitize({ tabs: [tab()], activeIds: ["t1", null] });
    const cleared = sanitize({ tabs: [], activeIds: [null, null] }, base);
    expect(cleared.tabs).toEqual([]);
    expect(cleared.activeIds[0]).toBeNull();
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
      activeIds: ["v1", null],
    });
    expect(result.tabs[1].openedFrom).toBe("e1");
  });

  it("scopes slash commands per CLI and drops malformed ones", () => {
    const result = sanitize({
      customSlash: [
        { vendor: "claude", label: "/ship", command: "/ship" },
        { vendor: "codex", label: "/ship", command: "/ship" },
        { vendor: "claude", label: "/ship", command: "duplicate for the same CLI" },
        { vendor: "", label: "/novendor", command: "/x" },
        { vendor: "claude", label: "", command: "/x" },
        "not an object",
      ],
    });
    // Same label is fine on two different CLIs; a repeat within one is not.
    expect(result.customSlash).toEqual([
      { vendor: "claude", label: "/ship", command: "/ship" },
      { vendor: "codex", label: "/ship", command: "/ship" },
    ]);
  });

  it("keys hidden slash commands by CLI", () => {
    expect(sanitize({ hiddenSlash: ["claude:/cost", "codex:/cost", "claude:/cost"] }).hiddenSlash).toEqual([
      "claude:/cost",
      "codex:/cost",
    ]);
  });

  it("leaves slash commands untouched when the patch omits them", () => {
    const base = sanitize({ customSlash: [{ vendor: "claude", label: "/ship", command: "/ship" }] });
    expect(sanitize({ fontSize: 12 }, base).customSlash).toHaveLength(1);
  });
});

describe("layout", () => {
  it("keeps a tab in the right pane and puts anything else in the left", () => {
    const result = sanitize({
      tabs: [tab({ id: "a", pane: 1 }), tab({ id: "b", pane: 0 }), tab({ id: "c", pane: 7 })],
      activeIds: [null, null],
    });
    expect(result.tabs.map((t) => t.pane)).toEqual([1, 0, 0]);
  });

  it("will not point a pane at a tab that is in the other one", () => {
    const result = sanitize({
      tabs: [tab({ id: "a", pane: 0 })],
      // "a" is in the left pane, so the right pane cannot be showing it.
      activeIds: ["a", "a"],
    });
    expect(result.activeIds).toEqual(["a", null]);
  });

  it("clamps the split and rejects a junk one", () => {
    expect(sanitize({ split: 0.95 }).split).toBe(MAX_SPLIT);
    expect(sanitize({ split: 0.01 }).split).toBe(MIN_SPLIT);
    expect(sanitize({ split: "half" }).split).toBe(DEFAULT_SPLIT);
    expect(sanitize({ split: 0.37 }).split).toBe(0.37);
  });

  it("takes only one or two panes, and only a pane that exists as the focused one", () => {
    expect(sanitize({ panes: 2 }).panes).toBe(2);
    expect(sanitize({ panes: 3 }).panes).toBe(1);
    expect(sanitize({ panes: "two" }).panes).toBe(1);
    expect(sanitize({ focusedPane: 1 }).focusedPane).toBe(1);
    expect(sanitize({ focusedPane: 5 }).focusedPane).toBe(0);
  });
});
