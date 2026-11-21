import { cleanup, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useRestoredScroll } from "~/lib/useRestoredScroll";
import { readView, saveView } from "~/lib/viewState";

const PATH = "/tmp/long.md";

/**
 * A scrolling element whose content height can be changed, which jsdom has no
 * layout to give us: `scrollTop` clamps to `max`, the way a real one clamps to
 * the content that exists when it is set.
 */
function pane(max: number) {
  const el = document.createElement("div");
  let top = 0;
  Object.defineProperty(el, "scrollTop", {
    get: () => top,
    set: (v: number) => {
      top = Math.min(v, grown);
    },
  });
  let grown = max;
  return { ref: { current: el }, el, grow: (to: number) => (grown = to) };
}

/** Long enough for a few animation frames to have run. */
const frames = () => new Promise((r) => setTimeout(r, 60));

beforeEach(() => {
  // No `globals: true` here, so nothing unmounts the last test's hook for us —
  // and its restore loop would still be running.
  cleanup();
  localStorage.clear();
});

describe("a pane whose offset is being restored", () => {
  it("keeps putting it back until the content is tall enough to hold it", async () => {
    saveView(PATH, { previewScroll: 500 });
    const { ref, el, grow } = pane(0);

    renderHook(() => useRestoredScroll(ref, PATH, "previewScroll"));
    // Nothing rendered yet, so the assignment is clamped away — which is the
    // whole bug: one attempt at mount and the offset is gone.
    expect(el.scrollTop).toBe(0);

    grow(500);
    await frames();

    expect(el.scrollTop).toBe(500);
  });

  it("does not write down a clamped offset of its own making", async () => {
    saveView(PATH, { previewScroll: 500 });
    const { ref, el } = pane(120);

    const { result } = renderHook(() => useRestoredScroll(ref, PATH, "previewScroll"));
    // The pane is short, so the restore lands at 120. That scroll event is
    // ours, and taking it for the reader's would overwrite where they were.
    expect(el.scrollTop).toBe(120);
    result.current();
    await frames();

    expect(readView(PATH).previewScroll).toBe(500);
  });
});

describe("a pane being scrolled by the reader", () => {
  it("writes the offset down once the scrolling settles", async () => {
    const { ref, el } = pane(1000);

    const { result } = renderHook(() => useRestoredScroll(ref, PATH, "previewScroll"));
    el.scrollTop = 240;
    result.current();

    expect(readView(PATH).previewScroll).toBeUndefined();
    await new Promise((r) => setTimeout(r, 450));
    expect(readView(PATH).previewScroll).toBe(240);
  });

  it("leaves the text view's own offset alone", async () => {
    saveView(PATH, { scroll: 90 });
    const { ref, el } = pane(1000);

    const { result } = renderHook(() => useRestoredScroll(ref, PATH, "previewScroll"));
    el.scrollTop = 240;
    result.current();
    await new Promise((r) => setTimeout(r, 450));

    // One file, two heights: the source in the text views and the document the
    // preview makes of it.
    expect(readView(PATH)).toMatchObject({ scroll: 90, previewScroll: 240 });
  });
});
