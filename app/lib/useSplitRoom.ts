import { useSyncExternalStore } from "react";
import { SPLIT_MEDIA_QUERY } from "./workspace.shared";

/**
 * Whether the viewport has room for two panes.
 *
 * A media query rather than a resize listener, so the browser decides when the
 * answer changed instead of every consumer re-measuring on every pixel. One
 * `matchMedia` is shared by all of them, and it is read through
 * `useSyncExternalStore` so a server render and the first client render agree
 * on `false` — the narrow layout — and widen on hydration rather than
 * mismatching.
 */
const query = typeof window === "undefined" ? null : window.matchMedia(SPLIT_MEDIA_QUERY);

function subscribe(onChange: () => void): () => void {
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

export function useSplitRoom(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => query?.matches ?? false,
    () => false,
  );
}
