import { useCallback, useEffect, useRef, useState } from "react";
import { useTabsStore } from "~/stores/tabsStore";
import { useToastStore } from "~/stores/toastStore";

interface TmuxSession {
  name: string;
  windows: number;
  attached: boolean;
}

/**
 * Picks the tmux session a new tab attaches to.
 *
 * Shown before the tab exists, because a tmux tab *is* its session: it spawns
 * tmux rather than a shell, so a reconnect re-attaches instead of dropping you
 * into a bare shell outside it.
 */
export default function TmuxPicker({ onClose }: { onClose: () => void }) {
  const openTmux = useTabsStore((s) => s.openTmux);
  const closeTmuxTabs = useTabsStore((s) => s.closeTmuxTabs);
  const showToast = useToastStore((s) => s.show);

  const [sessions, setSessions] = useState<TmuxSession[] | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tmux/sessions");
      const data = (await res.json()) as { sessions: TmuxSession[]; version: string | null };
      setSessions(data.sessions);
      setVersion(data.version);
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [load, onClose]);

  const attach = (session: string) => {
    openTmux(session);
    onClose();
  };

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // `tmux new -A` creates the session if it doesn't exist, so attaching is
    // the only operation this needs.
    attach(trimmed);
  };

  const kill = async (session: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/tmux/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: session }),
      });
      const data = await res.json();
      if (data.error) {
        showToast(data.error);
        return;
      }
      // The session is gone, so any tab attached to it has nothing to show.
      closeTmuxTabs(session);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const valid = /^[\w.@-]{1,64}$/.test(name.trim());

  return (
    <div
      className="scrim fixed inset-0 z-[160] flex items-center justify-center px-4"
      onMouseDown={(e) => {
        if (!panelRef.current?.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Attach to a tmux session"
        className="glass flex max-h-[min(26rem,calc(100vh-4rem))] w-full max-w-xs flex-col overflow-hidden rounded-panel"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
          <span className="text-xs font-medium text-ink-muted">
            tmux session {version && <span className="ml-1 font-mono text-[10px] text-ink-ghost">v{version}</span>}
          </span>
          <button onClick={onClose} className="text-ink-faint transition-colors hover:text-ink" aria-label="Close">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {version === null ? (
            <p className="text-[11px] text-yellow-400">tmux is not installed. Install it via your package manager.</p>
          ) : sessions === null ? (
            <p className="text-[11px] text-ink-faint">Loading…</p>
          ) : sessions.length === 0 ? (
            <p className="text-[11px] text-ink-faint">No sessions yet. Name one below to start it.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {sessions.map((s) => (
                <span key={s.name} className="relief flex items-center rounded-control">
                  <button
                    onClick={() => attach(s.name)}
                    disabled={busy}
                    title={`Attach to ${s.name}`}
                    className="py-0.5 pl-2 pr-1 text-[11px] text-ink-muted hover:text-ink"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="ml-1.5 text-ink-faint">{s.windows}w</span>
                    {s.attached && <span className="ml-1 text-green-400">•</span>}
                  </button>
                  <button
                    onClick={() => kill(s.name)}
                    disabled={busy}
                    className="py-0.5 pl-0.5 pr-1.5 text-ink-ghost transition-colors hover:text-red-400"
                    title={`Kill ${s.name} and close its tab`}
                    aria-label={`Kill session ${s.name}`}
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {version !== null && (
          <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && valid && create()}
              placeholder="New session name…"
              className="field min-w-0 flex-1 px-2 py-1 text-[11px]"
            />
            <button
              onClick={create}
              disabled={!valid || busy}
              className="relief-accent shrink-0 rounded-control px-2 py-1 text-[11px] text-white disabled:bg-control disabled:text-ink-faint"
            >
              Create
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
