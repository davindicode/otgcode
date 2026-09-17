import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

// OTG Code hands whoever reaches it a shell as the launching user, so the
// optional access password is the only thing standing between a leaked tunnel
// URL and that shell. Config lives outside the repo so it survives updates and
// is never committed.
const CONFIG_DIR = process.env.OTG_CONFIG_DIR || join(homedir(), ".otgcode");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export const SESSION_COOKIE = "otg_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const MIN_PASSWORD_LENGTH = 6;

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
const SECRET_BYTES = 32;

export interface AuthConfig {
  passwordEnabled: boolean;
  /** `scrypt:<saltHex>:<keyHex>`, or null when no password has ever been set. */
  passwordHash: string | null;
  /**
   * HMAC key for session tokens. Rotated on every password change and on
   * disable, which invalidates every previously issued session.
   */
  sessionSecret: string;
}

function defaultConfig(): AuthConfig {
  return { passwordEnabled: false, passwordHash: null, sessionSecret: randomBytes(SECRET_BYTES).toString("hex") };
}

let cached: AuthConfig | null = null;

export function loadConfig(): AuthConfig {
  if (cached) return cached;
  try {
    if (existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as Partial<AuthConfig>;
      cached = {
        passwordEnabled: parsed.passwordEnabled === true && typeof parsed.passwordHash === "string",
        passwordHash: typeof parsed.passwordHash === "string" ? parsed.passwordHash : null,
        sessionSecret:
          typeof parsed.sessionSecret === "string" && parsed.sessionSecret.length >= 32
            ? parsed.sessionSecret
            : randomBytes(SECRET_BYTES).toString("hex"),
      };
      return cached;
    }
  } catch (err) {
    console.error(`  Could not read ${CONFIG_FILE}, falling back to no password: ${(err as Error).message}`);
  }
  cached = defaultConfig();
  return cached;
}

export function saveConfig(next: AuthConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  try {
    // Re-assert perms: writeFileSync's mode is ignored for an existing file.
    chmodSync(CONFIG_FILE, 0o600);
  } catch {
    // Best effort — Windows and some mounts don't support POSIX modes.
  }
  cached = next;
}

/** Drop the in-memory copy so the next read comes from disk (tests). */
export function resetConfigCache(): void {
  cached = null;
}

export function isPasswordEnabled(): boolean {
  const config = loadConfig();
  return config.passwordEnabled && !!config.passwordHash;
}

export function localUsername(): string {
  try {
    return userInfo().username;
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const key = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, saltHex, keyHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(keyHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== SCRYPT_KEYLEN) return false;
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), SCRYPT_KEYLEN);
  return timingSafeEqual(actual, expected);
}

/** Null when acceptable, otherwise the reason it was rejected. */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length === 0) return "Password is required";
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > 512) return "Password is too long";
  return null;
}

// ---------------------------------------------------------------------------
// Session tokens — stateless `<expiryMs>.<hmac>`, keyed by the rotating secret
// ---------------------------------------------------------------------------

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueToken(secret: string, now = Date.now(), ttlMs = SESSION_TTL_MS): string {
  const expiresAt = String(now + ttlMs);
  return `${expiresAt}.${sign(expiresAt, secret)}`;
}

export function verifyToken(token: string | undefined | null, secret: string, now = Date.now()): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expiresAt = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!/^\d+$/.test(expiresAt) || !signature) return false;

  const expected = Buffer.from(sign(expiresAt, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  if (!timingSafeEqual(expected, actual)) return false;

  return Number(expiresAt) > now;
}

// ---------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------

export function parseCookies(header: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    if (!name || name in out) continue;
    try {
      out[name] = decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      out[name] = part.slice(eq + 1).trim();
    }
  }
  return out;
}

// `Secure` is deliberately omitted: the same server is reached over https
// through the Cloudflare tunnel and over plain http on localhost, and a Secure
// cookie would never be stored in the localhost case.
export function sessionCookie(token: string, ttlMs = SESSION_TTL_MS): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ttlMs / 1000)}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** True when this request carries a session valid for the current secret. */
export function isRequestAuthenticated(cookieHeader: string | undefined | null): boolean {
  const config = loadConfig();
  if (!config.passwordEnabled || !config.passwordHash) return true;
  return verifyToken(parseCookies(cookieHeader)[SESSION_COOKIE], config.sessionSecret);
}

// ---------------------------------------------------------------------------
// Login throttling — a quick-tunnel URL is public, so unbounded guessing at a
// user-chosen password is the realistic attack.
//
// This slows failures down instead of locking the account out. Every request
// arrives from cloudflared as 127.0.0.1, so per-IP buckets can't be separated
// and the client-supplied `cf-connecting-ip` is spoofable — a hard lockout
// would therefore let an attacker shut the real user out of their own machine.
// A backoff that always still checks the password can't be abused that way,
// and combined with scrypt's cost it caps guessing at a few tries a minute.
// ---------------------------------------------------------------------------

export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const MAX_BACKOFF_MS = 5000;

export interface LoginThrottle {
  /** How long to stall this attempt before answering. */
  delayMs: (key: string, now?: number) => number;
  recordFailure: (key: string, now?: number) => void;
  reset: (key: string) => void;
}

export function createLoginThrottle(windowMs = ATTEMPT_WINDOW_MS, maxDelayMs = MAX_BACKOFF_MS): LoginThrottle {
  const failures = new Map<string, { count: number; expiresAt: number }>();

  const current = (key: string, now: number) => {
    const entry = failures.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      failures.delete(key);
      return null;
    }
    return entry;
  };

  return {
    delayMs: (key, now = Date.now()) => {
      const entry = current(key, now);
      if (!entry) return 0;
      // 100ms, 200ms, 400ms, ... capped.
      return Math.min(2 ** (entry.count - 1) * 100, maxDelayMs);
    },
    recordFailure: (key, now = Date.now()) => {
      const entry = current(key, now);
      if (entry) {
        entry.count += 1;
        entry.expiresAt = now + windowMs;
      } else {
        failures.set(key, { count: 1, expiresAt: now + windowMs });
      }
    },
    reset: (key) => {
      failures.delete(key);
    },
  };
}
