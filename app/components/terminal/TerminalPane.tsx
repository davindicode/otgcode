import TerminalPanel from "./TerminalPanel";

/**
 * A terminal tab's pane. The controls live in InputBox, which the shell
 * renders once beneath the pane area — it binds to the active session, and a
 * terminal tab is only visible while it is the active one.
 */
export default function TerminalPane({ sessionId }: { sessionId: string }) {
  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="flex-1 relative min-h-0 overflow-hidden terminal-focus-area rounded-sm">
        <div className="absolute inset-0">
          <TerminalPanel sessionId={sessionId} />
        </div>
      </div>
    </div>
  );
}
