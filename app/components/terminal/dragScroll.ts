import { scrollOf, trace } from "~/lib/dragTrace";

/** Past this much movement it is a drag, not a click on a button. */
const DRAG_SLOP_PX = 4;

/**
 * Lets a mouse drag a horizontally scrolling row.
 *
 * Touch scrolls these natively and a trackpad has a sideways gesture, but a
 * plain mouse has neither — so in a narrow desktop window the overflowing half
 * of a key row was simply unreachable. Spread as `onPointerDown` on the
 * scrolling element; it reads the container off the event, so one function
 * serves every row.
 *
 * Press-and-hold already cancels itself once the pointer moves, so dragging
 * off a key does not send it. Buttons that run on click need the click
 * swallowing below, or a drag would fire whichever one it started on.
 */
export function dragScroll(e: React.PointerEvent<HTMLElement>): void {
  if (e.pointerType !== "mouse" || e.button !== 0) return;
  const el = e.currentTarget;
  if (el.scrollWidth <= el.clientWidth) return;

  const startX = e.clientX;
  let lastX = startX;

  trace("pan down", { row: el.dataset.paneStrip ?? el.className.slice(0, 24), ...scrollOf(el) });

  const onMove = (ev: PointerEvent) => {
    // Step by step, not measured from where the press began.
    //
    // Against a fixed origin the browser's clamp at either end accumulated:
    // carry on past the edge and the gesture banks up distance the content
    // cannot travel, so coming back has to pay all of it off before anything
    // moves. That is the row sticking at the boundary and then appearing to
    // run backwards — the pointer and the content had come apart, and only
    // the pointer knew. An incremental delta cannot bank anything, so the
    // content turns around in the same pixel the pointer does.
    const want = el.scrollLeft - (ev.clientX - lastX);
    el.scrollLeft = want;
    // `want` against `sL` is the whole story if this ever goes wrong again:
    // they differ exactly when the browser has clamped or rounded the offset.
    trace("pan move", { x: ev.clientX, dx: ev.clientX - lastX, want, ...scrollOf(el) });
    lastX = ev.clientX;
  };

  const end = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", end);
    document.removeEventListener("pointercancel", end);
    // Net travel, so a press that only wobbled still counts as a click.
    if (Math.abs(lastX - startX) <= DRAG_SLOP_PX) return;
    const swallow = (ev: Event) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    el.addEventListener("click", swallow, { capture: true, once: true });
    // If no click follows, the listener would otherwise eat the next real one.
    setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 100);
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
}
