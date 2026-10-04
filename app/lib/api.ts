import { useAuthStore } from "~/stores/authStore";

/**
 * JSON from an API route, with one case handled centrally: a 401 means the
 * session expired while the app was open.
 *
 * The socket stays authenticated from its handshake, so only HTTP notices —
 * which used to surface as a toast reading "Authentication required" in the
 * middle of a working app. Showing the lock screen is the only useful
 * response, and there is nothing for the caller to report.
 *
 * Returns null in that case; the caller should simply stop.
 */
export async function apiJson<T>(input: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    useAuthStore.getState().lock();
    return null;
  }
  return (await res.json()) as T;
}
