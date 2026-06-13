import { execFileSync, execSync } from "child_process";
import { readFileSync, readlinkSync } from "fs";
import { getPtyPid } from "../../../server/pty-manager";
import type { Route } from "./+types/terminal.cwd";

function getDirectChildren(pid: number): number[] {
  try {
    return execSync(`pgrep -P ${pid}`, { encoding: "utf-8", timeout: 2000 })
      .trim()
      .split("\n")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

function readComm(pid: number): string {
  try {
    return readFileSync(`/proc/${pid}/comm`, "utf-8").trim();
  } catch {
    return "";
  }
}

function readTty(pid: number): string | null {
  try {
    return readlinkSync(`/proc/${pid}/fd/0`);
  } catch {
    return null;
  }
}

function findDeepestDescendant(pid: number, depth = 0): number {
  if (depth > 16) return pid;
  const children = getDirectChildren(pid);
  if (children.length === 0) return pid;
  return findDeepestDescendant(children[children.length - 1], depth + 1);
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");

  if (sessionId) {
    const ptyPid = getPtyPid(sessionId);
    if (ptyPid) {
      // If a tmux client is a direct child of this PTY, ask tmux about THAT
      // client's active pane. Querying tmux without -c returns whichever pane
      // is globally focused on the server — wrong when multiple terminals
      // each have their own tmux client.
      for (const childPid of getDirectChildren(ptyPid)) {
        const name = readComm(childPid);
        if (name !== "tmux" && !name.startsWith("tmux:")) continue;
        const tty = readTty(childPid);
        if (!tty || !tty.startsWith("/dev/")) continue;
        try {
          const cwd = execFileSync("tmux", ["display-message", "-p", "-c", tty, "#{pane_current_path}"], {
            encoding: "utf-8",
            timeout: 2000,
          }).trim();
          if (cwd) return Response.json({ cwd });
        } catch {
          // Fall through to PTY-based detection
        }
      }

      // No tmux client: walk to the deepest descendant of the PTY and read its cwd.
      try {
        const cwd = readlinkSync(`/proc/${findDeepestDescendant(ptyPid)}/cwd`);
        if (cwd) return Response.json({ cwd });
      } catch {}
      try {
        const cwd = readlinkSync(`/proc/${ptyPid}/cwd`);
        if (cwd) return Response.json({ cwd });
      } catch {}
    }
  }

  return Response.json({ cwd: process.env.DEFAULT_CWD || process.env.HOME || "/" });
}
