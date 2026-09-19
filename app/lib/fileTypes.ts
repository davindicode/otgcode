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
