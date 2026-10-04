import { describe, expect, it } from "vitest";
import { COMBO_SETS, comboSequence, FN_COMBO_KEYS, MAIN_COMBO_KEYS, MODIFIER_PARAM, type NamedKey } from "./combos";

/** Reads a key's own sequence, failing loudly if it is a character key. */
function seqLookup(set: NamedKey[]) {
  return (label: string, modifier: number) => {
    const key = set.find((k) => k.label === label);
    if (!key?.seq) throw new Error(`"${label}" has no sequence of its own`);
    return key.seq(modifier);
  };
}

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
  const seqOf = seqLookup(MAIN_COMBO_KEYS);

  it("encodes arrows as CSI 1;<mod><final>", () => {
    expect(seqOf("↑", 5)).toBe("\x1b[1;5A");
    expect(seqOf("↓", 5)).toBe("\x1b[1;5B");
    expect(seqOf("→", 5)).toBe("\x1b[1;5C");
    expect(seqOf("←", 5)).toBe("\x1b[1;5D");
  });

  it("uses H and F for Home and End", () => {
    expect(seqOf("Home", 3)).toBe("\x1b[1;3H");
    expect(seqOf("End", 3)).toBe("\x1b[1;3F");
  });

  it("puts the tilde keys' code first", () => {
    expect(seqOf("PgUp", 5)).toBe("\x1b[5;5~");
    expect(seqOf("PgDn", 5)).toBe("\x1b[6;5~");
    expect(seqOf("Ins", 5)).toBe("\x1b[2;5~");
    expect(seqOf("Del", 5)).toBe("\x1b[3;5~");
  });
});

describe("function keys", () => {
  const seqOf = seqLookup(FN_COMBO_KEYS);

  it("uses the SS3 finals for F1-F4", () => {
    expect(seqOf("F1", 5)).toBe("\x1b[1;5P");
    expect(seqOf("F4", 5)).toBe("\x1b[1;5S");
  });

  it("uses tilde codes for F5 and up, skipping 16 and 22 as VT does", () => {
    expect(seqOf("F5", 5)).toBe("\x1b[15;5~");
    expect(seqOf("F6", 5)).toBe("\x1b[17;5~");
    expect(seqOf("F11", 5)).toBe("\x1b[23;5~");
    expect(seqOf("F12", 5)).toBe("\x1b[24;5~");
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

describe("the main set after absorbing the always-present row", () => {
  it("sends the plain control character with no modifier", () => {
    expect(comboSequence("Enter", "none")).toBe("\r");
    expect(comboSequence("Bksp", "none")).toBe("\x7f");
    expect(comboSequence("Esc", "none")).toBe("\x1b");
    expect(comboSequence("Tab", "none")).toBe("\t");
  });

  it("encodes them with CSI u once a modifier is on, since they have no other form", () => {
    expect(comboSequence("Enter", "ctrl")).toBe("\x1b[13;5u");
    expect(comboSequence("Tab", "alt")).toBe("\x1b[9;3u");
    expect(comboSequence("Esc", "ctrl+shift")).toBe("\x1b[27;6u");
  });

  it("still carries the keys the old nav set had", () => {
    for (const label of ["←", "→", "↑", "↓", "Home", "End", "PgUp", "PgDn", "Ins", "Del"]) {
      expect(comboSequence(label, "none").startsWith("\x1b[")).toBe(true);
    }
  });

  it("opens on main", () => {
    expect(COMBO_SETS[0]).toBe("main");
  });
});

describe("the shift modifier", () => {
  it("is what makes capitals reachable at all", () => {
    expect(comboSequence("A", "none")).toBe("a");
    expect(comboSequence("A", "shift")).toBe("A");
  });

  it("sends back-tab for Shift+Tab, not the generic CSI u form", () => {
    // What cycles permission modes in Claude Code; CSI 9;2u reaches nothing.
    expect(comboSequence("Tab", "shift")).toBe("\x1b[Z");
    expect(comboSequence("Tab", "ctrl")).toBe("\x1b[9;5u");
  });

  it("uses parameter 2 for the keys that take one", () => {
    expect(comboSequence("←", "shift")).toBe("\x1b[1;2D");
    expect(comboSequence("F3", "shift")).toBe("\x1b[1;2R");
    expect(comboSequence("PgDn", "shift")).toBe("\x1b[6;2~");
  });

  it("gives the digits their shifted characters", () => {
    expect(comboSequence("1", "shift")).toBe("!");
    expect(comboSequence("7", "shift")).toBe("&");
    expect(comboSequence("0", "shift")).toBe(")");
  });

  it("leaves an already-specific character alone", () => {
    // The symbol set is characters, not keys, so there is nothing to shift.
    expect(comboSequence("[", "shift")).toBe("[");
    expect(comboSequence("Space", "shift")).toBe(" ");
  });

  it("does not disturb the other modifiers", () => {
    expect(comboSequence("A", "ctrl")).toBe("\x01");
    expect(comboSequence("A", "alt")).toBe("\x1ba");
    expect(comboSequence("A", "alt+shift")).toBe("\x1bA");
    expect(comboSequence("←", "ctrl")).toBe("\x1b[1;5D");
  });
});

describe("the main set's order", () => {
  const labels = MAIN_COMBO_KEYS.map((k) => k.label);
  const at = (label: string) => labels.indexOf(label);

  it("leads with confirm, cancel and the cursor", () => {
    expect(labels.slice(0, 8)).toEqual(["Enter", "Bksp", "Esc", "Tab", "←", "→", "↑", "↓"]);
  });

  it("puts answering a prompt, then paging, ahead of Home/End", () => {
    expect(at("Y")).toBeLessThan(at("PgUp"));
    expect(at("PgUp")).toBeLessThan(at("Home"));
    expect(at("PgDn")).toBeLessThan(at("Home"));
  });

  it("leaves the rare keys last", () => {
    expect(labels.slice(-2)).toEqual(["Ins", "Del"]);
  });

  it("applies a modifier to y/n the way it does to any letter", () => {
    expect(comboSequence("Y", "none")).toBe("y");
    expect(comboSequence("Y", "shift")).toBe("Y");
    expect(comboSequence("N", "ctrl")).toBe("\x0e");
  });
});
