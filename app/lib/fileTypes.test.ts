import { describe, expect, it } from "vitest";
import { fileKind, getExt, isDirectViewerFile } from "./fileTypes";

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
