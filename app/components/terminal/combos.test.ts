import { describe, expect, it } from "vitest";
import { comboSequence, FN_COMBO_KEYS, MODIFIER_PARAM, NAV_COMBO_KEYS } from "./combos";

const seq = (label: string, mode: Parameters<typeof comboSequence>[1]) => comboSequence(label, mode);

describe("modifier parameters", () => {
  // xterm's scheme: 1 + bitmask of shift(1) alt(2) ctrl(4).
  it("matches the xterm modifier encoding", () => {
    expect(MODIFIER_PARAM.ctrl).toBe(5);
    expect(MODIFIER_PARAM["ctrl+shift"]).toBe(6);
    expect(MODIFIER_PARAM.alt).toBe(3);
    expect(MODIFIER_PARAM["alt+shift"]).toBe(4);
  });
});

describe("arrow and navigation keys", () => {
  const find = (label: string) => NAV_COMBO_KEYS.find((k) => k.label === label);

  it("encodes arrows as CSI 1;<mod><final>", () => {
    expect(find("↑")?.seq(5)).toBe("\x1b[1;5A");
    expect(find("↓")?.seq(5)).toBe("\x1b[1;5B");
    expect(find("→")?.seq(5)).toBe("\x1b[1;5C");
    expect(find("←")?.seq(5)).toBe("\x1b[1;5D");
  });

  it("uses H and F for Home and End", () => {
    expect(find("Home")?.seq(3)).toBe("\x1b[1;3H");
    expect(find("End")?.seq(3)).toBe("\x1b[1;3F");
  });

  it("puts the tilde keys' code first", () => {
    expect(find("PgUp")?.seq(5)).toBe("\x1b[5;5~");
    expect(find("PgDn")?.seq(5)).toBe("\x1b[6;5~");
    expect(find("Ins")?.seq(5)).toBe("\x1b[2;5~");
    expect(find("Del")?.seq(5)).toBe("\x1b[3;5~");
  });
});

describe("function keys", () => {
  const find = (label: string) => FN_COMBO_KEYS.find((k) => k.label === label);

  it("uses the SS3 finals for F1-F4", () => {
    expect(find("F1")?.seq(5)).toBe("\x1b[1;5P");
    expect(find("F4")?.seq(5)).toBe("\x1b[1;5S");
  });

  it("uses tilde codes for F5 and up, skipping 16 and 22 as VT does", () => {
    expect(find("F5")?.seq(5)).toBe("\x1b[15;5~");
    expect(find("F6")?.seq(5)).toBe("\x1b[17;5~");
    expect(find("F11")?.seq(5)).toBe("\x1b[23;5~");
    expect(find("F12")?.seq(5)).toBe("\x1b[24;5~");
  });
});

describe("letters and digits", () => {
  it("sends a real control code for Ctrl+letter", () => {
    expect(seq("A", "ctrl")).toBe("\x01");
    expect(seq("C", "ctrl")).toBe("\x03");
    expect(seq("Z", "ctrl")).toBe("\x1a");
  });

  it("falls back to CSI u for Ctrl+digit, which has no control code", () => {
    expect(seq("0", "ctrl")).toBe("\x1b[48;5u");
  });

  it("prefixes with ESC for Alt, lowercasing letters as a real Alt press does", () => {
    expect(seq("A", "alt")).toBe("\x1ba");
    expect(seq("A", "alt+shift")).toBe("\x1bA");
  });
});

describe("symbols", () => {
  it("uses the genuine control codes under Ctrl", () => {
    expect(seq("Space", "ctrl")).toBe("\x00");
    expect(seq("[", "ctrl")).toBe("\x1b");
    expect(seq("]", "ctrl")).toBe("\x1d");
    expect(seq("_", "ctrl")).toBe("\x1f");
  });

  it("falls back to ESC + char under Alt", () => {
    expect(seq("-", "alt")).toBe("\x1b-");
    expect(seq(".", "alt")).toBe("\x1b.");
  });
});

describe("the none modifier", () => {
  it("sends a plain character for letters, digits and symbols", () => {
    expect(comboSequence("A", "none")).toBe("a");
    expect(comboSequence("7", "none")).toBe("7");
    expect(comboSequence("[", "none")).toBe("[");
    expect(comboSequence("Space", "none")).toBe(" ");
  });

  it("uses the canonical unmodified form for named keys, not a 1;1 parameter", () => {
    expect(comboSequence("←", "none")).toBe("\x1b[D");
    expect(comboSequence("Home", "none")).toBe("\x1b[H");
    expect(comboSequence("PgUp", "none")).toBe("\x1b[5~");
    expect(comboSequence("F5", "none")).toBe("\x1b[15~");
    // F1-F4 keep the CSI form they already had; only the parameter drops out.
    expect(comboSequence("F1", "none")).toBe("\x1b[P");
  });

  it("leaves the modified sequences exactly as they were", () => {
    expect(comboSequence("←", "ctrl")).toBe("\x1b[1;5D");
    expect(comboSequence("PgUp", "alt")).toBe("\x1b[5;3~");
    expect(comboSequence("A", "ctrl")).toBe("\x01");
  });
});
