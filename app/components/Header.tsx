import { useState, useEffect, useRef } from "react";
import { useTerminalStore } from "~/stores/terminalStore";

declare const __APP_VERSION__: string;

function SystemInfoPopup({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<Record<string, string | null> | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/system-info")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo({}));
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={popupRef} className="absolute right-2 top-10 z-50 bg-[#16162a] border border-gray-700 rounded-lg shadow-xl w-72 max-h-80 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-xs font-medium text-gray-300">System Info</span>
        <button onClick={onClose} className="text-gray-500 hover:text-white">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      {!info ? (
        <div className="flex items-center justify-center py-4">
          <svg className="w-5 h-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : (
        <div className="px-3 py-2 space-y-1">
          {Object.entries(info).map(([key, val]) => val ? (
            <div key={key} className="flex justify-between gap-2 text-[11px]">
              <span className="text-gray-500 shrink-0">{key}</span>
              <span className="text-gray-300 text-right break-all">{val}</span>
            </div>
          ) : null)}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const socketConnected = useTerminalStore((s) => s.socketConnected);
  const sessions = useTerminalStore((s) => s.sessions);
  const [showInfo, setShowInfo] = useState(false);

  const hasActiveSessions = Object.values(sessions).some(
    (s) => s.status === "connected" || s.status === "connecting"
  );

  const status = !socketConnected
    ? "offline"
    : hasActiveSessions
      ? "online"
      : Object.keys(sessions).length > 0
        ? "reconnecting"
        : "online";

  return (
    <header className="flex items-center justify-between px-3 py-1.5 bg-[#0d0d1a] border-b border-gray-800 shrink-0 relative">
      <div className="flex items-center gap-2">
        <img src="/logo-square.png" alt="OTG Code" className="w-6 h-6 rounded" />
        <span className="text-white font-bold text-sm">OTG Code</span>
        <span className="text-gray-500 text-[10px] font-mono">v{__APP_VERSION__}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="p-1 text-gray-500 hover:text-white transition-colors rounded"
          title="System info"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        <span
          className={`w-2 h-2 rounded-full ${
            status === "online"
              ? "bg-green-500"
              : status === "reconnecting"
                ? "bg-yellow-500 animate-pulse"
                : "bg-red-500"
          }`}
        />
        <span className={`text-xs ${
          status === "online"
            ? "text-green-500"
            : status === "reconnecting"
              ? "text-yellow-500"
              : "text-red-400"
        }`}>
          {status}
        </span>
      </div>
      {showInfo && <SystemInfoPopup onClose={() => setShowInfo(false)} />}
    </header>
  );
}
