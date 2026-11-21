import { describe, expect, it } from "vitest";
import { isSaveShortcut } from "./keys";

const press = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});

describe("isSaveShortcut", () => {
  it("matches Ctrl+S and Cmd+S", () => {
    expect(isSaveShortcut(press("s", { ctrlKey: true }))).toBe(true);
    expect(isSaveShortcut(press("s", { metaKey: true }))).toBe(true);
  });

  it("matches regardless of caps", () => {
    expect(isSaveShortcut(press("S", { ctrlKey: true }))).toBe(true);
  });

  it("ignores S with no modifier, so typing an s still types an s", () => {
    expect(isSaveShortcut(press("s"))).toBe(false);
  });

  it("ignores other keys held with the modifier", () => {
    for (const key of ["a", "c", "v", "z"]) {
      expect(isSaveShortcut(press(key, { ctrlKey: true }))).toBe(false);
    }
  });

  it("leaves Ctrl+Alt+S alone — a different chord, and AltGr on some layouts", () => {
    expect(isSaveShortcut(press("s", { ctrlKey: true, altKey: true }))).toBe(false);
  });
});
