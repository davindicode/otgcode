import { spawn, type ChildProcess } from "child_process";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

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

// How long to wait for a quick-tunnel URL before giving up on one attempt.
const TUNNEL_STARTUP_TIMEOUT_MS = 30_000;
// How many times to retry when cloudflared exits or times out before emitting a URL.
const TUNNEL_MAX_ATTEMPTS = 3;

// Spawn cloudflared once and resolve with the quick-tunnel URL, or null if it
// exits / errors / times out before emitting one.
function spawnTunnelOnce(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const cfBin = findCloudflared();

    let proc: ChildProcess;
    try {
      const args = ["tunnel", "--config", stubConfigPath(), "--no-autoupdate", "--protocol", "http2", "--url", `http://localhost:${port}`];
      proc = spawn(cfBin, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      console.log(`  cloudflared failed to spawn: ${(err as Error).message}`);
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
        console.log("  cloudflared timed out before producing a tunnel URL");
        settle(null);
      }
    }, TUNNEL_STARTUP_TIMEOUT_MS);

    const handleData = (data: Buffer) => {
      const text = data.toString();
      // Surface cloudflared's own progress/errors so pre-URL failures aren't
      // silent. Once we have a URL, stop — the rest is benign runtime noise
      // (ICMP/ping_group_range warnings, etc.).
      if (!resolved) {
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (/Requesting new quick Tunnel|ERR |error=|failed/i.test(trimmed)) {
            console.log(`  [cloudflared] ${trimmed}`);
          }
        }
      }
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        mainTunnelUrl = match[0];
        console.log(`\n  Tunnel URL: ${match[0]}\n`);
        settle(match[0]);
      }
    };

    proc.stdout?.on("data", handleData);
    proc.stderr?.on("data", handleData);
    proc.on("error", (err) => {
      if (!resolved) {
        console.log(`  cloudflared error: ${err.message}`);
        settle(null);
      }
    });
    proc.on("exit", (code, signal) => {
      // If we already have a URL this is a later teardown; otherwise it died early.
      if (!resolved) {
        console.log(`  cloudflared exited early (code=${code} signal=${signal}) before producing a URL`);
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
  for (let attempt = 1; attempt <= TUNNEL_MAX_ATTEMPTS; attempt++) {
    const url = await spawnTunnelOnce(port);
    if (url) return url;

    // Make sure a dead/stalled process is cleaned up before retrying.
    if (mainTunnelProcess) {
      mainTunnelProcess.kill();
      mainTunnelProcess = null;
    }

    if (attempt < TUNNEL_MAX_ATTEMPTS) {
      console.log(`  Tunnel attempt ${attempt}/${TUNNEL_MAX_ATTEMPTS} failed, retrying...`);
    } else {
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
