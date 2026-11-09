import { type RefObject, useEffect, useRef } from "react";
import { readView, saveView, type ViewState } from "./viewState";

/** Quiet period before a scroll position is written down. */
const SETTLE_MS = 400;
/** How long to keep putting the offset back while the content settles. */
const RESTORE_MS = 3000;

/** The `ViewState` fields that hold a vertical offset. */
type ScrollField = "scroll" | "previewScroll";

/**
 * Put a scrolling pane back where it was, and remember where it goes.
 *
 * For the panes whose content arrives after their first paint — a markdown
 * preview with images and equations in it, a notebook, a PDF whose pages are
 * rasterised as they come into view. A scroll offset is clamped to the content
 * that exists when it is set, so one assignment at mount lands at the bottom
 * of a document three lines tall and the place you were reading is gone.
 *
 * Returns the scroll handler to put on the element.
 */
export function useRestoredScroll(
  ref: RefObject<HTMLElement | null>,
  key: string,
  field: ScrollField = "scroll",
): () => void {
  const settle = useRef(0);
  /** True while the restore still owns the offset, so nothing else writes it. */
  const restoring = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const want = readView(key)[field] ?? 0;

    let raf = 0;
    const stop = () => {
      restoring.current = false;
      cancelAnimationFrame(raf);
    };

    if (want > 0) {
      restoring.current = true;
      const deadline = Date.now() + RESTORE_MS;
      // Put it back on every frame until it sticks — which is as soon as the
      // document is tall enough to hold it — or until the content has had long
      // enough that it never will.
      const tick = () => {
        el.scrollTop = want;
        if (Math.abs(el.scrollTop - want) < 2 || Date.now() > deadline) {
          stop();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      tick();
      // Whoever scrolls first wins: a finger on the pane during those frames
      // is someone who has decided where to be, and being dragged back to
      // where you were yesterday is worse than losing the offset.
      el.addEventListener("pointerdown", stop, { once: true });
      el.addEventListener("wheel", stop, { once: true, passive: true });
      el.addEventListener("keydown", stop, { once: true });
    }

    return () => {
      stop();
      clearTimeout(settle.current);
      el.removeEventListener("pointerdown", stop);
      el.removeEventListener("wheel", stop);
      el.removeEventListener("keydown", stop);
    };
  }, [ref, key, field]);

  return () => {
    const el = ref.current;
    // Those assignments scroll the pane too, and a clamped one would write
    // down the offset it is still trying to reach.
    if (!el || restoring.current) return;
    const top = el.scrollTop;
    const patch: ViewState = {};
    patch[field] = top;
    clearTimeout(settle.current);
    settle.current = window.setTimeout(() => saveView(key, patch), SETTLE_MS);
  };
}
