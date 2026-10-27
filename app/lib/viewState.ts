import { localCache } from "./localCache";

/**
 * How a file was being looked at, kept in the browser.
 *
 * The same problem as an unsaved buffer, one notch down in severity: a page
 * that is torn down and rebuilt — an evicted tab, an expired session — brings
 * every viewer back at its defaults. An image you had zoomed into a corner of
 * is fit-to-screen again, a video you were forty minutes into starts at zero.
 * Nothing is destroyed, which is why this is a separate store from drafts
 * with its own rules, but it is all work to redo.
 *
 * So, unlike a draft, this survives closing the tab: reopening a file at the
 * place you left it is the point, and there is nothing here to lose by
 * keeping it. It is bounded by count rather than by size, because every entry
 * is a handful of numbers and the thing that accumulates is files, not bytes.
 */
export interface ViewState {
  /** Image: the zoom step, where 1 is fit-to-pane. */
  zoom?: number;
  /** Image: where the pane was scrolled to, in pixels. */
  left?: number;
  top?: number;
  /** Audio and video: how far in playback had got, in seconds. */
  time?: number;
  /** Audio and video: whether it was set to repeat. */
  loop?: boolean;
  /** PDF: its own zoom, which is not the image one. */
  scale?: number;
  /**
   * How far down a list or a document had been scrolled, in pixels.
   *
   * Shared by the explorer, where the key is a directory, and the editor,
   * where it is a file — so walking out of a folder and back in lands where
   * you left, as does reopening a file. One field rather than one per
   * viewer because they never key by the same path.
   */
  scroll?: number;
  /** Editor: edit, plain or preview, since the default is not always right. */
  mode?: string;
  /** Editor: an HTML preview's zoom, which is its own control. */
  htmlZoom?: number;
}

const views = localCache<ViewState>("otgcode:view:", {
  /** Long, because none of it is work in progress and none of it is big. */
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
  maxEntries: 200,
});

export const readView = (path: string): ViewState => views.read(path) ?? {};

/** Merges, so each viewer writes only the fields it owns. */
export function saveView(path: string, patch: ViewState): void {
  views.write(path, { ...readView(path), ...patch });
}
