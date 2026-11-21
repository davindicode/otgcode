import { useRef } from "react";
import { MIN_PANE_PX } from "~/lib/workspace.shared";
import { useWorkspaceStore } from "~/stores/workspaceStore";

/**
 * The draggable seam between the two panes.
 *
 * Reports a fraction rather than a pixel width, so the split survives the
 * window being resized, and clamps against a minimum pane in pixels so
 * neither side can be dragged down to a sliver.
 *
 * Nothing here refits a terminal. It used to, on a timer after the drag and
 * again after a keyboard nudge, and so did the split being switched on — three
 * guesses at when the layout would settle, all of them for a measurement that
 * `TerminalPanel` already takes properly: it keeps a `ResizeObserver` on the
 * terminal's own element, and every one of these moves that element. The
 * observer fires when the box has actually changed rather than when a timeout
 * hoped it had.
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
