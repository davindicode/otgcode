import { describe, expect, it } from "vitest";
import {
  createLoginThrottle,
  hashPassword,
  issueToken,
  parseCookies,
  SESSION_COOKIE,
  validatePassword,
  verifyPassword,
  verifyToken,
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
    expect(verifyToken(issueToken(SECRET), SECRET)).toBe(true);
  });

  it("rejects a token signed with a different secret (rotation logs sessions out)", () => {
    expect(verifyToken(issueToken(SECRET), "b".repeat(64))).toBe(false);
  });

  it("rejects an expired token", () => {
    const token = issueToken(SECRET, 1_000, 5_000);
    expect(verifyToken(token, SECRET, 5_000)).toBe(true);
    expect(verifyToken(token, SECRET, 6_001)).toBe(false);
  });

  it("rejects tampered expiry, tampered signature and junk", () => {
    const token = issueToken(SECRET, 1_000, 5_000);
    const [, signature] = token.split(".");
    expect(verifyToken(`99999999999999.${signature}`, SECRET, 2_000)).toBe(false);
    expect(verifyToken(`${token}x`, SECRET, 2_000)).toBe(false);
    expect(verifyToken("", SECRET)).toBe(false);
    expect(verifyToken(undefined, SECRET)).toBe(false);
    expect(verifyToken("nodot", SECRET)).toBe(false);
    expect(verifyToken(".onlysig", SECRET)).toBe(false);
    expect(verifyToken("notanumber.sig", SECRET)).toBe(false);
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
