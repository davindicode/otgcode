import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { authGate, gateSocketIO, mountAuthRoutes } from "./auth-routes.js";
import { mountCwdRoute } from "./cwd.js";
import { gatePresence } from "./presence.js";
import { mountProxy } from "./proxy.js";
import { registerSocketHandlers } from "./socket-handlers.js";
import { mountUploadRoutes } from "./uploads.js";

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
  gateSocketIO(io);
  // One device at a time; a second is told, and can take over.
  gatePresence(io);
  registerSocketHandlers(io);

  // Optional access password — same gate as production so dev behaves the same.
  app.use(authGate);
  // Reads the live pty table, so it lives here rather than in a route.
  mountCwdRoute(app);
  mountAuthRoutes(app);

  // Uploads stream, so they are Express routes rather than React Router ones.
  mountUploadRoutes(app);

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
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const failure = err instanceof Error ? err : new Error(String(err));
    console.error("SSR error:", failure.message);
    if (!res.headersSent) {
      res.status(500).send(`<pre style="color:red">${failure.stack || failure.message}</pre>`);
    }
  });

  httpServer.listen(PORT, () => {
    console.log(`\n  OTG Code dev server running on http://localhost:${PORT}\n`);
  });
}

main().catch(console.error);
