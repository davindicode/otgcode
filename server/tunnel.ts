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

// Start the main OTG Code tunnel
export async function startTunnel(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const cfBin = findCloudflared();

    try {
      const args = ["tunnel", "--config", stubConfigPath(), "--no-autoupdate", "--protocol", "http2", "--url", `http://localhost:${port}`];
      mainTunnelProcess = spawn(cfBin, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      console.log("  cloudflared not found, skipping tunnel");
      resolve(null);
      return;
    }

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) { resolved = true; resolve(null); }
    }, 30_000);

    const handleData = (data: Buffer) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        mainTunnelUrl = match[0];
        console.log(`\n  Tunnel URL: ${match[0]}\n`);
        resolve(match[0]);
      }
    };

    mainTunnelProcess.stdout?.on("data", handleData);
    mainTunnelProcess.stderr?.on("data", handleData);
    mainTunnelProcess.on("error", () => {
      if (!resolved) { resolved = true; clearTimeout(timeout); resolve(null); }
    });
    mainTunnelProcess.on("exit", () => {
      mainTunnelProcess = null;
      mainTunnelUrl = null;
    });
  });
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
