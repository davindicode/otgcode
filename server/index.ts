import "dotenv/config";
import express from "express";
import { createServer } from "http";
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
import { mountZipRoute } from "./zip.js";

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
  // Every /api response is a snapshot of the filesystem or the live host, so a
  // reused one is wrong by definition. None of them said so: no Cache-Control,
  // no ETag, no Last-Modified — which leaves a browser free to answer from the
  // copy it already has, the URL being identical every time. That is what made
  // a reloaded file show its old contents and a changed-on-disk check keep
  // reporting the version it first saw. Set here rather than per route so a
  // route added later cannot forget it.
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  // Reads the live pty table, so it lives here rather than in a route.
  mountCwdRoute(app);
  mountAuthRoutes(app);

  // Uploads stream, so they are Express routes rather than React Router ones.
  mountUploadRoutes(app);

  // Zip download for a folder, or for a multi-select group.
  mountZipRoute(app);

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

  // React Router request handler.
  //
  // Its responses carry no Cache-Control of their own, and the document is the
  // one file that names the hashed assets — so a browser that keeps a copy
  // keeps the whole build it came from, assets included, since those are
  // served immutable for a year quite correctly. Safari does keep one: it will
  // cache a 200 with no validators on a heuristic, which is how a rebuilt app
  // kept coming up as the previous version there while Chrome picked up the
  // new one. Mounted after the static handlers so the hashed assets keep their
  // year.
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
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
