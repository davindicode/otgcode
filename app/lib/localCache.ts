/**
 * A small, bounded, best-effort store in the browser.
 *
 * Two things want this: an editor's unsaved buffer, which must survive a page
 * being torn down and rebuilt, and a viewer's view state — how far an image is
 * zoomed, where a video had got to — which is cheap to keep and annoying to
 * lose. Both need the same four things, which is why they share this rather
 * than each growing their own copy: a namespace, an expiry, a bound on how
 * much they can take, and a guard around every single call.
 *
 * The guard is not defensive habit. `localStorage` is absent during SSR,
 * throws outright on access in a private window with site data blocked, and
 * throws on write when the origin's few megabytes are full. Anything built on
 * it has to work when it does nothing at all, so every entry point here
 * returns as though the value simply was not there.
 *
 * Scope worth knowing: storage belongs to an origin, and a Quick Tunnel's
 * hostname is new every time the tunnel starts. Everything here survives a
 * reload, a reconnect and a tab eviction within one tunnel, and none of it
 * follows you to the next one.
 */

interface Entry<T> {
  v: T;
  at: number;
}

export interface LocalCache<T> {
  read: (key: string) => T | null;
  write: (key: string, value: T) => void;
  clear: (key: string) => void;
}

export interface CacheLimits {
  /** Past this an entry is abandoned rather than in progress. */
  maxAgeMs: number;
  /** How many entries of this kind to keep, oldest dropped first. */
  maxEntries?: number;
  /** Past this one value is not worth the whole origin's quota. */
  maxChars?: number;
}

export function localCache<T>(prefix: string, limits: CacheLimits): LocalCache<T> {
  const full = (key: string) => prefix + key;

  /** This cache's own keys, newest first. */
  const ours = (): { key: string; at: number }[] => {
    const found: { key: string; at: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(prefix)) continue;
      let at = 0;
      try {
        at = (JSON.parse(localStorage.getItem(k) ?? "") as Entry<T>).at ?? 0;
      } catch {
        // Not ours, or half-written. Either way it is in the way, and an `at`
        // of zero puts it first in the queue to go.
      }
      found.push({ key: k, at });
    }
    return found.sort((a, b) => b.at - a.at);
  };

  const clear = (key: string): void => {
    try {
      localStorage.removeItem(full(key));
    } catch {
      // Nothing depends on this having worked.
    }
  };

  return {
    read(key) {
      try {
        const raw = localStorage.getItem(full(key));
        if (!raw) return null;
        const entry = JSON.parse(raw) as Entry<T>;
        if (entry?.v === undefined) return null;
        // Expiry is collected on read because there is no other moment this
        // code reliably runs, and an entry nobody has come back for is just
        // quota that something live could be using.
        if (Date.now() - (entry.at ?? 0) > limits.maxAgeMs) {
          localStorage.removeItem(full(key));
          return null;
        }
        return entry.v;
      } catch {
        return null;
      }
    },

    write(key, value) {
      let raw: string;
      try {
        raw = JSON.stringify({ v: value, at: Date.now() } satisfies Entry<T>);
      } catch {
        return;
      }
      // Too big to keep — and whatever is already stored under this key is
      // older than what was just refused, so it has to go with it. Leaving it
      // there would hand back a stale value later as though it were current.
      if (limits.maxChars && raw.length > limits.maxChars) {
        clear(key);
        return;
      }
      try {
        localStorage.setItem(full(key), raw);
      } catch {
        // Out of room. What is being written is the live one, so the oldest of
        // ours give way to it, one at a time, until it fits.
        try {
          for (const stale of ours().reverse()) {
            if (stale.key === full(key)) continue;
            localStorage.removeItem(stale.key);
            try {
              localStorage.setItem(full(key), raw);
              return;
            } catch {
              // Still no room. Keep going.
            }
          }
        } catch {
          // No storage at all, which is the one case there is nothing to do
          // about: the value is still in memory, and that is the fallback.
        }
        return;
      }
      // Bounded by count as well as by age, since these accumulate one per
      // file ever opened and expiry alone would let a year's worth pile up.
      if (limits.maxEntries) {
        try {
          const all = ours();
          for (const extra of all.slice(limits.maxEntries)) localStorage.removeItem(extra.key);
        } catch {
          // Then it stays unbounded until the next successful write.
        }
      }
    },

    clear,
  };
}
