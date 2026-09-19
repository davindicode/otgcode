import { useEffect, useRef, useState } from "react";
import { type Tab, useTabsStore } from "~/stores/tabsStore";
import { useTerminalStore } from "~/stores/terminalStore";
import RenamableTab from "./RenamableTab";

const TerminalIcon = () => (
  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    />
  </svg>
);

const ExplorerIcon = () => (
  <svg className="w-3.5 h-3.5 shrink-0 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
  </svg>
);

const ViewerIcon = () => (
  <svg
    className="w-3.5 h-3.5 shrink-0 text-ink-dim"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  </svg>
);

/** A terminal tab's dot doubles as its connection state. */
function TerminalStatusDot({ id }: { id: string }) {
  const status = useTerminalStore((s) => s.sessions[id]?.status);
  return (
    <span
      className={`w-2 h-2 rounded-full shrink-0 ${
        status === "connected"
          ? "bg-green-500"
          : status === "connecting"
            ? "bg-yellow-500 animate-pulse"
            : status === "error"
              ? "bg-red-500"
              : "bg-gray-500"
      }`}
    />
  );
}

function tabIcon(tab: Tab) {
  if (tab.kind === "terminal") return <TerminalStatusDot id={tab.id} />;
  if (tab.kind === "explorer") return <ExplorerIcon />;
  return <ViewerIcon />;
}

/** The + menu. Only the two tab types a user can create from scratch appear —
 *  viewer tabs are spawned by opening a file in an explorer. */
function NewTabMenu({ onPick, onClose }: { onPick: (kind: "terminal" | "explorer") => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest("[data-new-tab-trigger]")) return;
      if (ref.current && !ref.current.contains(target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const item = (kind: "terminal" | "explorer", label: string, hint: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => onPick(kind)}
      className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-hover"
    >
      <span className="mt-0.5">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-ink">{label}</span>
        <span className="block text-[11px] text-ink-faint">{hint}</span>
      </span>
    </button>
  );

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="New tab"
      className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden glass rounded-panel py-1"
    >
      {item("terminal", "Terminal tab", "A new shell session", <TerminalIcon />)}
      {item("explorer", "Explorer tab", "Browse files and folders", <ExplorerIcon />)}
    </div>
  );
}

/**
 * One strip for every tab in the app. Replaces the old per-pane tab rows and
 * the mobile footer: there is a single pane now, so there is a single strip.
 */
export default function TabBar() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeId = useTabsStore((s) => s.activeId);
  const setActive = useTabsStore((s) => s.setActive);
  const close = useTabsStore((s) => s.close);
  const rename = useTabsStore((s) => s.rename);
  const openTerminal = useTabsStore((s) => s.openTerminal);
  const openExplorer = useTabsStore((s) => s.openExplorer);
  const [menuOpen, setMenuOpen] = useState(false);

  const pick = (kind: "terminal" | "explorer") => {
    setMenuOpen(false);
    if (kind === "terminal") openTerminal();
    else openExplorer();
  };

  return (
    <div className="bar-edge relative flex items-center border-b border-line bg-app shrink-0">
      <div className="flex items-center overflow-x-auto scrollbar-none flex-1 min-w-0">
        {tabs.map((tab) => (
          <RenamableTab
            key={tab.id}
            name={tab.title}
            isActive={tab.id === activeId}
            // A viewer tab is named by its file; renaming it would be a lie.
            renamable={tab.kind !== "viewer"}
            existingNames={tabs.filter((t) => t.id !== tab.id).map((t) => t.title)}
            onRename={(name) => rename(tab.id, name)}
            onClick={() => setActive(tab.id)}
            onClose={() => close(tab.id)}
            showClose={tabs.length > 1}
            title={tab.kind === "viewer" ? tab.path : undefined}
            icon={tabIcon(tab)}
          />
        ))}
      </div>

      <div className="relative shrink-0">
        <button
          type="button"
          data-new-tab-trigger=""
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="New tab"
          title="New tab"
          className={`p-2 rounded-control transition-colors ${
            menuOpen ? "bg-hover text-ink" : "text-ink-dim hover:text-ink"
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
        {menuOpen && <NewTabMenu onPick={pick} onClose={() => setMenuOpen(false)} />}
      </div>
    </div>
  );
}
