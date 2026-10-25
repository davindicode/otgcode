import { describe, expect, it } from "vitest";
import { dropIndex } from "./TabBar";

/** A row of tabs, laid out left to right from `left`. */
const row = (widths: number[], left = 0) =>
  widths.map((width) => {
    const r = { left, width };
    left += width;
    return r;
  });

describe("dropIndex", () => {
  const tabs = row([120, 60, 60]);

  it("drops before the first tab whose middle the pointer has not passed", () => {
    expect(dropIndex(tabs, 0)).toBe(0);
    expect(dropIndex(tabs, 59)).toBe(0);
    expect(dropIndex(tabs, 61)).toBe(1);
    expect(dropIndex(tabs, 151)).toBe(2);
  });

  it("drops at the end past the last middle, including well past the strip", () => {
    expect(dropIndex(tabs, 211)).toBe(3);
    expect(dropIndex(tabs, 99999)).toBe(3);
  });

  it("drops at the start when the strip is scrolled, so x is left of everything", () => {
    // Scrolled right: the tabs sit at negative coordinates. Dragging to the
    // left edge still has to mean "in front of them".
    expect(dropIndex(row([120, 60, 60], -200), -210)).toBe(0);
  });

  it("drops at the end of an empty strip", () => {
    expect(dropIndex([], 40)).toBe(0);
  });

  it("never goes backwards as the pointer goes forwards", () => {
    // It runs again on every pointermove, against a strip it has just
    // reordered. Anything but monotonic is a tab that swaps back and forth
    // under a pointer moving one way.
    let last = 0;
    for (let x = -50; x < 300; x++) {
      const at = dropIndex(tabs, x);
      expect(at, `x=${x}`).toBeGreaterThanOrEqual(last);
      last = at;
    }
  });
});
