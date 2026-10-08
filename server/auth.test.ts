import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createLoginThrottle,
  hashPassword,
  issueToken,
  MIN_PASSWORD_LENGTH,
  parseCookies,
  readToken,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  SITTING_TTL_MS,
  sessionCookie,
  validatePassword,
  verifyPassword,
} from "./auth";
import { isPublicPath } from "./auth-routes";

const SECRET = "a".repeat(64);

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", () => {
    const stored = hashPassword("correct horse");
    expect(verifyPassword("correct horse", stored)).toBe(true);
    expect(verifyPassword("Correct horse", stored)).toBe(false);
    expect(verifyPassword("", stored)).toBe(false);
  });

  it("salts each hash, so the same password stores differently", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("rejects missing or malformed stored hashes", () => {
    expect(verifyPassword("x", null)).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "plaintext")).toBe(false);
    expect(verifyPassword("x", "bcrypt:aa:bb")).toBe(false);
    expect(verifyPassword("x", "scrypt:aa:tooshort")).toBe(false);
  });
});

describe("validatePassword", () => {
  it("accepts a long enough password", () => {
    expect(validatePassword("hunter22")).toBeNull();
  });

  it("rejects empty, short, non-string and oversized values", () => {
    expect(validatePassword("")).toBe("Password is required");
    expect(validatePassword(undefined)).toBe("Password is required");
    expect(validatePassword(12345678)).toBe("Password is required");
    expect(validatePassword("short")).toMatch(/at least 6/);
    expect(validatePassword("x".repeat(513))).toBe("Password is too long");
  });
});

describe("session tokens", () => {
  it("accepts a token it just issued", () => {
    expect(readToken(issueToken(SECRET), SECRET)).not.toBeNull();
  });

  it("rejects a token signed with a different secret (rotation logs sessions out)", () => {
    expect(readToken(issueToken(SECRET), "b".repeat(64))).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = issueToken(SECRET, 1_000, 5_000);
    expect(readToken(token, SECRET, 5_000)).not.toBeNull();
    expect(readToken(token, SECRET, 6_001)).toBeNull();
  });

  it("rejects tampered expiry, tampered signature and junk", () => {
    const token = issueToken(SECRET, 1_000, 5_000);
    const [, signature] = token.split(".");
    expect(readToken(`99999999999999.${signature}`, SECRET, 2_000)).toBeNull();
    expect(readToken(`${token}x`, SECRET, 2_000)).toBeNull();
    expect(readToken("", SECRET)).toBeNull();
    expect(readToken(undefined, SECRET)).toBeNull();
    expect(readToken("nodot", SECRET)).toBeNull();
    expect(readToken(".onlysig", SECRET)).toBeNull();
    expect(readToken("notanumber.sig", SECRET)).toBeNull();
  });
});

describe("parseCookies", () => {
  it("reads the session cookie out of a realistic header", () => {
    const cookies = parseCookies(`theme=dark; ${SESSION_COOKIE}=123.abc; other=1`);
    expect(cookies[SESSION_COOKIE]).toBe("123.abc");
    expect(cookies.theme).toBe("dark");
  });

  it("handles empty, missing and malformed headers", () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies("")).toEqual({});
    expect(parseCookies("novalue")).toEqual({});
    expect(parseCookies("=leadingequals")).toEqual({});
  });

  it("keeps the first occurrence of a repeated name", () => {
    expect(parseCookies("a=1; a=2").a).toBe("1");
  });
});

describe("isPublicPath", () => {
  it("allows only what the lock screen needs", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/api/auth/status")).toBe(true);
    expect(isPublicPath("/api/auth/login")).toBe(true);
    expect(isPublicPath("/api/auth/logout")).toBe(true);
    expect(isPublicPath("/assets/root-abc123.css")).toBe(true);
    expect(isPublicPath("/logo-square.png")).toBe(true);
    expect(isPublicPath("/favicon.ico")).toBe(true);
  });

  it("blocks the APIs that expose the filesystem and the terminal", () => {
    expect(isPublicPath("/api/files/list")).toBe(false);
    expect(isPublicPath("/api/files/download")).toBe(false);
    expect(isPublicPath("/api/files/download-zip")).toBe(false);
    expect(isPublicPath("/api/system-info")).toBe(false);
    expect(isPublicPath("/api/terminal/cwd")).toBe(false);
    expect(isPublicPath("/socket.io/")).toBe(false);
  });

  it("blocks changing the password itself", () => {
    expect(isPublicPath("/api/auth/password")).toBe(false);
    expect(isPublicPath("/api/auth/password/disable")).toBe(false);
  });

  it("does not let a static-looking extension smuggle a proxied path through", () => {
    expect(isPublicPath("/proxy/3000/main.js")).toBe(false);
    expect(isPublicPath("/proxy/3000/style.css")).toBe(false);
    expect(isPublicPath("/proxy/3000")).toBe(false);
    expect(isPublicPath("/proxy")).toBe(false);
  });

  it("blocks unknown paths by default", () => {
    expect(isPublicPath("/etc/passwd")).toBe(false);
    expect(isPublicPath("/whatever")).toBe(false);
  });
});

describe("login throttle", () => {
  it("does not delay a first attempt", () => {
    const throttle = createLoginThrottle();
    expect(throttle.delayMs("login", 0)).toBe(0);
  });

  it("backs off exponentially and caps the delay", () => {
    const throttle = createLoginThrottle(60_000, 5_000);
    throttle.recordFailure("login", 0);
    expect(throttle.delayMs("login", 0)).toBe(100);
    throttle.recordFailure("login", 1);
    expect(throttle.delayMs("login", 1)).toBe(200);
    throttle.recordFailure("login", 2);
    expect(throttle.delayMs("login", 2)).toBe(400);
    for (let i = 0; i < 10; i++) throttle.recordFailure("login", 3);
    expect(throttle.delayMs("login", 3)).toBe(5_000);
  });

  it("forgets failures once the window lapses", () => {
    const throttle = createLoginThrottle(60_000);
    throttle.recordFailure("login", 0);
    expect(throttle.delayMs("login", 59_999)).toBe(100);
    expect(throttle.delayMs("login", 60_001)).toBe(0);
  });

  it("clears the backoff on a successful login", () => {
    const throttle = createLoginThrottle();
    throttle.recordFailure("login", 0);
    throttle.reset("login");
    expect(throttle.delayMs("login", 0)).toBe(0);
  });

  it("tracks keys independently", () => {
    const throttle = createLoginThrottle();
    throttle.recordFailure("login", 0);
    expect(throttle.delayMs("password", 0)).toBe(0);
  });
});

describe("password length rule", () => {
  it("is the same number the client shows", async () => {
    const { MIN_PASSWORD_LENGTH: clientMin } = await import("../app/lib/workspace.shared");
    expect(clientMin).toBe(MIN_PASSWORD_LENGTH);
  });
});

describe("session cookie", () => {
  it("is a session cookie, so nothing is written to disk", () => {
    const cookie = sessionCookie("123.abc");
    expect(cookie).not.toMatch(/max-age/i);
    expect(cookie).not.toMatch(/expires/i);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("offers a short sitting and a browser-long option", () => {
    // A sitting has to outlast a page refresh but not an afternoon.
    expect(SITTING_TTL_MS).toBeGreaterThan(5 * 60 * 1000);
    expect(SITTING_TTL_MS).toBeLessThan(SESSION_TTL_MS);
  });

  it("expires a sitting token on time", () => {
    const token = issueToken(SECRET, 0, SITTING_TTL_MS);
    expect(readToken(token, SECRET, SITTING_TTL_MS - 1)).not.toBeNull();
    expect(readToken(token, SECRET, SITTING_TTL_MS + 1)).toBeNull();
  });
});

describe("readToken", () => {
  const secret = "s".repeat(64);

  it("reports when the session began", () => {
    const token = issueToken(secret, 1_000_000, 60_000);
    expect(readToken(token, secret, 1_000_001)).toEqual({ expiresAt: 1_060_000, issuedAt: 1_000_000 });
  });

  it("refuses the older two-part token, which cannot say when it began", () => {
    const legacy = `${2_000_000}.${createHmac("sha256", secret).update("2000000").digest("base64url")}`;
    expect(readToken(legacy, secret, 1_000_000)).toBeNull();
    expect(readToken(legacy, secret, 1_000_000)).toBeNull();
  });

  it("refuses a token whose issue time was edited, since it is signed too", () => {
    const token = issueToken(secret, 1_000_000, 60_000);
    const [expiresAt, , signature] = token.split(".");
    expect(readToken(`${expiresAt}.999.${signature}`, secret, 1_000_001)).toBeNull();
  });

  it("refuses junk, a wrong secret, and an expired session", () => {
    const token = issueToken(secret, 1_000_000, 60_000);
    expect(readToken("nonsense", secret)).toBeNull();
    expect(readToken(token, "other".repeat(16), 1_000_001)).toBeNull();
    expect(readToken(token, secret, 1_060_001)).toBeNull();
  });
});
