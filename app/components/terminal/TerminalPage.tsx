import { useEffect, useRef } from "react";
import { useTerminalStore } from "~/stores/terminalStore";
import TerminalTabs from "./TerminalTabs";
import TerminalPanel from "./TerminalPanel";

export default function TerminalPage() {
  const sessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const initSocket = useTerminalStore((s) => s.initSocket);
  const createSession = useTerminalStore((s) => s.createSession);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    initSocket();
    // Check store directly to avoid stale closure
    const currentSessions = useTerminalStore.getState().sessions;
    if (Object.keys(currentSessions).length === 0) {
      createSession(`session-${Date.now()}`);
    }
  }, []);

  const sessionsArray = Object.values(sessions);

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="flex-1 relative min-h-0 overflow-hidden terminal-focus-area rounded-sm">
        {sessionsArray.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p className="text-sm">Click + to create a new terminal</p>
          </div>
        ) : (
          sessionsArray.map((session) => (
            <div
              key={session.id}
              className="absolute inset-0"
              style={{ visibility: activeSessionId === session.id ? "visible" : "hidden" }}
            >
              <TerminalPanel sessionId={session.id} />
            </div>
          ))
        )}
      </div>
      <TerminalTabs />
    </div>
  );
}
