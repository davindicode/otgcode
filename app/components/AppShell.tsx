import { useEffect, useState } from "react";
import { useAuthStore } from "~/stores/authStore";
import { usePresenceStore } from "~/stores/presenceStore";
import { toWorkspaceTabs, useTabsStore } from "~/stores/tabsStore";
import { useTerminalStore } from "~/stores/terminalStore";
import { useWorkspaceStore } from "~/stores/workspaceStore";
import ConnectionGate from "./ConnectionGate";
import FilesPage from "./files/FilesPage";
import Header from "./Header";
import PasswordGate from "./PasswordGate";
import PasswordSetup from "./PasswordSetup";
import SessionGate from "./SessionGate";
import TabBar from "./TabBar";
import Toaster from "./Toaster";
import InputBox from "./terminal/InputBox";
import TerminalPane from "./terminal/TerminalPane";
import ViewerPane from "./ViewerPane";

/**
 * Reopen the tabs recorded in the workspace file. A fresh install opens on an
 * empty board: the first tab is the user's to pick with +, rather than a shell
 * nobody asked for. Closing every tab is the same state, and stays that way.
 */
function restoreTabs() {
  const saved = useWorkspaceStore.getState().restored;
  const tabs = useTabsStore.getState();
  if (tabs.tabs.length > 0 || !saved) return;

  useTerminalStore.setState({ fontSize: saved.fontSize });
  if (saved.tabs.length > 0) tabs.restore(saved.tabs, saved.activeId);
}

/** Mirror tab changes back into the workspace file (the store debounces). */
function watchTabs(): () => void {
  const { saveTabs } = useWorkspaceStore.getState();
  let last = "";

  const push = () => {
    const { tabs, activeId } = useTabsStore.getState();
    const payload = { tabs: toWorkspaceTabs(tabs), activeId };
    const key = JSON.stringify(payload);
    if (key === last) return;
    last = key;
    saveTabs(payload);
  };

  // The tab strip changes on open/close/rename; the content stores change when
  // a directory or a terminal's cwd moves, which is also worth remembering.
  const unsubTabs = useTabsStore.subscribe(push);
  const unsubTerminals = useTerminalStore.subscribe(push);
  return () => {
    unsubTabs();
    unsubTerminals();
  };
}

export default function AppShell() {
  const socketConnected = useTerminalStore((s) => s.socketConnected);
  const initSocket = useTerminalStore((s) => s.initSocket);
  const authLoaded = useAuthStore((s) => s.loaded);
  const locked = useAuthStore((s) => s.enabled && !s.authenticated);
  const configured = useAuthStore((s) => s.configured);
  const refreshAuth = useAuthStore((s) => s.refresh);
  const hydrateWorkspace = useWorkspaceStore((s) => s.hydrate);
  const [workspaceReady, setWorkspaceReady] = useState(false);

  const sessionStatus = usePresenceStore((s) => s.status);
  const tabs = useTabsStore((s) => s.tabs);
  const activeId = useTabsStore((s) => s.activeId);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  // The workspace endpoint is behind the auth gate, so only reach for it once
  // we know the app is unlocked.
  useEffect(() => {
    if (!authLoaded || locked || workspaceReady) return;
    let cancelled = false;
    hydrateWorkspace().then(() => {
      if (cancelled) return;
      restoreTabs();
      setWorkspaceReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoaded, locked, workspaceReady, hydrateWorkspace]);

  useEffect(() => {
    if (!workspaceReady) return;
    return watchTabs();
  }, [workspaceReady]);

  // Hold the socket back until we know the app isn't locked — connecting first
  // would just be rejected by the server's socket gate.
  useEffect(() => {
    if (authLoaded && !locked && workspaceReady) initSocket();
  }, [authLoaded, locked, workspaceReady, initSocket]);

  if (!authLoaded || (!locked && !workspaceReady)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-app">
        <div className="spinner" />
      </div>
    );
  }

  if (locked) return <PasswordGate />;
  if (!configured) return <PasswordSetup />;
  // Another device holds the session, or took it. Nothing here can work until
  // that is resolved, so don't render an app that would fight it.
  if (sessionStatus !== "ok") return <SessionGate />;

  return (
    <div className="app-shell bg-app text-ink">
      <Toaster />
      <div
        className={`flex min-h-0 flex-1 flex-col transition-[filter,opacity] duration-200 ${
          socketConnected ? "" : "pointer-events-none opacity-45 grayscale"
        }`}
        inert={!socketConnected}
        aria-hidden={!socketConnected}
      >
        <Header />
        <TabBar />

        {/* One pane. Every tab stays mounted and is toggled with CSS, so a
            terminal keeps its scrollback and socket while you work elsewhere. */}
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          {tabs.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-ink-faint">
              Nothing open — use + to start a terminal, a tmux session or a file explorer.
            </div>
          ) : (
            tabs.map((tab) => (
              <div
                key={tab.id}
                className="flex-1 flex flex-col min-h-0"
                style={{ display: tab.id === activeId ? "flex" : "none" }}
              >
                {(tab.kind === "terminal" || tab.kind === "tmux") && <TerminalPane sessionId={tab.id} />}
                {tab.kind === "explorer" && <FilesPage sessionId={tab.id} />}
                {tab.kind === "viewer" && tab.path && <ViewerPane tabId={tab.id} path={tab.path} />}
              </div>
            ))
          )}
        </div>

        {/* One control surface per terminal or tmux tab, hidden unless that
            tab is showing. Sharing one bound to the active session carried the
            open drawer and the typed text across tabs, and could leave a tmux
            drawer open on a tab with no tmux session behind it. */}
        {tabs
          .filter((tab) => tab.kind === "terminal" || tab.kind === "tmux")
          .map((tab) => (
            <div key={tab.id} hidden={tab.id !== activeId}>
              <InputBox sessionId={tab.id} />
            </div>
          ))}
      </div>
      {!socketConnected && <ConnectionGate />}
    </div>
  );
}
