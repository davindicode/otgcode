import "dotenv/config";
import Busboy from "busboy";
import express from "express";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { createServer } from "http";
import { tmpdir } from "os";
import { join } from "path";
import { Server as SocketIOServer } from "socket.io";
import { mountProxy } from "./proxy.js";
import { registerSocketHandlers } from "./socket-handlers.js";

const PORT = parseInt(process.env.OTG_PORT || "7777", 10);

async function main() {
  const app = express();
  const httpServer = createServer(app);

  // Suppress max listener warnings from proxy
  httpServer.setMaxListeners(50);

  // Socket.IO — uses /socket.io path
  const io = new SocketIOServer(httpServer, {
    path: "/socket.io",
    cors: { origin: "*" },
  });
  registerSocketHandlers(io);

  // Streaming file upload (handles large files without buffering into memory)
  app.post("/api/files/upload", (req, res) => {
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
        stream.resume();
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
      const chunkFile = join(uploadDir, `chunk_${chunkIndex.padStart(6, "0")}`);
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

  // Reverse proxy
  mountProxy(app, httpServer, PORT);

  // Reject known noise paths before they hit React Router
  app.use((req, res, next) => {
    if (req.url.startsWith("/apple-touch-icon") || req.url.startsWith("/.well-known/") || req.url === "/favicon.ico") {
      res.status(404).end();
      return;
    }
    next();
  });

  // Vite dev server
  const vite = await import("vite");
  const viteServer = await vite.createServer({
    server: {
      middlewareMode: true,
      hmr: { server: httpServer },
    },
    appType: "custom",
  });
  app.use(viteServer.middlewares);

  // React Router dev handler
  const { createRequestHandler } = await import("@react-router/express");
  app.all("/{*splat}", (req, res, next) => {
    try {
      createRequestHandler({
        build: () => viteServer.ssrLoadModule("virtual:react-router/server-build") as any,
      })(req, res, next);
    } catch (err) {
      next(err);
    }
  });

  // Global error handler
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error("SSR error:", err.message);
    if (!res.headersSent) {
      res.status(500).send(`<pre style="color:red">${err.stack || err.message}</pre>`);
    }
  });

  httpServer.listen(PORT, () => {
    console.log(`\n  OTG Code dev server running on http://localhost:${PORT}\n`);
  });
}

main().catch(console.error);
