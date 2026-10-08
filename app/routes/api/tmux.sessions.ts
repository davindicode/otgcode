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
    // The id goes with the name so a tab can be opened knowing both: a rename
    // does not change the id, which is how the tab finds its session again.
    const output = execSync(
      "tmux list-sessions -F '#{session_name}:#{session_windows}:#{session_attached}:#{session_id}'",
      {
        encoding: "utf-8",
        timeout: 3000,
      },
    ).trim();

    if (!output) {
      return Response.json({ sessions: [], version });
    }

    const sessions = output.split("\n").map((line) => {
      const [name, windows, attached, id] = line.split(":");
      return { name, windows: parseInt(windows, 10), attached: attached === "1", id };
    });

    return Response.json({ sessions, version });
  } catch {
    return Response.json({ sessions: [], version });
  }
}

const SESSION_NAME = /^[\w.@-]{1,64}$/;

/**
 * tmux rewrites `.` and `:` in a session name to `_`, because both are
 * separators in its own target syntax. Apply that up front so the name we ask
 * for is the name that ends up existing, and the caller can be told which.
 */
function tmuxName(raw: string): string {
  return raw.replace(/[.:]/g, "_");
}

/** tmux puts the useful part on stderr: "duplicate session: foo". */
function tmuxStderr(err: unknown): string {
  const raw = (err as { stderr?: Buffer | string })?.stderr;
  return (typeof raw === "string" ? raw : raw?.toString() || "").trim();
}

function tmuxFailure(err: unknown, fallback: string): string {
  const stderr = tmuxStderr(err);
  if (/duplicate session/i.test(stderr)) return "A session with that name already exists";
  // tmux says "can't find window" for a missing window and "can't find
  // session" for a missing session; without this the first reads as the second.
  if (/window/i.test(stderr)) return fallback;
  if (/(can't find|no such|not found)/i.test(stderr)) return "That session no longer exists";
  // tmux's own wording beats a generic sentence when we have it.
  return stderr.replace(/^\w+:\s*/, "") || fallback;
}

/**
 * Asks tmux to repaint the clients attached to a session.
 *
 * `refresh-client` targets a client, not a session, so the clients have to be
 * found first. TMUX is dropped from the environment for the same reason the
 * other lookups drop it: the app may itself have been started from inside
 * tmux, and the answer would be scoped to that session instead of the server.
 */
function refreshClients(session: string): number {
  const env = { ...process.env };
  delete env.TMUX;
  const ttys = execFileSync("tmux", ["list-clients", "-t", session, "-F", "#{client_tty}"], {
    encoding: "utf-8",
    timeout: 3000,
    env,
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  for (const tty of ttys) {
    execFileSync("tmux", ["refresh-client", "-t", tty], { timeout: 3000, stdio: ["ignore", "ignore", "pipe"], env });
  }
  return ttys.length;
}

/**
 * Rename a session, select one of its windows, repaint it, or kill it. Done here rather than by typing tmux commands into
 * some terminal: the picker is not attached to one, and the session being acted
 * on may well be the one the user is sitting in.
 */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const { op, name, to, window } = (await request.json()) as {
    op?: string;
    name?: string;
    to?: string;
    window?: string;
  };
  // Session names come from the client, so pass them as arguments rather than
  // through a shell.
  if (!name || !SESSION_NAME.test(name)) {
    return Response.json({ error: "Invalid session name" }, { status: 400 });
  }

  if (op === "rename") {
    if (!to || !SESSION_NAME.test(to)) {
      return Response.json({ error: "Use letters, numbers, dot, dash, underscore or @" }, { status: 400 });
    }
    const target = tmuxName(to);
    // Renaming a session to the name it already has is not an error.
    if (target === name) return Response.json({ ok: true, name });
    try {
      execFileSync("tmux", ["rename-session", "-t", name, target], {
        timeout: 3000,
        stdio: ["ignore", "ignore", "pipe"],
      });
      // The name tmux settled on, which is what the tab must now show.
      return Response.json({ ok: true, name: target });
    } catch (err) {
      return Response.json({ error: tmuxFailure(err, `Could not rename "${name}"`) }, { status: 400 });
    }
  }

  if (op === "refresh") {
    try {
      return Response.json({ ok: true, clients: refreshClients(name) });
    } catch (err) {
      return Response.json({ error: tmuxFailure(err, "Could not refresh") }, { status: 400 });
    }
  }

  if (op === "select-window") {
    // Run as a command rather than sent as keystrokes. tmux's own command
    // prompt cannot be driven by a burst of keys — it needs a real typist —
    // and prefix-and-digit only reaches windows 0 to 9. This reaches any
    // index, and does not care what the user's prefix is bound to.
    if (!window || !/^\d{1,4}$/.test(window)) {
      return Response.json({ error: "Window must be a number" }, { status: 400 });
    }
    try {
      execFileSync("tmux", ["select-window", "-t", `${name}:${window}`], {
        timeout: 3000,
        stdio: ["ignore", "ignore", "pipe"],
      });
      return Response.json({ ok: true });
    } catch (err) {
      return Response.json({ error: tmuxFailure(err, `No window ${window}`) }, { status: 400 });
    }
  }

  try {
    execFileSync("tmux", ["kill-session", "-t", name], { timeout: 3000, stdio: ["ignore", "ignore", "pipe"] });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: tmuxFailure(err, `Could not kill "${name}"`) }, { status: 400 });
  }
}
