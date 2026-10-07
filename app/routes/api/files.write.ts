import { stat, writeFile } from "node:fs/promises";
import { fsErrorMessage } from "~/lib/errors";
import { fileVersion } from "~/lib/fileVersion";
import type { Route } from "./+types/files.write";

/** The file's version now, or null if it isn't there. */
async function currentVersion(path: string): Promise<string | null> {
  try {
    return fileVersion(await stat(path));
  } catch {
    return null;
  }
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const { path: filePath, content, expectedVersion } = body;

  if (!filePath || content === undefined) {
    return Response.json({ error: "Missing path or content" }, { status: 400 });
  }

  try {
    // Optimistic concurrency: the caller says which version it edited, and the
    // write is refused if the file has moved since. Checked here rather than in
    // the browser because only here is there no gap between looking and
    // writing — a check in the client races every other writer.
    if (typeof expectedVersion === "string" && expectedVersion) {
      const current = await currentVersion(filePath);
      if (current !== expectedVersion) {
        return Response.json(
          {
            error: current === null ? "This file was deleted since you opened it" : "This file changed on disk",
            conflict: true,
            version: current,
          },
          { status: 409 },
        );
      }
    }

    await writeFile(filePath, content, "utf-8");
    // The version the caller now holds, so the next save can be checked too.
    return Response.json({ success: true, path: filePath, version: await currentVersion(filePath) });
  } catch (err: unknown) {
    return Response.json({ error: fsErrorMessage(err, "file", filePath) }, { status: 400 });
  }
}
