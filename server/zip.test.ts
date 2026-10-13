import { chmod, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { plan } from "./zip";

/** chmod means nothing to root, so the refusals cannot be observed as one. */
const asRoot = process.getuid?.() === 0;

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "otg-zip-"));
  await mkdir(join(root, "tree/sub/deep"), { recursive: true });
  await mkdir(join(root, "tree/hollow"));
  await writeFile(join(root, "tree/readable.txt"), "fine");
  await writeFile(join(root, "tree/sub/deep/buried.txt"), "also fine");
  await writeFile(join(root, "tree/secret.txt"), "nope");
  await symlink(join(root, "tree/readable.txt"), join(root, "tree/link.txt"));
  await symlink(join(root, "tree/sub"), join(root, "tree/dirlink"));
  await chmod(join(root, "tree/secret.txt"), 0o000);
  await mkdir(join(root, "tree/locked"));
  await writeFile(join(root, "tree/locked/inner.txt"), "unreachable");
  await chmod(join(root, "tree/locked"), 0o000);
});

afterAll(async () => {
  // Put the permissions back, or the temp directory cannot be cleaned up.
  await chmod(join(root, "tree/locked"), 0o755).catch(() => {});
});

describe("plan", () => {
  it("collects files at every depth, keeping the path inside the archive", async () => {
    const { files } = await plan([join(root, "tree")]);
    const names = files.map((f) => f.name);
    expect(names).toContain("tree/readable.txt");
    expect(names).toContain("tree/sub/deep/buried.txt");
  });

  it("names an empty folder, which is part of the tree's shape", async () => {
    const { empty } = await plan([join(root, "tree")]);
    expect(empty).toContain("tree/hollow");
  });

  it("takes a link to a file, so its bytes are copied rather than the link", async () => {
    const { files } = await plan([join(root, "tree")]);
    const link = files.find((f) => f.name === "tree/link.txt");
    // The date is what marks it for dereferencing when it is written.
    expect(link?.date).toBeInstanceOf(Date);
  });

  it("leaves out a link to a directory, which could point back up its own tree", async () => {
    const { skipped } = await plan([join(root, "tree")]);
    expect(skipped).toContain("tree/dirlink");
  });

  it.skipIf(asRoot)("skips an unreadable file and names it, rather than failing the archive", async () => {
    const { files, skipped } = await plan([join(root, "tree")]);
    expect(skipped).toContain("tree/secret.txt");
    expect(files.map((f) => f.name)).not.toContain("tree/secret.txt");
  });

  it.skipIf(asRoot)("skips an unreadable folder without losing the rest of the walk", async () => {
    const { files, skipped } = await plan([join(root, "tree")]);
    expect(skipped).toContain("tree/locked/");
    expect(files.map((f) => f.name)).toContain("tree/readable.txt");
  });

  it("reports a path that does not exist instead of ignoring it", async () => {
    const { files, skipped } = await plan([join(root, "tree/readable.txt"), join(root, "tree/ghost.txt")]);
    expect(skipped).toEqual(["ghost.txt"]);
    expect(files.map((f) => f.name)).toEqual(["readable.txt"]);
  });
});
