import { localCache } from "./localCache";

/**
 * Which pane *this* device is showing, kept in the browser.
 *
 * The rest of the workspace belongs on the host — the tabs, which pane each
 * one sits in, what each is showing — because that is the work, and it should
 * be the same wherever you pick it up. This is not the work, and it is not
 * even the same thing on two devices: on a wide screen it is which pane has
 * the cursor, and on a phone, which can only draw one of them, it is the pane
 * you can see at all. One slot on the host for both meant they overwrote each
 * other — a click in the desktop's left pane moved the phone off the tab it
 * was reading, and a reload on the phone put it back on the left whatever it
 * had been showing.
 *
 * Not the pane *count*, which stays on the host: asking for one pane merges
 * the right pane's tabs into the left, and where a tab lives is shared state,
 * so the count that decides it has to be shared too. Per device it would mean
 * a phone quietly collapsing the desktop's split every time it loaded.
 *
 * The host keeps its own copy of this, which is what a device with nothing
 * cached starts from — and that is not a fallback for its own sake. Local
 * storage belongs to an origin and a Quick Tunnel's hostname is new every time
 * the tunnel starts, so a restarted tunnel is a device that has never been
 * here before.
 */
const shown = localCache<number>("otgcode:layout:", {
  /** A preference, not work in progress: no reason for it to go stale. */
  maxAgeMs: 365 * 24 * 60 * 60 * 1000,
  maxEntries: 1,
});

const KEY = "shown-pane";

/**
 * `null` when this device has no answer of its own, which is the caller's cue
 * to use the host's. Validated rather than trusted: it is a value in the
 * browser that the user can edit and an older build may have written.
 */
export function readShownPane(): 0 | 1 | null {
  const pane = shown.read(KEY);
  return pane === 0 || pane === 1 ? pane : null;
}

export const saveShownPane = (pane: 0 | 1): void => shown.write(KEY, pane);
