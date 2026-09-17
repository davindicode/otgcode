import { randomBytes } from "node:crypto";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { Server as SocketIOServer } from "socket.io";
import {
  clearedSessionCookie,
  createLoginThrottle,
  hashPassword,
  isPasswordEnabled,
  isRequestAuthenticated,
  issueToken,
  loadConfig,
  localUsername,
  saveConfig,
  sessionCookie,
  validatePassword,
  verifyPassword,
} from "./auth.js";

const throttle = createLoginThrottle();

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/**
 * Paths reachable while the app is locked. Everything needed to render and
 * submit the login form, and nothing else — no API, no proxy, no downloads.
 */
export function isPublicPath(path: string): boolean {
  // Deny-first so a static-looking extension can't smuggle through a proxied
  // or API path (e.g. `/proxy/3000/main.js`).
  if (path.startsWith("/proxy/") || path === "/proxy") return false;
  if (path.startsWith("/socket.io")) return false;
  if (path.startsWith("/api/")) {
    return path === "/api/auth/status" || path === "/api/auth/login" || path === "/api/auth/logout";
  }

  if (path === "/") return true;
  // Build output and public/ assets that the login screen needs.
  if (path.startsWith("/assets/")) return true;
  return /\.(?:css|js|mjs|map|ico|png|jpe?g|svg|webp|gif|woff2?|ttf|otf|webmanifest)$/i.test(path);
}

/**
 * Blocks every non-public request while a password is set and the caller has
 * no valid session. Mounted ahead of the file APIs, the proxy and the React
 * Router handler, so gating does not depend on each route remembering to check.
 */
export function authGate(req: Request, res: Response, next: NextFunction): void {
  if (!isPasswordEnabled()) {
    next();
    return;
  }
  if (isRequestAuthenticated(req.headers.cookie)) {
    next();
    return;
  }
  if (isPublicPath(req.path)) {
    next();
    return;
  }
  res.status(401).json({ error: "Authentication required" });
}

/** Issue a fresh session for the current secret and attach it to the response. */
function grantSession(res: Response): void {
  res.setHeader("Set-Cookie", sessionCookie(issueToken(loadConfig().sessionSecret)));
}

export function mountAuthRoutes(app: Express): void {
  const router = express.Router();
  router.use(express.json({ limit: "16kb" }));

  router.get("/status", (req, res) => {
    res.json({
      enabled: isPasswordEnabled(),
      authenticated: isRequestAuthenticated(req.headers.cookie),
      user: localUsername(),
    });
  });

  router.post("/login", async (req, res) => {
    const config = loadConfig();
    if (!config.passwordEnabled || !config.passwordHash) {
      // Nothing to log in to — report success so the client unlocks.
      res.json({ ok: true });
      return;
    }

    const { password } = (req.body ?? {}) as { password?: unknown };
    await sleep(throttle.delayMs("login"));

    if (typeof password !== "string" || !verifyPassword(password, config.passwordHash)) {
      throttle.recordFailure("login");
      res.status(401).json({ error: "Incorrect password" });
      return;
    }

    throttle.reset("login");
    grantSession(res);
    res.json({ ok: true });
  });

  router.post("/logout", (_req, res) => {
    res.setHeader("Set-Cookie", clearedSessionCookie());
    res.json({ ok: true });
  });

  // Set or change the password. Reachable unauthenticated only when no
  // password is set yet (the gate is inactive then, and the caller already has
  // a shell). Once enabled, `authGate` requires a session AND the current
  // password must be supplied, so a stolen session alone cannot lock the
  // owner out.
  router.post("/password", async (req, res) => {
    const config = loadConfig();
    const { currentPassword, newPassword } = (req.body ?? {}) as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };

    if (config.passwordEnabled && config.passwordHash) {
      await sleep(throttle.delayMs("password"));
      if (typeof currentPassword !== "string" || !verifyPassword(currentPassword, config.passwordHash)) {
        throttle.recordFailure("password");
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }
      throttle.reset("password");
    }

    const invalid = validatePassword(newPassword);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }

    saveConfig({
      passwordEnabled: true,
      passwordHash: hashPassword(newPassword as string),
      // Rotating the secret invalidates sessions held elsewhere; the caller
      // gets a replacement below so they aren't logged out of their own change.
      sessionSecret: randomBytes(32).toString("hex"),
    });
    grantSession(res);
    res.json({ ok: true, enabled: true });
  });

  router.post("/password/disable", async (req, res) => {
    const config = loadConfig();
    if (!config.passwordEnabled || !config.passwordHash) {
      res.json({ ok: true, enabled: false });
      return;
    }

    const { currentPassword } = (req.body ?? {}) as { currentPassword?: unknown };
    await sleep(throttle.delayMs("password"));
    if (typeof currentPassword !== "string" || !verifyPassword(currentPassword, config.passwordHash)) {
      throttle.recordFailure("password");
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }
    throttle.reset("password");

    saveConfig({
      passwordEnabled: false,
      passwordHash: null,
      sessionSecret: randomBytes(32).toString("hex"),
    });
    res.setHeader("Set-Cookie", clearedSessionCookie());
    res.json({ ok: true, enabled: false });
  });

  app.use("/api/auth", router);
}

/**
 * Reject socket connections without a valid session. Without this the login
 * modal would be cosmetic — the terminal is driven entirely over Socket.IO.
 */
export function gateSocketIO(io: SocketIOServer): void {
  io.use((socket, next) => {
    if (isRequestAuthenticated(socket.handshake.headers.cookie)) {
      next();
      return;
    }
    next(new Error("unauthorized"));
  });
}
