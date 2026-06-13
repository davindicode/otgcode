// POSIX-style path helpers for resolving references inside files (e.g. relative
// image/link paths in a markdown preview). Pure and dependency-free so they can
// be unit-tested in isolation.

/** Directory portion of an absolute file path. */
export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  if (i < 0) return "";
  if (i === 0) return "/";
  return path.slice(0, i);
}

/** Normalize a path, collapsing "." and ".." segments and duplicate slashes. */
export function normalizePath(path: string): string {
  const isAbs = path.startsWith("/");
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else if (!isAbs) out.push("..");
    } else {
      out.push(seg);
    }
  }
  return (isAbs ? "/" : "") + out.join("/");
}

/** Resolve a (possibly relative) reference against a base directory. */
export function resolvePath(fromDir: string, ref: string): string {
  if (ref.startsWith("/")) return normalizePath(ref);
  const base = fromDir.endsWith("/") ? fromDir : `${fromDir}/`;
  return normalizePath(base + ref);
}

/**
 * True for references the browser can already load on its own — absolute URLs
 * (http:, https:, data:, blob:, mailto:, …), protocol-relative ("//host"), and
 * in-page anchors ("#section"). These should not be rewritten to a local path.
 */
export function isExternalUrl(src: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src);
}

/** URL that serves a local file inline (so images/video render in-page). */
export function toInlineDownloadUrl(absPath: string): string {
  return `/api/files/download?path=${encodeURIComponent(absPath)}&inline=1`;
}
