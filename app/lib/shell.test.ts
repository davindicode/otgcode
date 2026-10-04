import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { shellQuote } from "./shell";

/** What a shell actually receives, which is the only thing that matters here. */
const roundTrip = (value: string) =>
  execFileSync("/bin/sh", ["-c", `printf %s ${shellQuote(value)}`], { encoding: "utf-8" });

describe("shellQuote", () => {
  it("survives the characters that break naive quoting", () => {
    for (const value of [
      "plain",
      "it's",
      "'leading",
      "trailing'",
      "''",
      'say "hi"',
      "a b\tc",
      "$HOME `whoami` $(id)",
      "semi; colon && pipe | redirect > file",
      "back\\slash",
      "新しい",
      "",
    ]) {
      expect(roundTrip(value)).toBe(value);
    }
  });

  it("does not let a quote end the quoting early", () => {
    // The shape that would otherwise run `whoami` instead of quoting it.
    expect(roundTrip("fix'; whoami; echo '")).toBe("fix'; whoami; echo '");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });
});
