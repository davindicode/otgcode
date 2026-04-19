import { execSync } from "child_process";
import { platform } from "os";
import type { Route } from "./+types/tool-versions";

function run(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 2000, stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (err: any) {
    // Some commands write to stderr or exit non-zero but still have output
    return err?.stdout?.trim() || err?.stderr?.trim() || null;
  }
}

function getTmuxVersion(): string | null {
  return run("tmux -V")?.replace(/^tmux\s+/i, "") || null;
}

function getNanoVersion(): string | null {
  // macOS ships pico instead of GNU nano — skip version check to avoid 2s hang
  if (platform() === "darwin") {
    return run("which nano") ? "pico" : null;
  }
  // GNU nano on Linux: --version prints to stdout and exits
  const out = run("nano --version");
  if (out) {
    const match = out.match(/nano\s+([\d.]+)/i);
    if (match) return match[1];
  }
  return run("which nano") ? "installed" : null;
}

function getVimVersion(): string | null {
  const out = run("vim --version");
  if (!out) return null;
  const match = out.match(/Vi IMproved\s+([\d.]+)/);
  return match?.[1] || null;
}

function getClaudeVersion(): string | null {
  const out = run("claude --version");
  if (!out) return null;
  const match = out.match(/([\d.]+)/);
  return match?.[1] || out.split("\n")[0].slice(0, 30);
}

function getCodexVersion(): string | null {
  const out = run("codex --version");
  if (!out) return null;
  const match = out.match(/([\d.]+)/);
  return match?.[1] || out.split("\n")[0].slice(0, 30);
}

function getOpencodeVersion(): string | null {
  const out = run("opencode version");
  if (!out) return null;
  const match = out.match(/([\d.]+)/);
  return match?.[1] || out.split("\n")[0].slice(0, 30);
}

export async function loader({ request }: Route.LoaderArgs) {
  return Response.json({
    tmux: getTmuxVersion(),
    nano: getNanoVersion(),
    vim: getVimVersion(),
    claude: getClaudeVersion(),
    codex: getCodexVersion(),
    opencode: getOpencodeVersion(),
  });
}
