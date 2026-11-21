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

  it("answers 304 when the copy they have is still current", async () => {
    const dir = mkdtempSync(join(tmpdir(), "otg-dl-"));
    const file = join(dir, "demo.gif");
    writeFileSync(file, "GIF89a and then some bytes");

    const url = `http://localhost/api/files/download?path=${encodeURIComponent(file)}&inline=1`;
    const first = (await loader({ request: new Request(url) } as never)) as Response;
    const modified = first.headers.get("Last-Modified") as string;
    expect(modified).toBeTruthy();

    // What the browser sends back on the next view — the replay button's
    // request, which must not pull the whole file down again.
    const again = (await loader({
      request: new Request(url, { headers: { "If-Modified-Since": modified } }),
    } as never)) as Response;
    expect(again.status).toBe(304);
    expect(again.body).toBeNull();

    // A range request asks about part of the file, not whether it changed.
    const ranged = (await loader({
      request: new Request(url, { headers: { "If-Modified-Since": modified, Range: "bytes=0-3" } }),
    } as never)) as Response;
    expect(ranged.status).toBe(206);

    rmSync(dir, { recursive: true, force: true });
  });
});
