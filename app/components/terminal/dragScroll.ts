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
  // Safari scrolls a container by itself while a button is held down and the
  // pointer is outside it — its drag-select autoscroll, which runs even on a
  // row that cannot be selected. Measured: with the pointer parked past the
  // end of the strip, scrollLeft crept toward the end on its own, dx=0 on
  // every event, and then our own delta was subtracted from whatever Safari
  // had just set. That fight is the wiggle at the ends. Cancelling the
  // default action of the press is what calls it off; the divider has done
  // this all along for the same reason. click still fires, so the swallow
  // below is still needed.
  e.preventDefault();

  const startX = e.clientX;
  let lastX = startX;

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
    el.scrollLeft -= ev.clientX - lastX;
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

/**
 * A wheel over one of these rows scrolls it sideways.
 *
 * A mouse wheel only has an axis the row does not use, so over a row of keys
 * it did nothing at all — on a desktop the overflowing half was reachable
 * only by dragging. A trackpad's sideways gesture already arrives as deltaX
 * and the browser handles that itself, so this only steps in when the
 * movement is mostly vertical.
 *
 * No preventDefault: the app is a fixed-height shell with nothing to scroll
 * vertically behind these rows, so there is no page scroll to suppress, and
 * React attaches wheel passively anyway.
 */
export function wheelScroll(e: React.WheelEvent<HTMLElement>): void {
  const el = e.currentTarget;
  if (el.scrollWidth <= el.clientWidth) return;
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  el.scrollLeft += e.deltaY;
}
