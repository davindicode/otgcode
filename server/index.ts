import "dotenv/config";
import { ZipArchive } from "archiver";
import Busboy from "busboy";
import express from "express";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { stat } from "fs/promises";
import { createServer } from "http";
import { tmpdir } from "os";
import { basename, join } from "path";
import { Server as SocketIOServer } from "socket.io";
import { mountProxy } from "./proxy.js";
import { registerSocketHandlers } from "./socket-handlers.js";
import { startTunnel } from "./tunnel.js";

const PORT = parseInt(process.env.OTG_PORT || "7777", 10);
const useTunnel = process.argv.includes("--tunnel");

async function main() {
  const app = express();
  const httpServer = createServer(app);

  // Socket.IO
  const io = new SocketIOServer(httpServer, {
    path: "/socket.io",
    cors: { origin: "*" },
  });
  registerSocketHandlers(io);

  // Remove default request size limits for uploads
  httpServer.maxHeadersCount = 0;

  // Streaming file upload (handles large files without buffering into memory)
  app.post("/api/files/upload", (req, res) => {
    // Disable any request timeout for large uploads
    req.setTimeout(0);
    let dir = "";
    let fileName = "";
    let dest = "";
    let writeStream: ReturnType<typeof createWriteStream> | null = null;
    let error: string | null = null;

    const busboy = Busboy({ headers: req.headers });

    busboy.on("field", (name: string, val: string) => {
      if (name === "dir") dir = val;
    });

    busboy.on("file", (_name: string, stream: NodeJS.ReadableStream, info: { filename: string }) => {
      fileName = info.filename;
      if (!dir) {
        error = "Missing dir field";
        stream.resume(); // drain
        return;
      }
      dest = join(dir, fileName);
      writeStream = createWriteStream(dest);
      stream.pipe(writeStream);

      writeStream.on("error", (err: Error) => {
        error = err.message;
      });
    });

    busboy.on("finish", () => {
      if (error) {
        res.status(400).json({ error });
      } else if (!fileName) {
        res.status(400).json({ error: "No file provided" });
      } else {
        // Wait for write stream to finish flushing
        if (writeStream && !writeStream.writableEnded) {
          writeStream.on("finish", () => {
            res.json({ success: true, path: dest });
          });
        } else {
          res.json({ success: true, path: dest });
        }
      }
    });

    busboy.on("error", (err: Error) => {
      res.status(500).json({ error: err.message });
    });

    req.pipe(busboy);
  });

  // Chunked upload: receive individual chunks
  const chunksDir = join(tmpdir(), "otgcode-chunks");
  if (!existsSync(chunksDir)) mkdirSync(chunksDir, { recursive: true });

  app.post("/api/files/upload-chunk", (req, res) => {
    req.setTimeout(0);
    let uploadId = "";
    let chunkIndex = "";
    let chunkFile = "";

    const busboy = Busboy({ headers: req.headers });

    busboy.on("field", (name: string, val: string) => {
      if (name === "uploadId") uploadId = val;
      if (name === "chunkIndex") chunkIndex = val;
    });

    busboy.on("file", (_name: string, stream: NodeJS.ReadableStream) => {
      if (!uploadId || chunkIndex === "") {
        stream.resume();
        return;
      }
      const uploadDir = join(chunksDir, uploadId);
      if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
      chunkFile = join(uploadDir, `chunk_${chunkIndex.padStart(6, "0")}`);
      const ws = createWriteStream(chunkFile);
      stream.pipe(ws);

      ws.on("error", (err: Error) => {
        if (!res.headersSent) res.status(500).json({ error: err.message });
      });
      ws.on("finish", () => {
        if (!res.headersSent) res.json({ success: true, chunk: parseInt(chunkIndex, 10) });
      });
    });

    busboy.on("error", (err: Error) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });

    req.pipe(busboy);
  });

  // Chunked upload: finalize — assemble chunks into destination file
  app.post("/api/files/upload-finalize", express.json(), (req, res) => {
    const { uploadId, dir, fileName, totalChunks } = req.body as {
      uploadId: string;
      dir: string;
      fileName: string;
      totalChunks: number;
    };

    if (!uploadId || !dir || !fileName || !totalChunks) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const uploadDir = join(chunksDir, uploadId);
    const dest = join(dir, fileName);

    try {
      const ws = createWriteStream(dest);
      let i = 0;

      const writeNext = () => {
        if (i >= totalChunks) {
          ws.end(() => {
            // Clean up chunks
            try {
              const files = readdirSync(uploadDir);
              for (const f of files) unlinkSync(join(uploadDir, f));
              require("fs").rmdirSync(uploadDir);
            } catch {}
            res.json({ success: true, path: dest });
          });
          return;
        }
        const chunkPath = join(uploadDir, `chunk_${String(i).padStart(6, "0")}`);
        const rs = createReadStream(chunkPath);
        rs.on("error", (err: Error) => {
          ws.destroy();
          if (!res.headersSent) res.status(500).json({ error: `Chunk ${i} missing: ${err.message}` });
        });
        rs.pipe(ws, { end: false });
        rs.on("end", () => {
          i++;
          writeNext();
        });
      };

      ws.on("error", (err: Error) => {
        if (!res.headersSent) res.status(500).json({ error: err.message });
      });

      writeNext();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Zip download: stream one or more files/folders as a single .zip.
  // Folders are added recursively. Used for individual folder downloads and
  // for group downloads in the file explorer's multi-select mode.
  app.get("/api/files/download-zip", async (req, res) => {
    const raw = req.query.path;
    const paths = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((p): p is string => typeof p === "string");
    if (paths.length === 0) {
      res.status(400).json({ error: "Missing path" });
      return;
    }
    const name = typeof req.query.name === "string" && req.query.name ? req.query.name : "archive.zip";

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${name.replace(/"/g, "")}"`);

    const archive = new ZipArchive({ level: 9 });
    archive.on("error", (err: Error) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
      else res.destroy(err);
    });
    archive.pipe(res);

    for (const p of paths) {
      try {
        const st = await stat(p);
        if (st.isDirectory()) archive.directory(p, basename(p));
        else archive.file(p, { name: basename(p) });
      } catch {
        // skip missing/unreadable entries
      }
    }
    archive.finalize();
  });

  // Reverse proxy (before RR handler so it gets priority)
  mountProxy(app, httpServer, PORT);

  // React Router handler (production build)
  const buildPath = new URL("../build/server/index.js", import.meta.url).pathname;
  const build = await import(buildPath);

  // Serve static assets from client build
  app.use(
    "/assets",
    express.static(new URL("../build/client/assets", import.meta.url).pathname, {
      immutable: true,
      maxAge: "1y",
    }),
  );
  app.use(express.static(new URL("../build/client", import.meta.url).pathname, { maxAge: "1h" }));

  // Reject known browser probe paths before they hit React Router
  app.use((req, res, next) => {
    if (req.url.startsWith("/apple-touch-icon") || req.url.startsWith("/.well-known/") || req.url === "/favicon.ico") {
      res.status(404).end();
      return;
    }
    next();
  });

  // React Router request handler
  const { createRequestHandler } = await import("@react-router/express");
  app.all("/{*splat}", createRequestHandler({ build }));

  httpServer.listen(PORT, () => {
    console.log(`\n  OTG Code running on http://localhost:${PORT}\n`);
  });

  if (useTunnel) {
    await startTunnel(PORT);
  }
}

main().catch(console.error);
