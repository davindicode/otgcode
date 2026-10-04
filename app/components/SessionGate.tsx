import { useEffect, useState } from "react";
import { takeOverSession } from "~/lib/socket";
import { usePresenceStore } from "~/stores/presenceStore";

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
 */
export default function SessionGate() {
  const status = usePresenceStore((s) => s.status);
  const since = usePresenceStore((s) => s.since);
  const [busy, setBusy] = useState(false);

  // The "in use since" line would otherwise stay frozen at its first render.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const displaced = status === "displaced";

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-5 bg-app px-6">
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

        <button
          type="button"
          onClick={() => {
            setBusy(true);
            takeOverSession();
          }}
          disabled={busy}
          className="relief-accent rounded-control px-3 py-2 text-xs font-medium text-white disabled:bg-control disabled:text-ink-faint"
        >
          {busy ? "Connecting…" : displaced ? "Take it back" : "Take over"}
        </button>

        <p className="text-[11px] leading-relaxed text-ink-ghost">
          {displaced
            ? "Taking it back will disconnect whichever device has it now."
            : "The other device will be disconnected and told why. Its tmux sessions keep running — a tmux tab re-attaches to them."}
        </p>
      </div>
    </div>
  );
}
