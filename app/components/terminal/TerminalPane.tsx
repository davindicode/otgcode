import { useEffect, useState } from "react";
import { useTabsStore } from "~/stores/tabsStore";
import { useTerminalStore } from "~/stores/terminalStore";
import TerminalPanel from "./TerminalPanel";

/** How often the on-screen pane checks whether its terminal is capturing input. */
const MOUSE_CHECK_MS = 1000;

/**
 * A terminal tab's pane. The controls live in InputBox, which the shell
 * renders once per terminal or tmux tab beneath the pane area.
 */
export default function TerminalPane({ sessionId }: { sessionId: string }) {
  const status = useTerminalStore((s) => s.sessions[sessionId]?.status);
  const socketConnected = useTerminalStore((s) => s.socketConnected);
  const restartSession = useTerminalStore((s) => s.restartSession);
  const stopInputReporting = useTerminalStore((s) => s.stopInputReporting);
  const isActive = useTabsStore((s) => s.activeId === sessionId);
  const [capturing, setCapturing] = useState(false);
  // Turned it off once and something turned it straight back on: tmux with
  // `mouse on` does exactly that. It wants the mouse, so stop offering until
  // capture ends on its own.
  const [declined, setDeclined] = useState(false);

  // A pty can go while the socket stays up — the shell exited, or tmux's
  // server was killed from elsewhere. Every control then silently did nothing,
  // which reads as the whole tab having frozen. Say so, and offer the one
  // thing that helps. While the socket itself is down the shell already shows
  // its own gate, so this stays out of the way.
  const dead = socketConnected && (status === "disconnected" || status === "error");

  // Whether the terminal is reporting pointer movement. A program that enables
  // it and exits without turning it off leaves every mouse move going to a
  // shell that prints it as text — the `35;79;43M` spam. xterm knows its own
  // mode but does not announce changes, so the pane on screen asks.
  useEffect(() => {
    if (!isActive) return;
    const check = () => {
      const term = useTerminalStore.getState().sessions[sessionId]?.terminal;
      const on = !!term && term.modes.mouseTrackingMode !== "none";
      setCapturing(on);
      if (!on) setDeclined(false);
    };
    check();
    const id = setInterval(check, MOUSE_CHECK_MS);
    return () => clearInterval(id);
  }, [sessionId, isActive]);

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="flex-1 relative min-h-0 overflow-hidden terminal-focus-area rounded-sm">
        <div className="absolute inset-0">
          <TerminalPanel sessionId={sessionId} />
        </div>

        {/* Offered whenever capture is on, not only when it is stuck: there is
            no telling a program that wants the mouse from one that forgot to
            give it back, and on a touchscreen you may want it off either way.
            Turning it off cannot break a running program — it just stops
            getting mouse events. */}
        {capturing && !declined && !dead && (
          <div className="absolute bottom-0 right-0 flex items-center gap-1.5 bg-scrim px-2 py-1">
            <span className="text-[10px] text-ink-faint">mouse capture on</span>
            <button
              type="button"
              onClick={() => {
                stopInputReporting(sessionId);
                setDeclined(true);
              }}
              title="Stop the terminal reporting pointer movement"
              className="relief rounded-control px-1.5 py-0.5 text-[10px] text-ink-muted hover:text-ink"
            >
              turn off
            </button>
          </div>
        )}

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
