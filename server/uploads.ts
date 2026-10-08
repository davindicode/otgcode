import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import Busboy from "busboy";
import express, { type Express, type Request, type Response } from "express";
import { fsErrorMessage } from "../app/lib/errors.js";

/**
 * Resolve a (possibly nested) upload destination under `dir`, stripping any
 * traversal so an uploaded relativePath can never escape the target directory.
 * Returns null if the path is empty or would resolve outside `dir`.
 */
function safeUploadDest(dir: string, relativePath: string): string | null {
  const cleaned = relativePath
    .split(/[/\\]/)
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");
  if (!cleaned) return null;
  const dest = join(dir, cleaned);
  const base = resolve(dir);
  const resolved = resolve(dest);
  if (resolved !== base && !resolved.startsWith(`${base}/`)) return null;
  return dest;
}

/**
 * One answer per request, from whichever of the racing handlers gets there
 * first. An upload has several — busboy's, the incoming stream's and the
 * destination file's — and the one that matters is usually the destination's:
 * a directory the server cannot write to refuses there, asynchronously, long
 * after busboy has happily finished parsing.
 *
 * A failure also drains the request. Answering mid-body leaves the browser
 * still sending, and some of them never read the response if we just stop.
 */
function answer(req: Request, res: Response) {
  return {
    ok: (body: object) => {
      if (!res.headersSent) res.json({ success: true, ...body });
    },
    fail: (status: number, error: string) => {
      if (res.headersSent) return;
      req.unpipe();
      req.resume();
      res.status(status).json({ error });
    },
  };
}

/**
 * Busboy throws synchronously on a body that is not multipart, which reaches
 * Express as an unhandled error and answers with an HTML stack trace.
 */
function parseMultipart(req: Request, reply: ReturnType<typeof answer>) {
  try {
    return Busboy({ headers: req.headers });
  } catch {
    reply.fail(400, "Expected a file upload");
    return null;
  }
}

/**
 * The three upload endpoints, shared by the dev and production servers.
 *
 * Express rather than React Router routes because all three stream: a route's
 * `request.formData()` buffers the whole body in memory, which a multi-gigabyte
 * upload over a phone connection cannot afford.
 */
export function mountUploadRoutes(app: Express): void {
  // Streaming single-file upload (handles large files without buffering).
  app.post("/api/files/upload", (req, res) => {
    req.setTimeout(0); // no request timeout: a big upload is meant to take a while
    const reply = answer(req, res);
    let dir = "";
    let relativePath = "";
    let sawFile = false;

    const busboy = parseMultipart(req, reply);
    if (!busboy) return;

    busboy.on("field", (name: string, val: string) => {
      if (name === "dir") dir = val;
      if (name === "relativePath") relativePath = val;
    });

    busboy.on("file", (_name: string, stream: NodeJS.ReadableStream, info: { filename: string }) => {
      sawFile = true;
      // relativePath (folder uploads) may include subdirectories; create them.
      const dest = dir ? safeUploadDest(dir, relativePath || info.filename) : null;
      if (!dest) {
        stream.resume();
        reply.fail(400, dir ? "Invalid upload path" : "Missing dir field");
        return;
      }

      let out: ReturnType<typeof createWriteStream>;
      try {
        mkdirSync(dirname(dest), { recursive: true });
        out = createWriteStream(dest);
      } catch (err: unknown) {
        stream.resume();
        reply.fail(400, fsErrorMessage(err, "file", dest));
        return;
      }
      out.on("error", (err: Error) => {
        stream.resume();
        reply.fail(400, fsErrorMessage(err, "file", dest));
      });
      out.on("finish", () => reply.ok({ path: dest }));
      stream.pipe(out);
    });

    busboy.on("finish", () => {
      if (!sawFile) reply.fail(400, "No file provided");
    });
    busboy.on("error", (err: Error) => reply.fail(500, err.message));

    req.pipe(busboy);
  });

  // Chunked upload: chunks land in a temp directory, then get assembled.
  const chunksDir = join(tmpdir(), "otgcode-chunks");
  if (!existsSync(chunksDir)) mkdirSync(chunksDir, { recursive: true });

  app.post("/api/files/upload-chunk", (req, res) => {
    req.setTimeout(0);
    const reply = answer(req, res);
    let uploadId = "";
    let chunkIndex = "";

    const busboy = parseMultipart(req, reply);
    if (!busboy) return;

    busboy.on("field", (name: string, val: string) => {
      if (name === "uploadId") uploadId = val;
      if (name === "chunkIndex") chunkIndex = val;
    });

    busboy.on("file", (_name: string, stream: NodeJS.ReadableStream) => {
      if (!uploadId || chunkIndex === "") {
        stream.resume();
        reply.fail(400, "Missing uploadId or chunkIndex");
        return;
      }
      const uploadDir = join(chunksDir, uploadId);
      const chunkFile = join(uploadDir, `chunk_${chunkIndex.padStart(6, "0")}`);
      let out: ReturnType<typeof createWriteStream>;
      try {
        mkdirSync(uploadDir, { recursive: true });
        out = createWriteStream(chunkFile);
      } catch (err: unknown) {
        stream.resume();
        reply.fail(500, fsErrorMessage(err, "file", chunkFile));
        return;
      }
      out.on("error", (err: Error) => {
        stream.resume();
        reply.fail(500, fsErrorMessage(err, "file", chunkFile));
      });
      out.on("finish", () => reply.ok({ chunk: parseInt(chunkIndex, 10) }));
      stream.pipe(out);
    });

    busboy.on("error", (err: Error) => reply.fail(500, err.message));

    req.pipe(busboy);
  });

  // Chunked upload: assemble the chunks into the destination file.
  app.post("/api/files/upload-finalize", express.json(), (req, res) => {
    const reply = answer(req, res);
    const { uploadId, dir, fileName, relativePath, totalChunks } = req.body as {
      uploadId?: string;
      dir?: string;
      fileName?: string;
      relativePath?: string;
      totalChunks?: number;
    };

    if (!uploadId || !dir || !fileName || !totalChunks) {
      reply.fail(400, "Missing required fields");
      return;
    }

    const uploadDir = join(chunksDir, uploadId);
    const dest = safeUploadDest(dir, relativePath || fileName);
    if (!dest) {
      reply.fail(400, "Invalid upload path");
      return;
    }

    let out: ReturnType<typeof createWriteStream>;
    try {
      mkdirSync(dirname(dest), { recursive: true });
      out = createWriteStream(dest);
    } catch (err: unknown) {
      reply.fail(400, fsErrorMessage(err, "file", dest));
      return;
    }
    out.on("error", (err: Error) => reply.fail(400, fsErrorMessage(err, "file", dest)));

    let i = 0;
    const writeNext = () => {
      if (i >= totalChunks) {
        out.end(() => {
          try {
            for (const f of readdirSync(uploadDir)) unlinkSync(join(uploadDir, f));
            rmdirSync(uploadDir);
          } catch {
            // Temp files in the OS temp directory; the OS can have them.
          }
          reply.ok({ path: dest });
        });
        return;
      }
      const chunkPath = join(uploadDir, `chunk_${String(i).padStart(6, "0")}`);
      const chunk = createReadStream(chunkPath);
      chunk.on("error", (err: Error) => {
        out.destroy();
        reply.fail(500, `Chunk ${i + 1} of ${totalChunks} is missing: ${err.message}`);
      });
      chunk.pipe(out, { end: false });
      chunk.on("end", () => {
        i++;
        writeNext();
      });
    };
    writeNext();
  });
}
