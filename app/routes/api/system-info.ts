import { execSync } from "child_process";
import { arch, cpus, freemem, hostname, platform, release, totalmem, uptime } from "os";
import type { Route } from "./+types/system-info";

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 3000, stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return [days > 0 ? `${days}d` : "", hours > 0 ? `${hours}h` : "", `${mins}m`].filter(Boolean).join(" ");
}

export async function loader({ request }: Route.LoaderArgs) {
  const os = platform();
  const cpu = cpus();

  const info: Record<string, string | null> = {
    hostname: hostname(),
    os: os === "darwin" ? "macOS" : os === "win32" ? "Windows" : os === "linux" ? "Linux" : os,
    osVersion: release(),
    arch: arch(),
    cpu: cpu.length > 0 ? `${cpu[0].model} (${cpu.length} cores)` : null,
    memory: `${formatBytes(freemem())} free / ${formatBytes(totalmem())} total`,
    uptime: formatUptime(uptime()),
    shell: run("echo $SHELL") || run("echo %COMSPEC%") || null,
    node: process.version,
    tmux: run("tmux -V")?.replace(/^tmux\s+/i, "") || null,
    nano:
      os === "darwin"
        ? run("which nano")
          ? "pico"
          : null
        : run("nano --version")?.match(/nano\s+([\d.]+)/i)?.[1] || (run("which nano") ? "installed" : null),
    vim: run("vim --version").match(/Vi IMproved\s+([\d.]+)/)?.[1] || null,
    git: run("git --version")?.replace(/^git version\s+/i, "") || null,
    python:
      run("python3 --version")?.replace(/^Python\s+/i, "") ||
      run("python --version")?.replace(/^Python\s+/i, "") ||
      null,
  };

  // Linux-specific: try to get distro name
  if (os === "linux") {
    const distro = run("cat /etc/os-release 2>/dev/null | grep '^PRETTY_NAME=' | cut -d'\"' -f2");
    if (distro) info.distro = distro;
  }

  // macOS-specific: get friendly version
  if (os === "darwin") {
    const macVer = run("sw_vers -productVersion");
    if (macVer) info.osVersion = macVer;
  }

  return Response.json(info);
}
