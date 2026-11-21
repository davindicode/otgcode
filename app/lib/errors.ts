import { basename } from "./paths";

/**
 * Message for something thrown. `catch` gives you `unknown` — anything can be
 * thrown in JS — so narrow it in one place rather than asserting `any` at
 * every call site and hoping `.message` exists.
 */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}

/** Node's errno, when whatever was thrown carries one. */
function errno(err: unknown): string {
  return typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
}

/** What the caller was after, which decides how a missing path reads. */
export type FsSubject = "file" | "folder" | "path";

/**
 * Concise, specific message for a filesystem failure.
 *
 * Node's own read like `ENOTDIR: not a directory, scandir '/long/path/TODO.md'`
 * — an errno, a syscall name and the full path, none of which says what went
 * wrong in terms the person can act on. These name the thing and the problem
 * and stop, because they are read in a toast.
 *
 * `target` is the path being acted on; only its last segment is used, since the
 * full path is already on screen wherever these appear.
 */
export function fsErrorMessage(err: unknown, subject: FsSubject = "path", target?: string): string {
  const name = target ? basename(target) : "";
  const which = name ? ` "${name}"` : "";
  const noun = subject === "path" ? "file or folder" : subject;

  switch (errno(err)) {
    case "ENOENT":
      return `No such ${noun}${which}`;
    case "ENOTDIR":
      return name ? `"${name}" is a file, not a folder` : "Not a folder";
    case "EISDIR":
      return name ? `"${name}" is a folder, not a file` : "Not a file";
    case "EACCES":
    case "EPERM":
      return `Permission denied${which}`;
    case "EEXIST":
      return `${name ? `"${name}"` : "That"} already exists`;
    case "ENOTEMPTY":
      return `${name ? `"${name}"` : "That folder"} is not empty`;
    case "EBUSY":
      return `${name ? `"${name}"` : "That"} is in use by another process`;
    case "ENOSPC":
      return "No space left on the disk";
    case "EROFS":
      return "This filesystem is read-only";
    case "ENAMETOOLONG":
      return "That name is too long";
    case "ELOOP":
      return "Too many symbolic links in that path";
    case "EMFILE":
    case "ENFILE":
      return "Too many open files — try again";
    case "EIO":
      return "The disk reported an I/O error";
    default:
      return errorMessage(err, `Could not read that ${noun}`);
  }
}
