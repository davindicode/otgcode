import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loader, parseByteRange } from "./files.download";

describe("parseByteRange", () => {
  it("parses bounded, open-ended, and suffix ranges", () => {
    expect(parseByteRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseByteRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
  });

  it("clamps ranges to the file size", () => {
    expect(parseByteRange("bytes=90-200", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=-200", 100)).toEqual({ start: 0, end: 99 });
  });

  it("rejects malformed and unsatisfiable ranges", () => {
    expect(parseByteRange("bytes=100-", 100)).toBeNull();
    expect(parseByteRange("bytes=20-10", 100)).toBeNull();
    expect(parseByteRange("bytes=0-1,4-5", 100)).toBeNull();
    expect(parseByteRange("items=0-10", 100)).toBeNull();
    expect(parseByteRange("bytes=0-0", 0)).toBeNull();
  });
});

describe("serving a file under the app's own origin", () => {
  it("renders an inline .html inert instead of next to the session", async () => {
    const dir = mkdtempSync(join(tmpdir(), "otg-dl-"));
    const file = join(dir, "notes.html");
    // What a cloned repo's README can link to, and what markdown preview
    // rewrites such a link into: inline, same origin, script included.
    writeFileSync(file, "<script>fetch('/api/files/write')</script>");

    const url = `http://localhost/api/files/download?path=${encodeURIComponent(file)}&inline=1`;
    const res = (await loader({ request: new Request(url) } as never)) as Response;

    expect(res.headers.get("Content-Disposition")).toContain("inline");
    expect(res.headers.get("Content-Type")).toContain("text/html");
    // The two headers that make it harmless anyway.
    expect(res.headers.get("Content-Security-Policy")).toBe("sandbox");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");

    rmSync(dir, { recursive: true, force: true });
  });
});
