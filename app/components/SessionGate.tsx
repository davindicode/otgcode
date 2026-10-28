import { useEffect, useState } from "react";
import { hasSocket } from "~/lib/socket";
import { useAuthStore } from "~/stores/authStore";
import { usePresenceStore } from "~/stores/presenceStore";
import { useTerminalStore } from "~/stores/terminalStore";

function ago(since: number): string {
  const mins = Math.floor((Date.now() - since) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}

/**
 * Shown instead of the app when another device holds the session, or when one
 * took it from us.
 *
 * OTG Code is single-writer by design: the open tabs, the layout and the
 * terminals behind them are one workspace on one host, so two devices editing
 * it at once used to mean each one silently killing the other's terminals.
 * Two devices on the same terminal is what a tmux tab is for.
 *
 * This stands in for the lock screen too, when the server says the session is
 * held before a password has been asked for: logging in could only land here,
 * and the tabs that used to show through the scrim were a workspace this
 * device was never going to get.
 *
 * The only button asks the server again — the status endpoint before there is
 * a socket, the handshake once there is one. A "take over" button meant anyone
 * who reached the tunnel URL could pull a live terminal out from under whoever
 * was using it — on a phone, by mistapping. Nothing here reconnects on a timer
 * either: whatever put this screen up was the check, and only the other device
 * can give the session up, so a poll would be a question asked over and over
 * on the off-chance. One tap is cheaper and says more.
 */
export default function SessionGate() {
  const status = usePresenceStore((s) => s.status);
  const since = usePresenceStore((s) => s.since);
  const lastCheck = usePresenceStore((s) => s.lastCheck);
  const retryNow = useTerminalStore((s) => s.retryNow);
  const refreshAuth = useAuthStore((s) => s.refresh);

  /**
   * The `lastCheck` the current tap was made against, wrapped so that checking
   * against `null` — the displaced case, which has no refusal behind it yet —
   * is still distinguishable from not checking at all. A refusal bumps
   * `lastCheck`, so the comparison alone ends the wait; the timeout is for a
   * server that answers nothing.
   */
  const [pending, setPending] = useState<{ from: number | null } | null>(null);
  const checking = pending !== null && pending.from === lastCheck;
  useEffect(() => {
    if (!checking) return;
    const id = setTimeout(() => setPending(null), 6000);
    return () => clearTimeout(id);
  }, [checking]);

  // The "in use since" line would otherwise stay frozen at its first render.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const displaced = status === "displaced";

  return (
    // Over the app rather than in place of it, so the terminals behind keep
    // their DOM and nothing has to be rebuilt when the session comes back.
    <div className="scrim fixed inset-0 z-[180] flex flex-col items-center justify-center gap-5 px-6">
      <div className="glass flex w-full max-w-sm flex-col gap-4 rounded-panel p-5">
        <div className="flex items-center gap-2.5">
          <svg
            className="h-5 w-5 shrink-0 text-yellow-400"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <h1 className="text-sm font-medium text-ink">
            {displaced ? "Another device took over" : "Already open on another device"}
          </h1>
        </div>

        <p className="text-[12px] leading-relaxed text-ink-dim">
          {displaced
            ? "Your session here ended when another device connected. Only one device uses OTG Code at a time, so your tabs and terminals stay consistent."
            : "OTG Code runs one session at a time — the open tabs and their terminals are a single workspace on the host, shared by every device that connects."}
          {!displaced && since && <span className="text-ink-faint"> Connected {ago(since)}.</span>}
        </p>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setPending({ from: lastCheck });
              // Before the password there is no socket to retry, and making
              // one would be refused for the other reason (no session cookie)
              // and answer the wrong question.
              if (hasSocket()) retryNow();
              else refreshAuth();
            }}
            disabled={checking}
            className="relief-accent shrink-0 rounded-control px-3 py-1.5 text-[12px] text-white disabled:opacity-60"
          >
            {checking ? "Checking…" : "Check now"}
          </button>
          {checking ? (
            <span className="spinner spinner-sm" aria-hidden="true" />
          ) : (
            lastCheck !== null && (
              <span className="text-[11px] text-ink-faint">Still in use as of {ago(lastCheck)}</span>
            )
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-ink-ghost">
          Sign out on the other device, close its tab, or let its session expire.
        </p>
      </div>
    </div>
  );
}
