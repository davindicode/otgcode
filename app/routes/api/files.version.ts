import { stat } from "node:fs/promises";
import { fsErrorMessage } from "~/lib/errors";
import { fileVersion } from "~/lib/fileVersion";
import type { Route } from "./+types/files.version";

/**
 * Whether a file has changed, without reading it.
 *
 * An open tab polls this while it is the one on screen, so it has to stay a
 * single stat however large the file is. `missing` is its own answer rather
 * than an error: a file that was deleted under an open tab is a thing the tab
 * should say, not a failure to report.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const path = new URL(request.url).searchParams.get("path");
  if (!path) return Response.json({ error: "Missing path parameter" }, { status: 400 });

  try {
    return Response.json({ version: fileVersion(await stat(path)) });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return Response.json({ version: null, missing: true });
    }
    return Response.json({ error: fsErrorMessage(err, "file", path) }, { status: 400 });
  }
}
