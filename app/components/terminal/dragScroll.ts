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
  const startScroll = el.scrollLeft;
  let dragged = false;

  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - startX;
    if (Math.abs(dx) > DRAG_SLOP_PX) dragged = true;
    el.scrollLeft = startScroll - dx;
  };

  const end = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", end);
    document.removeEventListener("pointercancel", end);
    if (!dragged) return;
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
