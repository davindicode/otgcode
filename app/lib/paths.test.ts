import { describe, expect, it } from "vitest";
import { dirname, isExternalUrl, normalizePath, resolvePath, toInlineDownloadUrl } from "./paths";

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
