import { describe, expect, it } from "vitest";
import { contentDisposition, fileKind, getExt, isDirectViewerFile, looksBinary } from "./fileTypes";

describe("fileKind", () => {
  it("classifies each viewer's file types", () => {
    expect(fileKind("/a/photo.PNG")).toBe("image");
    expect(fileKind("/a/clip.mp4")).toBe("video");
    expect(fileKind("/a/song.flac")).toBe("audio");
    expect(fileKind("/a/paper.pdf")).toBe("pdf");
    expect(fileKind("/a/main.ts")).toBe("text");
  });

  it("treats anything unrecognised as text, so it opens in the editor", () => {
    expect(fileKind("/a/Makefile")).toBe("text");
    expect(fileKind("/a/.gitignore")).toBe("text");
    expect(fileKind("/a/notes")).toBe("text");
    expect(fileKind("")).toBe("text");
  });

  it("sends ogg to the video element, which handles either stream", () => {
    expect(fileKind("/a/clip.ogg")).toBe("video");
  });
});

describe("isDirectViewerFile", () => {
  it("is true for everything that streams from the download URL", () => {
    for (const p of ["/a/x.png", "/a/x.mp4", "/a/x.mp3", "/a/x.pdf"]) {
      expect(isDirectViewerFile(p)).toBe(true);
    }
  });

  it("is false for text, which must be fetched before it can be shown", () => {
    expect(isDirectViewerFile("/a/main.ts")).toBe(false);
    expect(isDirectViewerFile("/a/README")).toBe(false);
  });
});

describe("getExt", () => {
  it("lowercases, and returns nothing when there is no extension", () => {
    expect(getExt("/a/IMAGE.JPEG")).toBe("jpeg");
    expect(getExt("/a/archive.tar.gz")).toBe("gz");
    // Used to return the whole path, which then showed up as the "file type".
    expect(getExt("/a/noext")).toBe("");
    expect(getExt("/a/.gitignore")).toBe("");
    // A dot in a directory name is not the file's extension.
    expect(getExt("/a.b/Makefile")).toBe("");
  });
});

describe("looksBinary", () => {
  const bytes = (...parts: (string | number[])[]) =>
    new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

  it("spots the formats an extension list keeps missing", () => {
    // A zip's local file header — .docx, .xlsx, .odt, .jar all start here.
    expect(looksBinary(bytes("PK", [3, 4, 20, 0]))).toBe(true);
    // ISO-BMFF, which is .heic and .mov: a length prefix, then "ftyp".
    expect(looksBinary(bytes([0, 0, 0, 24], "ftypheic"))).toBe(true);
    expect(looksBinary(bytes([0x7f], "ELF", [2, 1, 1, 0]))).toBe(true);
  });

  it("leaves text alone, including encodings we do not decode cleanly", () => {
    expect(looksBinary(bytes("#!/bin/sh\necho hi\n"))).toBe(false);
    // Latin-1: mojibake in the editor, but readable, so it is still text.
    expect(looksBinary(bytes("caf", [0xe9], "\n"))).toBe(false);
    expect(looksBinary(new Uint8Array(0))).toBe(false);
  });

  it("only reads the start, so a NUL deep in a big text file is not binary", () => {
    const big = new Uint8Array(20000).fill(65);
    big[9000] = 0;
    expect(looksBinary(big)).toBe(false);
  });
});

describe("contentDisposition", () => {
  it("carries a plain name in both parameters", () => {
    expect(contentDisposition("notes.txt")).toBe("attachment; filename=\"notes.txt\"; filename*=UTF-8''notes.txt");
  });

  it("keeps a non-ASCII name readable, flattening only the ASCII copy", () => {
    const value = contentDisposition("ファイル.txt");
    expect(value).toContain('filename="____.txt"');
    expect(value).toContain("filename*=UTF-8''%E3%83%95%E3%82%A1%E3%82%A4%E3%83%AB.txt");
  });

  it("cannot be used to end the quoted string or add a header", () => {
    const value = contentDisposition('evil".txt\r\nX-Injected: 1');
    expect(value).not.toContain("\r");
    expect(value).not.toContain("\n");
    // One opening and one closing quote, so nothing escapes the parameter.
    expect(value.match(/"/g)).toHaveLength(2);
  });

  it("marks inline only when asked", () => {
    expect(contentDisposition("a.png", true).startsWith("inline;")).toBe(true);
    expect(contentDisposition("a.png").startsWith("attachment;")).toBe(true);
  });
});
