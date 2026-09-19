import { networkInterfaces } from "node:os";

/**
 * Console presentation helpers.
 *
 * Every escape sequence is gated on stdout being a TTY: piped to a log file or
 * a CI job, colour codes are just noise in the output.
 */
const useColour = (): boolean => !!process.stdout.isTTY && !process.env.NO_COLOR;

const wrap = (codes: string, text: string): string => (useColour() ? `${codes}${text}\x1b[0m` : text);

export const dim = (text: string): string => wrap("\x1b[2m", text);
export const green = (text: string): string => wrap("\x1b[32m", text);
export const yellow = (text: string): string => wrap("\x1b[33m", text);

/** A URL the user is meant to copy: bold, underlined and cyan so it stands out
 *  from the surrounding prose. */
export const link = (url: string): string => wrap("\x1b[1;4;36m", url);

export const TICK = "✓";
export const WARN = "⚠";

/**
 * LAN addresses this server is reachable on. Worth printing next to the tunnel
 * URL: on the same network it skips DNS and Cloudflare entirely, which is both
 * faster and immune to the resolver problems a fresh quick-tunnel hostname can
 * hit.
 */
export function localAddresses(port: number): string[] {
  const out: string[] = [];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      // Node <18.4 reports family as a string, newer as a number.
      const isIPv4 = address.family === "IPv4" || (address.family as unknown as number) === 4;
      if (!isIPv4 || address.internal) continue;
      out.push(`http://${address.address}:${port}`);
    }
  }
  return out;
}

/**
 * Check the tunnel actually serves this app before the user goes looking.
 *
 * This runs from the host, so it proves cloudflared is routing to us — it
 * catches a config hijack or a dead origin. It cannot speak for the device the
 * user will browse from, which is the other common failure, so the caller
 * words the result accordingly.
 *
 * Retried over a generous window: a just-created quick-tunnel hostname
 * resolves intermittently for the first several seconds, and measurements on
 * the same tunnel had curl succeeding while fetch failed and then the reverse.
 * A single early attempt reports a perfectly good tunnel as broken.
 */
export async function probe(
  url: string,
  { timeoutMs = 6_000, attempts = 10, gapMs = 3_000 } = {},
): Promise<{ ok: boolean; detail: string }> {
  let last = "no attempt made";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: "manual" });
      if (res.status >= 200 && res.status < 400) return { ok: true, detail: `HTTP ${res.status}` };
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = (err as Error).name === "AbortError" ? "timed out" : (err as Error).message;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, gapMs));
  }
  return { ok: false, detail: last };
}
