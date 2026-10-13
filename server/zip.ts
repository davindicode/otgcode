import { createReadStream, type Dirent } from "node:fs";
import { access, constants, readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { ZipArchive } from "archiver";
import type { Express } from "express";
import { contentDisposition } from "../app/lib/fileTypes.js";

/** A file to put in the archive: where it is, and what it is called inside. */
interface Entry {
  path: string;
  name: string;
  /**
   * Set for a symlink, to the time of the file it points at.
   *
   * Handed a link, archiver stores the link — so a download of a folder with
   * one in it used to carry a few bytes of target path where the file should
   * be, and extracted to a symlink that pointed at a path on the host. The
   * bytes are copied instead, which is what `zip` does by default too, and
   * the date comes along because streaming the content loses the one that
   * `archive.file` would have read from disk.
   */
  date?: Date;
}

export interface Tree {
  files: Entry[];
  /** Folders with nothing in them, which are still part of the tree's shape. */
  empty: string[];
  /** Paths left out, named in the archive so their absence is visible. */
  skipped: string[];
}

async function addFile(path: string, name: string, tree: Tree, date?: Date): Promise<void> {
  try {
    await access(path, constants.R_OK);
    tree.files.push({ path, name, date });
  } catch {
    tree.skipped.push(name);
  }
}

/**
 * Walks `dir`, collecting every readable file and the name of everything it
 * had to leave out.
 *
 * The walk exists because archiver treats an unreadable entry as fatal: EACCES
 * on a single file emits `error`, `finalize()` then never settles, and the
 * response has to be destroyed part-way through the body. What the browser
 * keeps is a .zip with no central directory, which will not open at all — so
 * one protected file cost the entire download, including everything that had
 * already streamed fine. Nothing unreadable is handed to archiver now: the
 * walk does the refusing, where there is still a response to put it in.
 */
async function collect(dir: string, prefix: string, tree: Tree): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    tree.skipped.push(`${prefix}/`);
    return;
  }
  if (entries.length === 0) {
    tree.empty.push(prefix);
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    const name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      await collect(path, name, tree);
    } else if (entry.isFile()) {
      await addFile(path, name, tree);
    } else if (entry.isSymbolicLink()) {
      // Followed only as far as a file. A link to a directory is left out
      // rather than walked, because one pointing back up its own tree would
      // recurse until the archive filled the disk.
      const target = await stat(path).catch(() => null);
      if (target?.isFile()) await addFile(path, name, tree, target.mtime);
      else tree.skipped.push(name);
    } else {
      // A socket, fifo or device node is not a file to carry away.
      tree.skipped.push(name);
    }
  }
}

/**
 * Decides what the archive will hold, before any of it is written.
 *
 * Separate from the streaming because this is the part that can still refuse:
 * once a byte of the body has gone out, there is no way left to say that part
 * of it is missing.
 */
export async function plan(paths: string[]): Promise<Tree> {
  const tree: Tree = { files: [], empty: [], skipped: [] };
  for (const path of paths) {
    const stats = await stat(path).catch(() => null);
    if (!stats) tree.skipped.push(basename(path));
    else if (stats.isDirectory()) await collect(path, basename(path), tree);
    else await addFile(path, basename(path), tree);
  }
  return tree;
}

/**
 * Streams one or more files and folders as a single .zip.
 *
 * The archive always comes out valid, even when nothing in the request could
 * be read — the download is a synthetic anchor click, so an error status would
 * save the error as a file called `something.zip`. An explanation inside the
 * archive is one the user can actually open.
 */
export function mountZipRoute(app: Express): void {
  app.get("/api/files/download-zip", async (req, res) => {
    const raw = req.query.path;
    const paths = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((p): p is string => typeof p === "string");
    if (paths.length === 0) {
      res.status(400).json({ error: "Missing path" });
      return;
    }
    const name = typeof req.query.name === "string" && req.query.name ? req.query.name : "archive.zip";

    const tree = await plan(paths);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", contentDisposition(name));

    const archive = new ZipArchive({ level: 9 });
    archive.on("error", (err: Error) => {
      // ponytail: the walk leaves only the race — a file readable when it was
      // listed and not when archiver reached it. Too narrow to pre-empt with a
      // lock, and nothing can be said in-band once the body has started, so it
      // is logged rather than lost.
      console.error("zip:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
      else res.destroy(err);
    });
    archive.pipe(res);

    for (const dir of tree.empty) archive.append("", { name: `${dir}/.keep` });
    for (const file of tree.files) {
      if (file.date) archive.append(createReadStream(file.path), { name: file.name, date: file.date });
      else archive.file(file.path, { name: file.name });
    }
    if (tree.skipped.length > 0) {
      archive.append(
        `${tree.skipped.length} path(s) could not be read and are not in this archive:\n\n${tree.skipped.join("\n")}\n`,
        { name: "UNREADABLE.txt" },
      );
    }
    archive.finalize();
  });
}
