/**
 * Human-readable byte size. One definition because three had drifted: the
 * viewer said "kB" and stopped at MB while the explorer said "KB" and went to
 * GB, so the same file could be labelled differently in two places.
 *
 * Divides by 1024 (so these are really KiB/MiB/GiB), which is what file
 * managers conventionally show.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
