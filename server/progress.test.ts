import { afterEach, describe, expect, it } from "vitest";
import { frames } from "./progress";

const KEYS = ["LC_ALL", "LC_CTYPE", "LANG"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function setLocale(vars: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) {
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
}

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("spinner frames", () => {
  it("uses braille when the locale advertises UTF-8", () => {
    setLocale({ LANG: "en_US.UTF-8" });
    expect(frames()[0]).toBe("⠋");
    setLocale({ LC_ALL: "C.utf8" });
    expect(frames()[0]).toBe("⠋");
  });

  it("falls back to ASCII when it doesn't — braille would render as tofu", () => {
    setLocale({ LANG: "C" });
    expect(frames()).toEqual(["-", "\\", "|", "/"]);
    setLocale({ LANG: "en_US.ISO-8859-1" });
    expect(frames()).toEqual(["-", "\\", "|", "/"]);
  });

  it("falls back when no locale is set at all", () => {
    setLocale({});
    expect(frames()).toEqual(["-", "\\", "|", "/"]);
  });

  it("prefers LC_ALL over LANG, as the shell does", () => {
    setLocale({ LC_ALL: "C", LANG: "en_US.UTF-8" });
    expect(frames()).toEqual(["-", "\\", "|", "/"]);
  });
});
