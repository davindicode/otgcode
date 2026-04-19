import { readdir, stat } from "fs/promises";
import { join } from "path";
import type { Route } from "./+types/files.list";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const dir = url.searchParams.get("dir") || process.env.DEFAULT_CWD || process.env.HOME || "/";
  const showHidden = url.searchParams.get("showHidden") === "true";

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const results = [];

    for (const entry of entries) {
      if (!showHidden && entry.name.startsWith(".")) continue;
      try {
        const fullPath = join(dir, entry.name);
        const stats = await stat(fullPath);
        results.push({
          name: entry.name,
          isDirectory: entry.isDirectory(),
          size: stats.size,
          modified: stats.mtime.toISOString(),
          permissions: (stats.mode & 0o777).toString(8),
        });
      } catch {
        // Skip files we can't stat
      }
    }

    // Sort: directories first, then alphabetical
    results.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return Response.json({ dir, entries: results });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
