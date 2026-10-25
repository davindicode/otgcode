import { describe, expect, it } from "vitest";
import { CLI_VENDORS, CODE_COMMON_KEYS, ctrl } from "./cliKeys";

const all = CLI_VENDORS.flatMap((v) => v.keys).concat(CODE_COMMON_KEYS);

describe("ctrl", () => {
  it("maps a letter to its control code", () => {
    expect(ctrl("a")).toBe("\x01");
    expect(ctrl("x")).toBe("\x18");
    expect(ctrl("z")).toBe("\x1a");
  });

  it("does not care about case, since the label is upper and the code is not", () => {
    expect(ctrl("K")).toBe(ctrl("k"));
  });

  it("covers the punctuation that has a control code", () => {
    expect(ctrl("_")).toBe("\x1f");
    expect(ctrl("]")).toBe("\x1d");
  });
});

describe("CLI key sets", () => {
  it("sends a control code or an escape sequence, never a literal label", () => {
    for (const key of all) {
      // Every one of these is a control sequence: nothing in a vendor set is
      // meant to type a printable word into the prompt.
      // biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point of the assertion
      expect(key.key, key.label).toMatch(/^[\x00-\x1f\x7f]/);
    }
  });

  it("puts the leader first in a chord, so the CLI reads it as a prefix", () => {
    const chords = all.filter((k) => k.label.startsWith("⌃X "));
    // Both Claude Code and opencode use ctrl+x for this.
    expect(chords.length).toBeGreaterThan(0);
    for (const key of chords) {
      expect(key.key.startsWith("\x18"), key.label).toBe(true);
      expect(key.key.length, key.label).toBe(2);
    }
  });

  it("toggles the opencode sidebar, which is the leader then b", () => {
    const opencode = CLI_VENDORS.find((v) => v.name === "opencode");
    expect(opencode?.keys.find((k) => k.title.includes("sidebar"))?.key).toBe("\x18b");
  });

  it("gives every key in a set its own label, so no button is a duplicate", () => {
    for (const vendor of CLI_VENDORS) {
      const labels = [...vendor.keys, ...CODE_COMMON_KEYS].map((k) => k.label);
      expect(new Set(labels).size, vendor.name).toBe(labels.length);
    }
  });

  it("leaves the trailing Enter off a slash command, which is a second write", () => {
    for (const vendor of CLI_VENDORS) {
      for (const cmd of vendor.slashCmds) {
        expect(cmd.command.startsWith("/"), cmd.label).toBe(true);
        expect(cmd.command, cmd.label).not.toMatch(/[\r\n]/);
      }
    }
  });
});
