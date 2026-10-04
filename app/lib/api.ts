import { useAuthStore } from "~/stores/authStore";

/** Same-origin API path for whatever `fetch` was handed, or "" if it isn't one. */
function apiPath(input: RequestInfo | URL): string {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin ? url.pathname : "";
  } catch {
    return "";
  }
}

let watching = false;

/**
 * Shows the lock screen when the session expires, wherever that is noticed.
 *
 * The socket stays authenticated from its handshake, so an expiry is only ever
 * visible to HTTP — and it used to surface as a toast reading "Authentication
 * required" in the middle of an app that still looked signed in. The session
 * can lapse between any two requests, from any of the twenty-odd places that
 * make them, and a call site added later would forget to handle it. So this
 * watches responses once, centrally, instead.
 *
 * The response is passed through untouched, so no caller behaves differently.
 * `/api/auth/` is exempt: a refused password is a 401 that means "wrong
 * password", not "your session ended".
 */
export function watchForExpiredSession(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;

  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await original(input, init);
    if (response.status === 401) {
      const path = apiPath(input);
      if (path.startsWith("/api/") && !path.startsWith("/api/auth/")) {
        useAuthStore.getState().lock();
      }
    }
    return response;
  };
}
