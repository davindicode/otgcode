/**
 * How a file is classified for viewing. One source of truth: the viewer picks
 * which component to render from this, and the tab strip picks which icon to
 * show, so a tab can never disagree with the pane it opens.
 */
export type FileKind = "image" | "video" | "audio" | "pdf" | "text";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "ogg", "mov", "mkv", "avi"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "flac", "aac", "m4a"]);

export function getExt(path: string): string {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  // No dot means no extension; a leading dot is a dotfile (.gitignore), whose
  // name is not an extension either. Splitting on "." alone used to return the
  // whole path for an extensionless file.
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function fileKind(path: string): FileKind {
  const ext = getExt(path);
  if (IMAGE_EXTS.has(ext)) return "image";
  // ogg is both a video and an audio container; the video element handles
  // either, so it is classified as video above and never reaches here.
  if (VIDEO_EXTS.has(ext)) return "video";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  return "text";
}

/**
 * True for files rendered by a viewer that streams from the download URL and
 * therefore needs no text-content fetch. Lets the explorer open them instantly
 * instead of reading the whole file as UTF-8.
 */
export function isDirectViewerFile(path: string): boolean {
  return fileKind(path) !== "text";
}

/**
 * Whether a file's bytes are binary, by git's rule: a NUL in the first 8000.
 *
 * An extension list cannot answer this — .heic, .docx, .parquet and whatever
 * the next machine has are all "text" to an allow-list that has not heard of
 * them, and the editor then shows their bytes as mojibake. A NUL byte is what
 * no text file in any encoding we can display contains, and every container
 * format (zip, ISO-BMFF, ELF) has one in its header.
 */
export function looksBinary(bytes: Uint8Array): boolean {
  return bytes.subarray(0, 8000).includes(0);
}

/**
 * A `Content-Disposition` value that survives a non-ASCII filename.
 *
 * Both header APIs reject a character above 255 — Node's `setHeader` throws
 * `ERR_INVALID_CHAR`, and fetch's `Headers` refuses to make a ByteString of it
 * — so a file called `ファイル.txt` used to fail its own download: 500 from the
 * zip route, 400 from the single-file one. An accented Latin name slipped
 * through only because it fits in one byte.
 *
 * RFC 6266 is the way out, and needs both halves: a flattened ASCII `filename`
 * for anything that reads only that, and a percent-encoded UTF-8 `filename*`,
 * which browsers prefer when present. Flattening also closes the quoted string
 * against a name carrying a quote, a backslash or a newline — the zip route
 * takes its name from the query, where a CRLF would otherwise be a header of
 * the caller's choosing.
 */
export function contentDisposition(name: string, inline = false): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  // encodeURIComponent leaves !'()* alone, and RFC 5987's attr-char does not
  // allow them.
  const utf8 = encodeURIComponent(name).replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
