import { cp, rename, rm, stat } from "node:fs/promises";
import { planMove } from "~/lib/paths";
import type { Route } from "./+types/files.move";

/**
 * Move one entry into a directory, keeping its name.
 *
 * Deliberately not the rename endpoint: `fs.rename` silently clobbers an
 * existing destination, which for a move (where the user picked a directory,
 * not a name) would be invisible data loss. Every refusal below is a case
 * where the raw syscall would either destroy something or fail with an error
 * no one can act on.
 */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { sourcePath, destDir } = (await request.json()) as {
    sourcePath?: string;
    destDir?: string;
  };
  if (!sourcePath || !destDir) {
    return Response.json({ error: "Missing sourcePath or destDir" }, { status: 400 });
  }

  const { target, name, error } = planMove(sourcePath, destDir);
  if (error) return Response.json({ error }, { status: 400 });

  const source = sourcePath;
  try {
    let sourceStat: Awaited<ReturnType<typeof stat>>;
    try {
      sourceStat = await stat(source);
    } catch {
      return Response.json({ error: `"${name}" no longer exists` }, { status: 404 });
    }

    // Refuse rather than overwrite. Checked with lstat-free stat because either
    // a file or a directory in the way is equally a collision.
    let collision = false;
    try {
      await stat(target);
      collision = true;
    } catch {
      // Nothing there — good.
    }
    if (collision) {
      return Response.json({ error: `"${name}" already exists in this folder` }, { status: 409 });
    }

    try {
      await rename(source, target);
    } catch (err) {
      // Moving across filesystems (a mounted volume, a different disk) can't be
      // a rename; fall back to copy-then-delete so it still works.
      if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
      await cp(source, target, { recursive: sourceStat.isDirectory(), errorOnExist: true, force: false });
      await rm(source, { recursive: sourceStat.isDirectory(), force: false });
    }

    return Response.json({ success: true, path: target });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Move failed" }, { status: 400 });
  }
}
