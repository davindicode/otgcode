import { useEffect, useRef, useState } from "react";
import LocalhostPopup from "./browser/LocalhostPopup";
import SettingsModal from "./SettingsModal";

declare const __APP_VERSION__: string;

type Panel = "info" | "settings" | "localhost";

// Marks the header buttons so the click-outside handler can ignore them —
// without this, clicking an open panel's own trigger would close it on
// mousedown and immediately reopen it on click.
const TRIGGER_ATTR = "data-header-panel-trigger";

// Round-trip thresholds for a browser talking to this server, usually over a
// Cloudflare tunnel: under 100ms feels immediate, past 300ms typing lags.
function latencyClass(ms: number): string {
  if (ms < 100) return "rtt-good";
  if (ms < 300) return "rtt-ok";
  return "rtt-poor";
}

/**
 * Round-trip time to the server. Median of a few samples so one slow request
 * doesn't dominate, and re-measured every few seconds while the popup is open.
 */
function useLatency(): number | null {
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const sample = async (): Promise<number | null> => {
      const start = performance.now();
      try {
        const res = await fetch("/api/ping", { cache: "no-store" });
        if (!res.ok) return null;
        return performance.now() - start;
      } catch {
        return null;
      }
    };

    const measure = async () => {
      const samples: number[] = [];
      for (let i = 0; i < 3; i++) {
        const value = await sample();
        if (cancelled) return;
        if (value !== null) samples.push(value);
      }
      if (cancelled || samples.length === 0) return;
      samples.sort((a, b) => a - b);
      setMs(Math.round(samples[Math.floor(samples.length / 2)]));
    };

    measure();
    const timer = window.setInterval(measure, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return ms;
}

function SystemInfoPopup({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<Record<string, string | null> | null>(null);
  const latency = useLatency();
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/system-info")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo({}));
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest(`[${TRIGGER_ATTR}]`)) return;
      if (popupRef.current && !popupRef.current.contains(target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={popupRef}
      className="absolute right-2 top-10 z-50 bg-surface border border-line rounded-panel shadow-xl w-72 max-h-80 overflow-y-auto"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-line">
        <span className="text-xs font-medium text-ink-muted">System Info</span>
        <button onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Close">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="space-y-1 border-b border-line px-3 py-2">
        <div className="flex justify-between gap-2 text-[11px]">
          <span className="text-ink-faint shrink-0">OTG Code</span>
          <span className="text-right font-mono text-ink-muted">v{__APP_VERSION__}</span>
        </div>
        <div className="flex justify-between gap-2 text-[11px]">
          <span className="text-ink-faint shrink-0">connection latency</span>
          <span
            className={`text-right font-mono tabular-nums ${
              latency === null ? "text-ink-muted" : latencyClass(latency)
            }`}
          >
            {latency === null ? "—" : `${latency} ms`}
          </span>
        </div>
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
          {Object.entries(info).map(([key, val]) =>
            val ? (
              <div key={key} className="flex justify-between gap-2 text-[11px]">
                <span className="text-ink-faint shrink-0">{key}</span>
                <span className="text-ink-muted text-right break-all">{val}</span>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const [panel, setPanel] = useState<Panel | null>(null);

  // Clicking a trigger opens its panel, or closes it if already open. Only one
  // panel is ever open.
  const toggle = (next: Panel) => setPanel((current) => (current === next ? null : next));

  const triggerClass = (active: boolean) =>
    `p-1 rounded-control transition-colors ${active ? "bg-hover text-ink" : "text-ink-faint hover:text-ink"}`;

  return (
    <header className="bar-edge flex items-center justify-between px-3 py-1.5 bg-surface border-b border-line shrink-0 relative">
      <div className="flex items-center gap-2">
        <img src="/logo-square.png" alt="OTG Code" className="w-6 h-6 rounded-control" />
        <span className="text-ink font-bold text-sm">OTG Code</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          {...{ [TRIGGER_ATTR]: "localhost" }}
          onClick={() => toggle("localhost")}
          className={triggerClass(panel === "localhost")}
          title="Localhost ports"
          aria-label="Localhost ports"
          aria-pressed={panel === "localhost"}
          aria-expanded={panel === "localhost"}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
            />
          </svg>
        </button>
        <button
          {...{ [TRIGGER_ATTR]: "info" }}
          onClick={() => toggle("info")}
          className={triggerClass(panel === "info")}
          title="System info"
          aria-label="System info"
          aria-pressed={panel === "info"}
          aria-expanded={panel === "info"}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
        <button
          {...{ [TRIGGER_ATTR]: "settings" }}
          onClick={() => toggle("settings")}
          className={triggerClass(panel === "settings")}
          title="Settings"
          aria-label="Settings"
          aria-pressed={panel === "settings"}
          aria-expanded={panel === "settings"}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
      {panel === "localhost" && <LocalhostPopup onClose={() => setPanel(null)} />}
      {panel === "info" && <SystemInfoPopup onClose={() => setPanel(null)} />}
      {panel === "settings" && <SettingsModal onClose={() => setPanel(null)} />}
    </header>
  );
}
