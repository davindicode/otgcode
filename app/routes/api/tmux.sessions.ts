import { execSync } from "child_process";
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
