import { useState, useRef, useEffect, useCallback } from "react";
import { useBrowserStore, type BrowserTab } from "~/stores/browserStore";
import { isPortBlocked } from "~/lib/constants";

type ProxyState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ready"; url: string }
  | { status: "unreachable"; url: string; message: string };

function useProxyCheck(port: string | undefined): {
  state: ProxyState;
  retry: () => void;
} {
  const [state, setState] = useState<ProxyState>({ status: "idle" });
  const [retryCount, setRetryCount] = useState(0);

  const retry = useCallback(() => {
    if (port) {
      setState({ status: "checking" });
      setRetryCount((c) => c + 1);
    }
  }, [port]);

  useEffect(() => {
    if (!port) { setState({ status: "idle" }); return; }

    const url = `${window.location.origin}/proxy/${port}/`;
    setState({ status: "checking" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch(url, { method: "HEAD", signal: controller.signal })
      .then((res) => {
        clearTimeout(timeout);
        if (res.status === 502) {
          setState({ status: "unreachable", url, message: `localhost:${port} not responding` });
        } else {
          setState({ status: "ready", url });
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        setState({ status: "ready", url });
      });

    return () => { clearTimeout(timeout); controller.abort(); };
  }, [port, retryCount]);

  return { state, retry };
}

function PortRow({ tab }: { tab: BrowserTab }) {
  const removeTab = useBrowserStore((s) => s.removeTab);
  const { state, retry } = useProxyCheck(tab.port);
  const [copied, setCopied] = useState(false);

  const url = state.status === "ready" || state.status === "unreachable" ? state.url : null;

  const handleCopy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[#16162a] border border-gray-700/50 rounded-lg">
      {/* Status dot */}
      {state.status === "checking" && (
        <svg className="w-4 h-4 animate-spin text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {state.status === "ready" && (
        <div className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" title="Reachable" />
      )}
      {state.status === "unreachable" && (
        <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 cursor-pointer" title={state.message + " — click to recheck"} onClick={retry} />
      )}

      {/* Port label */}
      <span className="text-sm text-gray-300 font-mono shrink-0">:{tab.port}</span>

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* Copy button */}
      {url && (
        <button
          onClick={handleCopy}
          className="p-1 text-gray-500 hover:text-gray-200 transition-colors shrink-0"
          title={copied ? "Copied!" : "Copy URL"}
        >
          {copied ? (
            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            </svg>
          )}
        </button>
      )}

      {/* Go button — open in new browser tab */}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors shrink-0 flex items-center gap-1"
        >
          Go
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-6H18m0 0v4.5m0-4.5L10.5 13.5" />
          </svg>
        </a>
      )}

      {/* Delete button */}
      <button
        onClick={() => removeTab(tab.id)}
        className="p-1 text-gray-600 hover:text-red-400 transition-colors shrink-0"
        title="Remove"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function AddPortRow() {
  const [input, setInput] = useState("");
  const addTab = useBrowserStore((s) => s.addTab);
  const setTabPort = useBrowserStore((s) => s.setTabPort);
  const tabs = useBrowserStore((s) => s.tabs);

  const val = input.trim();
  const isNumeric = val !== "" && /^\d+$/.test(val);
  const blocked = isNumeric ? isPortBlocked(parseInt(val, 10)) : null;
  const canAdd = isNumeric && !blocked;

  const handleAdd = () => {
    if (!canAdd) return;
    // Create tab and immediately set its port
    addTab();
    const latest = useBrowserStore.getState().tabs;
    const newTab = latest[latest.length - 1];
    if (newTab) setTabPort(newTab.id, val);
    setInput("");
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span className="text-sm text-gray-500 shrink-0">localhost:</span>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        placeholder="port"
        className={`w-20 bg-[#1a1a2e] text-white border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 ${
          blocked ? "border-red-500 focus:ring-red-500" : "border-gray-600 focus:ring-blue-500"
        }`}
      />
      <button
        onClick={handleAdd}
        disabled={!canAdd}
        className="p-1 text-gray-400 hover:text-white disabled:text-gray-700 transition-colors shrink-0"
        title="Add port"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
      {blocked && (
        <span className="text-[10px] text-red-400 shrink-0">{blocked}</span>
      )}
    </div>
  );
}

export default function BrowserPage() {
  const tabs = useBrowserStore((s) => s.tabs);
  const portsOnly = tabs.filter((t) => t.port);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0d0d1a]">
      {/* Scrollable vertical list: port rows + add input stacked together */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-3 space-y-2">
        {portsOnly.map((tab) => (
          <PortRow key={tab.id} tab={tab} />
        ))}
        <AddPortRow />
      </div>
    </div>
  );
}
