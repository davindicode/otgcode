/**
 * Opt-in log of what a horizontal drag is actually doing, for when a strip
 * misbehaves on one browser and not another.
 *
 * Add `?dragtrace=1` to the URL and open the console. Off, this is one boolean
 * read per event; the flag is read once, so turning it on needs a reload.
 *
 * It prints the numbers the gesture decides from — the pointer, the strip's
 * scroll offset and the width it is scrolling, and what came out — because a
 * drag that goes wrong has the pointer and the content disagreeing, and only
 * the pointer is visible from outside.
 */
const on =
  typeof window !== "undefined" &&
  (new URLSearchParams(window.location.search).has("dragtrace") ||
    window.localStorage?.getItem("otg:dragtrace") === "1");

const t0 = typeof performance !== "undefined" ? performance.now() : 0;

export function trace(tag: string, data: Record<string, unknown>): void {
  if (!on) return;
  const at = typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;
  const body = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === "number" ? Math.round(v * 10) / 10 : v}`)
    .join(" ");
  console.log(`[${at}ms] ${tag} ${body}`);
}

/** The scrolling numbers of an element, which is most of what matters. */
export function scrollOf(el: HTMLElement): Record<string, unknown> {
  return { sL: el.scrollLeft, sW: el.scrollWidth, cW: el.clientWidth, max: el.scrollWidth - el.clientWidth };
}
