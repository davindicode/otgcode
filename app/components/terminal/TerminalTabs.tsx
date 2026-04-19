import { useTerminalStore } from "~/stores/terminalStore";
import { MIN_FONT_SIZE, MAX_FONT_SIZE } from "~/lib/constants";
import RenamableTab from "~/components/RenamableTab";

export default function TerminalTabs() {
  const sessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const setActiveSession = useTerminalStore((s) => s.setActiveSession);
  const closeSession = useTerminalStore((s) => s.closeSession);
  const renameSession = useTerminalStore((s) => s.renameSession);
  const createSession = useTerminalStore((s) => s.createSession);
  const fontSize = useTerminalStore((s) => s.fontSize);
  const setFontSize = useTerminalStore((s) => s.setFontSize);

  const sessionsArray = Object.values(sessions);
  const existingNames = sessionsArray.map((s) => s.name);

  const handleNew = () => {
    createSession(`session-${Date.now()}`);
  };

  return (
    <div className="flex items-center border-t border-gray-700 bg-[#16162a] shrink-0">
      {/* Tabs — scrollable */}
      <div className="flex items-center overflow-x-auto scrollbar-none flex-1 min-w-0">
        {sessionsArray.map((session) => (
          <RenamableTab
            key={session.id}
            name={session.name}
            isActive={activeSessionId === session.id}
            existingNames={existingNames.filter((n) => n !== session.name)}
            onRename={(name) => renameSession(session.id, name)}
            onClick={() => setActiveSession(session.id)}
            onClose={() => closeSession(session.id)}
            icon={
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  session.status === "connected"
                    ? "bg-green-500"
                    : session.status === "connecting"
                      ? "bg-yellow-500 animate-pulse"
                      : session.status === "error"
                        ? "bg-red-500"
                        : "bg-gray-500"
                }`}
              />
            }
          />
        ))}
        <button
          onClick={handleNew}
          className="px-3 py-2 text-gray-400 hover:text-white hover:bg-[#1a1a2e]/50 transition-colors shrink-0"
          title="New terminal"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Font size controls */}
      <div className="flex items-center gap-0.5 px-2 shrink-0 border-l border-gray-700">
        <button
          onClick={() => setFontSize(Math.max(MIN_FONT_SIZE, fontSize - 1))}
          disabled={fontSize <= MIN_FONT_SIZE}
          className="px-0.5 text-gray-400 hover:text-white disabled:text-gray-600 transition-colors leading-none"
          title="Decrease font size"
        >
          <span className="text-[10px] font-bold">a</span>
        </button>
        <span className="text-[10px] text-gray-500 w-4 text-center tabular-nums">{fontSize}</span>
        <button
          onClick={() => setFontSize(Math.min(MAX_FONT_SIZE, fontSize + 1))}
          disabled={fontSize >= MAX_FONT_SIZE}
          className="px-0.5 text-gray-400 hover:text-white disabled:text-gray-600 transition-colors leading-none"
          title="Increase font size"
        >
          <span className="text-[15px] font-bold">A</span>
        </button>
      </div>
    </div>
  );
}
