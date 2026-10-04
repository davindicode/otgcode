import { useTerminalStore } from "~/stores/terminalStore";
import TerminalPanel from "./TerminalPanel";

/**
 * A terminal tab's pane. The controls live in InputBox, which the shell
 * renders once per terminal or tmux tab beneath the pane area.
 */
export default function TerminalPane({ sessionId }: { sessionId: string }) {
  const status = useTerminalStore((s) => s.sessions[sessionId]?.status);
  const socketConnected = useTerminalStore((s) => s.socketConnected);
  const restartSession = useTerminalStore((s) => s.restartSession);

  // A pty can go while the socket stays up — the shell exited, or tmux's
  // server was killed from elsewhere. Every control then silently did nothing,
  // which reads as the whole tab having frozen. Say so, and offer the one
  // thing that helps. While the socket itself is down the shell already shows
  // its own gate, so this stays out of the way.
  const dead = socketConnected && (status === "disconnected" || status === "error");

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="flex-1 relative min-h-0 overflow-hidden terminal-focus-area rounded-sm">
        <div className="absolute inset-0">
          <TerminalPanel sessionId={sessionId} />
        </div>
        {dead && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-scrim px-3 py-2">
            <span className="text-[11px] text-ink-muted">This session ended.</span>
            <button
              type="button"
              onClick={() => restartSession(sessionId)}
              className="relief-accent rounded-control px-2 py-0.5 text-[11px] text-white"
            >
              Restart
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
