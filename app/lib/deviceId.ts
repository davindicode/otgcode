const KEY = "otg_device";

let cached = "";

/**
 * A stable id for this browser, so the server can tell a refresh apart from a
 * second device and let the same one reclaim its session without asking.
 *
 * localStorage is the only state the app keeps in the browser, and only this:
 * it identifies the device, it is not a credential. Where storage is blocked
 * (a private window, blocked site data) the id lasts for the page instead,
 * which costs one extra tap on "Take over" after a refresh.
 */
export function deviceId(): string {
  if (cached) return cached;
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && /^[\w-]{1,64}$/.test(stored)) {
      cached = stored;
      return cached;
    }
  } catch {
    // Unavailable — fall through to a per-page id.
  }
  cached = `d-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  try {
    localStorage.setItem(KEY, cached);
  } catch {
    // Not persisted; still stable for this page.
  }
  return cached;
}
