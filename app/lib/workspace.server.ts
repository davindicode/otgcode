import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defaultWorkspace, sanitize, type Workspace } from "./workspace.shared";

/**
 * Reads and writes the workspace file on the host. Deliberately separate from
 * config.json: this is written from the browser on every layout change, and
 * must never be able to corrupt the auth config sitting next to it.
 */
const CONFIG_DIR = process.env.OTG_CONFIG_DIR || join(homedir(), ".otgcode");
const WORKSPACE_FILE = join(CONFIG_DIR, "workspace.json");

let cached: Workspace | null = null;

export function loadWorkspace(): Workspace {
  if (cached) return cached;
  try {
    if (existsSync(WORKSPACE_FILE)) {
      cached = sanitize(JSON.parse(readFileSync(WORKSPACE_FILE, "utf-8")));
      return cached;
    }
  } catch {
    // A corrupt file is not worth failing a page load over.
  }
  cached = defaultWorkspace();
  return cached;
}

/** Merge a partial update from the browser and persist it. */
export function saveWorkspace(patch: unknown): Workspace {
  const next = sanitize(patch, loadWorkspace());
  cached = next;
  try {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(WORKSPACE_FILE, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    chmodSync(WORKSPACE_FILE, 0o600);
  } catch (err) {
    console.error(`  Could not write ${WORKSPACE_FILE}: ${(err as Error).message}`);
  }
  return next;
}
