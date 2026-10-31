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

/**
 * Commit messages half-written in a composer's git drawer.
 *
 * Everything else in that composer is a keystroke or a menu position: typed
 * text waiting on Enter, which page of the soft keyboard is showing, which
 * drawer is open. All of it lives in the component and is meant to, because
 * it describes what a thumb is doing rather than what is being worked on. A
 * commit message is the one field that is neither — it is prose someone
 * composed, and a backgrounded phone tab evicted and silently reloaded took
 * it with no indication it had ever existed. Same failure as an unsaved
 * buffer, so the same answer.
 *
 * Keyed by the tab, not the directory. The tab is workspace state and comes
 * back by the same id on every device, which is the teardown this is for;
 * which repo it is sitting in takes a /proc walk to answer and can be empty.
 */
const commits = localCache<string>("otgcode:commit:", {
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  /** Bounded by tabs, and a tab id is never reused, so stale ones need a cap. */
  maxEntries: 20,
  /** A single-line input. Past this it is not a commit message. */
  maxChars: 4096,
});

export const readCommitDraft = (sessionId: string): string | null => commits.read(sessionId);
/** Emptying the field is the same as not having one, so it clears rather than storing "". */
export const writeCommitDraft = (sessionId: string, message: string): void => {
  if (message) commits.write(sessionId, message);
  else commits.clear(sessionId);
};
