import { describe, expect, it } from "vitest";
import { errorMessage, fsErrorMessage } from "./errors";

const fsError = (code: string, message = "boom") => Object.assign(new Error(message), { code });

describe("fsErrorMessage", () => {
  it("says which problem it is, not which syscall failed", () => {
    // What a pasted file path in the explorer's folder field produces.
    const err = fsError("ENOTDIR", "ENOTDIR: not a directory, scandir '/a/b/TODO.md'");
    expect(fsErrorMessage(err, "folder", "/a/b/TODO.md")).toBe('"TODO.md" is a file, not a folder');
  });

  it("separates a missing path from a wrong kind of path", () => {
    expect(fsErrorMessage(fsError("ENOENT"), "folder", "/a/saves")).toBe('No such folder "saves"');
    expect(fsErrorMessage(fsError("ENOENT"), "file", "/a/x.md")).toBe('No such file "x.md"');
    expect(fsErrorMessage(fsError("ENOENT"))).toBe("No such file or folder");
  });

  it("names the thing when it knows it, and stays readable when it doesn't", () => {
    expect(fsErrorMessage(fsError("EACCES"), "folder", "/root/private")).toBe('Permission denied "private"');
    expect(fsErrorMessage(fsError("EACCES"))).toBe("Permission denied");
    expect(fsErrorMessage(fsError("EEXIST"), "folder", "/a/docs")).toBe('"docs" already exists');
    expect(fsErrorMessage(fsError("EEXIST"))).toBe("That already exists");
    expect(fsErrorMessage(fsError("ENOTEMPTY"), "folder", "/a/docs")).toBe('"docs" is not empty');
  });

  it("drops the path for failures that aren't about one entry", () => {
    expect(fsErrorMessage(fsError("ENOSPC"), "file", "/a/b.txt")).toBe("No space left on the disk");
    expect(fsErrorMessage(fsError("EROFS"), "file", "/a/b.txt")).toBe("This filesystem is read-only");
  });

  it("falls back to the raw message for an errno it has no wording for", () => {
    expect(fsErrorMessage(fsError("EWEIRD", "something odd"), "file")).toBe("something odd");
    expect(fsErrorMessage({}, "folder")).toBe("Could not read that folder");
  });
});

describe("errorMessage", () => {
  it("narrows whatever was thrown to a string", () => {
    expect(errorMessage(new Error("nope"))).toBe("nope");
    expect(errorMessage("plain string")).toBe("plain string");
    expect(errorMessage(new Error(""), "fallback")).toBe("fallback");
    expect(errorMessage(undefined, "fallback")).toBe("fallback");
  });
});
