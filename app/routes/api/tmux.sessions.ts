import { execFileSync, execSync } from "child_process";
import type { Route } from "./+types/tmux.sessions";

function getTmuxVersion(): string | null {
  try {
    const output = execSync("tmux -V", { encoding: "utf-8", timeout: 3000 }).trim();
    // "tmux 3.4" or "tmux 3.5a"
    return output.replace(/^tmux\s+/, "");
  } catch {
    return null;
  }
}

export async function loader({ request }: Route.LoaderArgs) {
  const version = getTmuxVersion();

  try {
    const output = execSync("tmux list-sessions -F '#{session_name}:#{session_windows}:#{session_attached}'", {
      encoding: "utf-8",
      timeout: 3000,
    }).trim();

    if (!output) {
      return Response.json({ sessions: [], version });
    }

    const sessions = output.split("\n").map((line) => {
      const [name, windows, attached] = line.split(":");
      return { name, windows: parseInt(windows, 10), attached: attached === "1" };
    });

    return Response.json({ sessions, version });
  } catch {
    return Response.json({ sessions: [], version });
  }
}

/**
 * Kill a session. Done here rather than by typing `tmux kill-session` into
 * some terminal: the session picker is not attached to one, and a session may
 * well be the thing the user is killing it from.
 */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const { name } = (await request.json()) as { name?: string };
  // Session names come from the client, so pass them as an argument rather
  // than through a shell.
  if (!name || !/^[\w.@-]{1,64}$/.test(name)) {
    return Response.json({ error: "Invalid session name" }, { status: 400 });
  }
  try {
    execFileSync("tmux", ["kill-session", "-t", name], { timeout: 3000, stdio: "ignore" });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: `Could not kill "${name}"` }, { status: 400 });
  }
}
