import { describe, expect, it } from "vitest";
import { basename, dirname, isExternalUrl, normalizePath, planMove, resolvePath, toInlineDownloadUrl } from "./paths";

describe("dirname", () => {
  it("returns the directory of a file path", () => {
    expect(dirname("/home/user/repo/README.md")).toBe("/home/user/repo");
  });
  it("handles root-level files", () => {
    expect(dirname("/README.md")).toBe("/");
  });
  it("returns empty for a bare name", () => {
    expect(dirname("README.md")).toBe("");
  });
});

describe("normalizePath", () => {
  it("collapses . and .. segments", () => {
    expect(normalizePath("/a/b/../c/./d")).toBe("/a/c/d");
  });
  it("collapses duplicate slashes", () => {
    expect(normalizePath("/a//b///c")).toBe("/a/b/c");
  });
  it("does not climb above root", () => {
    expect(normalizePath("/a/../../b")).toBe("/b");
  });
  it("keeps leading .. for relative paths", () => {
    expect(normalizePath("../a/b")).toBe("../a/b");
  });
});

describe("resolvePath", () => {
  it("resolves a relative ref against the base dir", () => {
    expect(resolvePath("/home/user/repo", "public/logo.png")).toBe("/home/user/repo/public/logo.png");
  });
  it("resolves parent refs", () => {
    expect(resolvePath("/home/user/repo/docs", "../public/logo.png")).toBe("/home/user/repo/public/logo.png");
  });
  it("treats an absolute ref as-is (normalized)", () => {
    expect(resolvePath("/home/user/repo", "/etc/hosts")).toBe("/etc/hosts");
  });
  it("handles ./ prefixes", () => {
    expect(resolvePath("/repo", "./a/b.png")).toBe("/repo/a/b.png");
  });
});

describe("isExternalUrl", () => {
  it.each([
    "https://example.com/x.png",
    "http://example.com",
    "data:image/png;base64,AAAA",
    "blob:abc",
    "mailto:a@b.com",
    "//cdn.example.com/x.png",
    "#section",
  ])("treats %s as external", (url) => {
    expect(isExternalUrl(url)).toBe(true);
  });

  it.each(["public/logo.png", "./a.png", "../b/c.png", "/abs/on/disk.png"])("treats %s as local", (url) => {
    expect(isExternalUrl(url)).toBe(false);
  });
});

describe("toInlineDownloadUrl", () => {
  it("builds an inline download URL with the path encoded", () => {
    expect(toInlineDownloadUrl("/home/u/a b.png")).toBe("/api/files/download?path=%2Fhome%2Fu%2Fa%20b.png&inline=1");
  });
});

describe("planMove", () => {
  it("resolves the destination, keeping the entry's name", () => {
    const { target, name, error } = planMove("/home/me/src/note.txt", "/home/me/dest");
    expect(target).toBe("/home/me/dest/note.txt");
    expect(name).toBe("note.txt");
    expect(error).toBeNull();
  });

  it("refuses a move into the folder the entry is already in", () => {
    expect(planMove("/home/me/src/note.txt", "/home/me/src").error).toMatch(/already in this folder/);
    expect(planMove("/home/me/src/note.txt", "/home/me/src/").error).toMatch(/already in this folder/);
    expect(planMove("/home/me/src/note.txt", "/home/me/other/../src").error).toMatch(/already in this folder/);
  });

  it("refuses moving a folder into itself or a descendant", () => {
    expect(planMove("/home/me/folder", "/home/me/folder").error).toMatch(/already in this folder|inside itself/);
    expect(planMove("/home/me/folder", "/home/me/folder/inner").error).toMatch(/inside itself/);
    expect(planMove("/home/me/folder", "/home/me/folder/a/b/c").error).toMatch(/inside itself/);
  });

  it("allows a sibling whose name merely starts the same", () => {
    expect(planMove("/home/me/folder", "/home/me/folder-2").error).toBeNull();
  });

  it("normalises traversal in the destination", () => {
    expect(planMove("/home/me/src/note.txt", "/home/me/dest/../elsewhere").target).toBe("/home/me/elsewhere/note.txt");
  });

  it("handles a source at the filesystem root", () => {
    expect(planMove("/thing", "/home/me")).toEqual({ target: "/home/me/thing", name: "thing", error: null });
  });
});

describe("basename", () => {
  it("returns the last segment", () => {
    expect(basename("/home/me/note.txt")).toBe("note.txt");
    expect(basename("/home/me/folder")).toBe("folder");
    expect(basename("/thing")).toBe("thing");
  });
  it("ignores a trailing slash", () => {
    expect(basename("/home/me/folder/")).toBe("folder");
  });
});
