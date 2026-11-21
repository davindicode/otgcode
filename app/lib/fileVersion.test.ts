import { describe, expect, it } from "vitest";
import { fileVersion } from "./fileVersion";

describe("fileVersion", () => {
  it("changes when the file is written", () => {
    const before = fileVersion({ mtimeMs: 1_700_000_000_000, size: 120 });
    expect(fileVersion({ mtimeMs: 1_700_000_001_000, size: 120 })).not.toBe(before);
  });

  it("changes when only the length does, which covers a coarse mtime", () => {
    const before = fileVersion({ mtimeMs: 1_700_000_000_000, size: 120 });
    expect(fileVersion({ mtimeMs: 1_700_000_000_000, size: 121 })).not.toBe(before);
  });

  it("is stable for the same file, so a tab is not told it is stale forever", () => {
    expect(fileVersion({ mtimeMs: 1_700_000_000_000, size: 120 })).toBe(
      fileVersion({ mtimeMs: 1_700_000_000_000, size: 120 }),
    );
  });

  it("rounds sub-millisecond mtime, which some filesystems report", () => {
    expect(fileVersion({ mtimeMs: 1_700_000_000_000.4, size: 9 })).toBe(
      fileVersion({ mtimeMs: 1_700_000_000_000.1, size: 9 }),
    );
  });
});
