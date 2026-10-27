/**
 * Unsaved editor buffers, kept in the browser.
 *
 * An open editor's edits live in React state, which is the right place for
 * them right up until the page itself goes away. On a phone that happens
 * without being asked for: a backgrounded tab is evicted under memory
 * pressure and silently reloaded when you come back, and a session that
 * expires reloads deliberately. Either way the workspace comes back from the
 * host with every tab in place and every editor showing what is on disk —
 * which looks like nothing was lost, and is exactly when something was.
 *
 * So a dirty buffer is mirrored here as well. Best effort on purpose: storage
 * can be absent, full, or throw outright in a private window, and an editor
 * that refused to work without it would be worse than one that occasionally
 * cannot remember. Every entry is keyed by the file's path, which is safe
 * because the workspace allows one tab per file — two editors over one file
 * would be two buffers racing to write it, so there is never more than one
 * draft to hold.
 *
 * Note the scope: localStorage belongs to an origin, and a Quick Tunnel's
 * hostname changes every time the tunnel is started. Drafts survive a reload,
 * a reconnect and an eviction within one tunnel; they do not follow you to the
 * next one.
 */

const PREFIX = "otgcode:draft:";

/**
 * Past this a draft is left to memory alone. The quota is a few megabytes for
 * the whole origin, and filling it with one buffer would cost every other
 * file its draft — the big-file case being the one where that quota runs out.
 */
const MAX_BYTES = 256 * 1024;

/** After this a draft is abandoned work rather than work in progress. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Draft {
  content: string;
  at: number;
}

const key = (path: string) => PREFIX + path;

/** Every draft key, newest first. Also the only place the parse is tolerated. */
function entries(): { key: string; at: number }[] {
  const found: { key: string; at: number }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith(PREFIX)) continue;
    try {
      found.push({ key: k, at: (JSON.parse(localStorage.getItem(k) ?? "") as Draft).at ?? 0 });
    } catch {
      // Not a draft we wrote, or half-written. Either way it is in the way.
      found.push({ key: k, at: 0 });
    }
  }
  return found.sort((a, b) => b.at - a.at);
}

/**
 * The draft for a file, if there is a live one.
 *
 * Reading is also when expiry is collected: there is no other moment this code
 * reliably runs, and a draft nobody has come back for in a week is not worth
 * the quota it is holding.
 */
export function readDraft(path: string): string | null {
  try {
    const raw = localStorage.getItem(key(path));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    if (typeof draft?.content !== "string") return null;
    if (Date.now() - (draft.at ?? 0) > MAX_AGE_MS) {
      localStorage.removeItem(key(path));
      return null;
    }
    return draft.content;
  } catch {
    return null;
  }
}

/**
 * Mirror a dirty buffer. A write that does not fit drops the oldest drafts and
 * tries once more, so the file being typed into wins the quota over files that
 * were last touched days ago.
 */
export function writeDraft(path: string, content: string): void {
  if (content.length > MAX_BYTES) return;
  const value = JSON.stringify({ content, at: Date.now() } satisfies Draft);
  try {
    localStorage.setItem(key(path), value);
  } catch {
    try {
      for (const stale of entries().reverse()) {
        if (stale.key === key(path)) continue;
        localStorage.removeItem(stale.key);
        try {
          localStorage.setItem(key(path), value);
          return;
        } catch {
          // Still no room. Keep dropping.
        }
      }
    } catch {
      // No storage at all. The buffer is still in memory; that is the fallback.
    }
  }
}

export function clearDraft(path: string): void {
  try {
    localStorage.removeItem(key(path));
  } catch {
    // Nothing to do, and nothing depends on it having worked.
  }
}
