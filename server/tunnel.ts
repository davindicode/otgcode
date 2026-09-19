import { type ChildProcess, spawn } from "child_process";
import { existsSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { isPasswordEnabled, localUsername } from "./auth.js";
import { type Progress, startProgress } from "./progress.js";

// Main OTG Code tunnel
let mainTunnelProcess: ChildProcess | null = null;
let mainTunnelUrl: string | null = null;

// Cloudflared loads ~/.cloudflared/config.yml AND /etc/cloudflared/config.yml (plus
// /usr/local/etc/cloudflared/...) by default. If any of those configs define an
// ingress catch-all (e.g. `http_status: 404`), it will hijack our quick-tunnel
// traffic. Passing an explicit --config to a stub bypasses all default search paths.
function stubConfigPath(): string {
  const stub = join(tmpdir(), `otgcode-cloudflared-stub-${process.pid}.yml`);
  if (!existsSync(stub)) {
    writeFileSync(stub, "no-autoupdate: true\n");
  }
  return stub;
}

function findCloudflared(): string {
  if (process.env.CLOUDFLARED_BIN && existsSync(process.env.CLOUDFLARED_BIN)) {
    return process.env.CLOUDFLARED_BIN;
  }
  const binDir = join(process.cwd(), ".bin");
  const localBin = join(binDir, "cloudflared");
  if (existsSync(localBin)) return localBin;
  const localExe = join(binDir, "cloudflared.exe");
  if (existsSync(localExe)) return localExe;
  return "cloudflared";
}

// A quick-tunnel URL is unauthenticated and publicly routable: anyone who has
// it gets this machine's terminal as the launching user, plus read/write access
// to every file that user can reach. Say so next to the URL, every time.
export function tunnelPrivacyWarning(username: string, passwordEnabled: boolean): string {
  const lines = [
    "  ⚠  Keep this URL private.",
    `     Anyone who reaches it gets a terminal on this machine as "${username}",`,
    "     plus read/write access to your files.",
  ];
  if (passwordEnabled) {
    lines.push("     An access password is set, so visitors have to log in first.");
  } else {
    lines.push("     There is no login — the URL is the only thing protecting it.");
    lines.push("     Add an access password in Settings (cog, top right) for a second layer.");
  }
  return lines.join("\n");
}

function printTunnelPrivacyWarning(): void {
  console.log(`\n${tunnelPrivacyWarning(localUsername(), isPasswordEnabled())}\n`);
}

// How long to wait for a quick-tunnel URL before giving up on one attempt.
const TUNNEL_STARTUP_TIMEOUT_MS = 30_000;
// How many times to retry when cloudflared exits or times out before emitting a URL.
const TUNNEL_MAX_ATTEMPTS = 3;

// Spawn cloudflared once and resolve with the quick-tunnel URL, or null if it
// exits / errors / times out before emitting one.
function spawnTunnelOnce(port: number, progress: Progress): Promise<string | null> {
  return new Promise((resolve) => {
    const cfBin = findCloudflared();

    let proc: ChildProcess;
    try {
      const args = [
        "tunnel",
        "--config",
        stubConfigPath(),
        "--no-autoupdate",
        "--protocol",
        "http2",
        "--url",
        `http://localhost:${port}`,
      ];
      proc = spawn(cfBin, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      progress.log(`  cloudflared failed to spawn: ${(err as Error).message}`);
      resolve(null);
      return;
    }

    mainTunnelProcess = proc;

    let resolved = false;
    const settle = (url: string | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve(url);
    };

    const timeout = setTimeout(() => {
      if (!resolved) {
        progress.log("  cloudflared timed out before producing a tunnel URL");
        settle(null);
      }
    }, TUNNEL_STARTUP_TIMEOUT_MS);

    const handleData = (data: Buffer) => {
      const text = data.toString();
      // Surface cloudflared's own failures so a pre-URL problem isn't silent.
      // Its progress chatter is dropped: the spinner already says we're
      // waiting. Once we have a URL, stop — the rest is benign runtime noise
      // (ICMP/ping_group_range warnings, etc.).
      if (!resolved) {
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (/ERR |error=|failed/i.test(trimmed)) {
            progress.log(`  [cloudflared] ${trimmed}`);
          }
        }
      }
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        mainTunnelUrl = match[0];
        settle(match[0]);
      }
    };

    proc.stdout?.on("data", handleData);
    proc.stderr?.on("data", handleData);
    proc.on("error", (err) => {
      if (!resolved) {
        progress.log(`  cloudflared error: ${err.message}`);
        settle(null);
      }
    });
    proc.on("exit", (code, signal) => {
      // If we already have a URL this is a later teardown; otherwise it died early.
      if (!resolved) {
        progress.log(`  cloudflared exited early (code=${code} signal=${signal}) before producing a URL`);
        settle(null);
      }
      if (mainTunnelProcess === proc) {
        mainTunnelProcess = null;
        mainTunnelUrl = null;
      }
    });
  });
}

// Start the main OTG Code tunnel, retrying on early exit / timeout since
// trycloudflare quick-tunnel registration is intermittently flaky.
export async function startTunnel(port: number): Promise<string | null> {
  const progress = startProgress("Generating tunnel URL");
  try {
    return await runTunnelAttempts(port, progress);
  } finally {
    progress.stop();
  }
}

async function runTunnelAttempts(port: number, progress: Progress): Promise<string | null> {
  for (let attempt = 1; attempt <= TUNNEL_MAX_ATTEMPTS; attempt++) {
    const url = await spawnTunnelOnce(port, progress);
    if (url) {
      progress.stop();
      console.log(`\n  Tunnel URL: ${url}`);
      printTunnelPrivacyWarning();
      return url;
    }

    // Make sure a dead/stalled process is cleaned up before retrying.
    if (mainTunnelProcess) {
      mainTunnelProcess.kill();
      mainTunnelProcess = null;
    }

    if (attempt < TUNNEL_MAX_ATTEMPTS) {
      progress.log(`  Tunnel attempt ${attempt}/${TUNNEL_MAX_ATTEMPTS} failed, retrying...`);
    } else {
      progress.stop();
      console.log(`\n  Could not establish a Cloudflare tunnel after ${TUNNEL_MAX_ATTEMPTS} attempts.`);
      console.log(`  Server is still running locally at http://localhost:${port}\n`);
    }
  }
  return null;
}

export function getMainTunnelUrl(): string | null {
  return mainTunnelUrl;
}

export function stopTunnel(): void {
  if (mainTunnelProcess) {
    mainTunnelProcess.kill();
    mainTunnelProcess = null;
    mainTunnelUrl = null;
  }
}

export function stopAllTunnels(): void {
  stopTunnel();
}
