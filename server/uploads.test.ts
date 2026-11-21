// @vitest-environment node
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mountUploadRoutes } from "./uploads.js";

let server: Server;
let base: string;
let root: string;
/** A directory the process may list but not write to — the reported case. */
let readOnly: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "otg-uploads-"));
  readOnly = join(root, "locked");
  mkdirSync(readOnly);
  chmodSync(readOnly, 0o555);

  const app = express();
  mountUploadRoutes(app);
  server = createServer(app);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterAll(async () => {
  await new Promise((done) => server.close(done));
  chmodSync(readOnly, 0o755);
  rmSync(root, { recursive: true, force: true });
});

function upload(dir: string, relativePath: string, contents = "hello"): Promise<Response> {
  const body = new FormData();
  body.set("dir", dir);
  body.set("relativePath", relativePath);
  body.set("file", new Blob([contents]), relativePath.split("/").pop());
  return fetch(`${base}/api/files/upload`, { method: "POST", body });
}

describe("uploading a file", () => {
  it("writes it, creating any folders the path names", async () => {
    const res = await upload(root, "nested/one/note.txt", "written");

    expect(res.status).toBe(200);
    expect(readFileSync(join(root, "nested/one/note.txt"), "utf-8")).toBe("written");
  });

  // The destination refuses asynchronously, after busboy has finished parsing.
  // Reporting it only through the stream's 'finish' event, which never comes,
  // left the request with no answer at all: the upload sat at "uploading" for
  // ever and the explorer stayed frozen behind it.
  it("answers with the reason when the folder cannot be written to", async () => {
    const res = await upload(readOnly, "note.txt");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Permission denied "note.txt"' });
  });

  // Busboy throws on a non-multipart body, which Express turns into an HTML
  // page with a stack trace in it.
  it("refuses a body that is not an upload, in JSON", async () => {
    const res = await fetch(`${base}/api/files/upload`, { method: "POST", body: "not a form" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Expected a file upload" });
  });

  it("keeps an upload inside the folder it names", async () => {
    const res = await upload(root, "../../escape.txt", "contained");

    expect(res.status).toBe(200);
    expect(readFileSync(join(root, "escape.txt"), "utf-8")).toBe("contained");
  });
});
