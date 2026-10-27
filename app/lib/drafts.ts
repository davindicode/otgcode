import { localCache } from "./localCache";

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
 * Keyed by the file's path, which is safe because the workspace allows one
 * tab per file: two editors over one file would be two buffers racing to
 * write it, so there is never more than one draft to hold.
 *
 * A draft is for the teardown nobody chose. Closing a tab is a decision, so
 * `tabsStore.close` throws its draft away — see the note there.
 */
const drafts = localCache<string>("otgcode:draft:", {
  /** After a week it is abandoned work, not work in progress. */
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  /**
   * Past this a buffer is left to memory alone. The quota is a few megabytes
   * for the whole origin, and filling it with one buffer would cost every
   * other file its draft — the big-file case being the one where that quota
   * runs out in the first place.
   */
  maxChars: 256 * 1024,
});

export const readDraft = (path: string): string | null => drafts.read(path);
export const writeDraft = (path: string, content: string): void => drafts.write(path, content);
export const clearDraft = (path: string): void => drafts.clear(path);
