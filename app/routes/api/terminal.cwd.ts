import { execSync } from "child_process";
import { readlinkSync } from "fs";
import type { Route } from "./+types/terminal.cwd";
import { getPtyPid } from "../../../server/pty-manager";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  const inTmux = url.searchParams.get("inTmux") === "true";

  // If in tmux, ask tmux for the active pane's current path
  if (inTmux) {
    try {
      const cwd = execSync("tmux display-message -p '#{pane_current_path}'", {
        encoding: "utf-8",
        timeout: 2000,
      }).trim();
      if (cwd) return Response.json({ cwd });
    } catch {
      // Fall through to PTY-based detection
    }
  }

  // Otherwise read CWD from the PTY process via /proc
  if (sessionId) {
    const pid = getPtyPid(sessionId);
    if (pid) {
      try {
        // The PTY's child shell — read its CWD
        const children = execSync(`pgrep -P ${pid}`, { encoding: "utf-8", timeout: 2000 }).trim().split("\n");
        // Get the deepest child (the actual shell, not tmux client)
        const targetPid = children[children.length - 1]?.trim();
        if (targetPid) {
          const cwd = readlinkSync(`/proc/${targetPid}/cwd`);
          if (cwd) return Response.json({ cwd });
        }
      } catch {
        // Fall through
      }
      // Try the PTY process itself
      try {
        const cwd = readlinkSync(`/proc/${pid}/cwd`);
        if (cwd) return Response.json({ cwd });
      } catch {
        // Fall through
      }
    }
  }

  // Fallback
  return Response.json({ cwd: process.env.DEFAULT_CWD || process.env.HOME || "/" });
}
