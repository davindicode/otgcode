import { useEffect, useRef } from "react";
import { MIN_PANE_PX } from "~/lib/workspace.shared";
import { useTabsStore } from "~/stores/tabsStore";
import { useWorkspaceStore } from "~/stores/workspaceStore";

const refitVisible = () => useTabsStore.getState().refitVisible();

/**
 * The draggable seam between the two panes.
 *
 * Reports a fraction rather than a pixel width, so the split survives the
 * window being resized, and clamps against a minimum pane in pixels so
 * neither side can be dragged down to a sliver. Terminals are refitted once
 * the drag ends rather than on every move: a fit remeasures the grid and
 * reflows the rows, which is not work to do sixty times a second.
 */
export default function PaneDivider() {
  const split = useWorkspaceStore((s) => s.split);
  const setSplit = useWorkspaceStore((s) => s.setSplit);
  const ref = useRef<HTMLDivElement>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = ref.current;
    const row = el?.parentElement;
    if (!el || !row) return;
    // Otherwise the drag selects the text in both panes on the way across.
    e.preventDefault();
    // Keeps it lit for the whole drag; the CSS says why hover cannot.
    el.dataset.dragging = "true";
    const { left, width } = row.getBoundingClientRect();
    const min = MIN_PANE_PX / width;

    const onMove = (ev: PointerEvent) => setSplit(Math.min(1 - min, Math.max(min, (ev.clientX - left) / width)));
    const end = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      delete el.dataset.dragging;
      refitVisible();
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
  };

  /**
   * The same control from the keyboard, in steps. A divider only a pointer can
   * move is one some people cannot move at all — and on a laptop trackpad the
   * arrows are easier than hitting a six-pixel target anyway.
   */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === "ArrowLeft") setSplit(split - step);
    else if (e.key === "ArrowRight") setSplit(split + step);
    else return;
    e.preventDefault();
  };

  // Covers the keyboard nudges, which have no release to refit on. Trailing,
  // so holding an arrow down fits once at the end rather than per repeat.
  // biome-ignore lint/correctness/useExhaustiveDependencies: split is the trigger, not a value the effect reads
  useEffect(() => {
    const id = setTimeout(refitVisible, 150);
    return () => clearTimeout(id);
  }, [split]);

  return (
    <>
      <div
        ref={ref}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panes"
        aria-valuenow={Math.round(split * 100)}
        aria-valuemin={20}
        aria-valuemax={80}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        onDoubleClick={() => setSplit(0.5)}
        title="Drag to resize — double-click to even them up"
        className="pane-divider"
      />
      {/* The strip row's half of the same line: drawn, never grabbed, and lit
          by the divider through a sibling rule so the two read as one. After
          it in the DOM because that rule needs it to be; the grid decides
          where each of them actually goes. */}
      <div className="pane-seam" aria-hidden="true" />
    </>
  );
}
