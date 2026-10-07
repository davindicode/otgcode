import type { Stats } from "node:fs";

/**
 * A token for "the file as it was when we read it".
 *
 * Modification time plus size, which is what an editor's
 * changed-on-disk check has always been built on. A hash would be exact but
 * means reading the whole file to answer "has this moved?", which is the one
 * thing the check has to be cheap enough to repeat.
 *
 * Coarse mtime resolution is why size is in there too: a same-length rewrite
 * inside one filesystem tick is the gap, and it is a narrow one.
 */
export function fileVersion(stats: Pick<Stats, "mtimeMs" | "size">): string {
  return `${Math.round(stats.mtimeMs)}-${stats.size}`;
}
