import "dotenv/config";
import { ZipArchive } from "archiver";
import express from "express";
import { stat } from "fs/promises";
import { createServer } from "http";
import { basename } from "path";
import { Server as SocketIOServer } from "socket.io";
import { isPasswordEnabled } from "./auth.js";
import { authGate, gateSocketIO, mountAuthRoutes } from "./auth-routes.js";
import { dim, localAddresses } from "./cli.js";
import { mountCwdRoute } from "./cwd.js";
import { gatePresence } from "./presence.js";
import { mountProxy } from "./proxy.js";
import { registerSocketHandlers } from "./socket-handlers.js";
import { startTunnel, stopTunnel } from "./tunnel.js";
import { mountUploadRoutes } from "./uploads.js";

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
  // Reject unauthenticated sockets before any handler can create a PTY.
  gateSocketIO(io);
  // One device at a time; a second is told, and can take over.
  gatePresence(io);
  registerSocketHandlers(io);

  // Remove default request size limits for uploads
  httpServer.maxHeadersCount = 0;

  // Optional access password. The gate is mounted ahead of every route below
  // (uploads, zip download, proxy, React Router) so nothing is reachable while
  // the app is locked, and ahead of the auth router so that changing the
  // password still requires a valid session once one is set.
  app.use(authGate);
  // Reads the live pty table, so it lives here rather than in a route.
  mountCwdRoute(app);
  mountAuthRoutes(app);

  // Uploads stream, so they are Express routes rather than React Router ones.
  mountUploadRoutes(app);

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

  // Error handler. Unmatched routes make React Router throw "No route matches
  // URL" — on a public tunnel that's constant bot/scanner noise (probes for
  // /test.cgi, /whois.cgi, etc.), not real errors. Respond 404 quietly instead
  // of letting Express log a full stack trace for each. Real errors still log.
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    const failure = err as { status?: number; statusCode?: number; message?: string } | null;
    const status = failure?.status ?? failure?.statusCode;
    if (status === 404 || /No route matches URL/.test(failure?.message ?? "")) {
      if (!res.headersSent) res.status(404).end();
      return;
    }
    console.error(err);
    if (!res.headersSent) res.status(500).end();
    else next(err);
  });

  await new Promise<void>((ready) => {
    httpServer.listen(PORT, () => {
      console.log(`\n  ${dim(`OTG Code running on http://localhost:${PORT}`)}`);
      // On the same network this skips DNS and Cloudflare entirely, which is
      // both faster and immune to a fresh tunnel hostname's resolver lag.
      for (const address of localAddresses(PORT)) {
        console.log(dim(`  On this network:    ${address}`));
      }
      console.log(
        isPasswordEnabled()
          ? "  Access password: on\n"
          : `  ${dim("Access password: off (enable it in Settings for an extra layer)")}\n`,
      );
      ready();
    });
  });

  if (useTunnel) {
    // cloudflared is a child process, and Node does not take children with it
    // on exit. start.sh pkills them, but running the server directly (pnpm
    // start:tunnel) would otherwise leave the tunnel alive after Ctrl+C.
    const shutdown = (signal: NodeJS.Signals) => {
      stopTunnel();
      process.kill(process.pid, signal);
    };
    process.once("SIGINT", () => {
      process.removeAllListeners("SIGINT");
      shutdown("SIGINT");
    });
    process.once("SIGTERM", () => {
      process.removeAllListeners("SIGTERM");
      shutdown("SIGTERM");
    });

    await startTunnel(PORT);
  }
}

main().catch(console.error);
