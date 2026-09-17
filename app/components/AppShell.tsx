import { useEffect, useState } from "react";
import { useAuthStore } from "~/stores/authStore";
import { useFileStore } from "~/stores/fileStore";
import { useTerminalStore } from "~/stores/terminalStore";
import { useUiStore } from "~/stores/uiStore";
import { useWorkspaceStore } from "~/stores/workspaceStore";
import ConnectionGate from "./ConnectionGate";
import FilesPage from "./files/FilesPage";
import Header from "./Header";
import MobileTabBar from "./MobileTabBar";
import PasswordGate from "./PasswordGate";
import ResizablePanels from "./ResizablePanels";
import Toaster from "./Toaster";
import InputBox from "./terminal/InputBox";
import TerminalPage from "./terminal/TerminalPage";

// Desktop layout requires landscape orientation AND at least 768px width,
// OR at least 1024px width in any orientation.
// This ensures portrait tablets get the mobile single-panel UI.
const DESKTOP_QUERY = "(min-width: 1024px), (min-width: 768px) and (orientation: landscape)";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.matchMedia(DESKTOP_QUERY).matches : true,
  );
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

/**
 * Re-open the explorer and terminal tabs recorded in the workspace file. Runs
 * before the panels mount, so their "create a default session" effects see the
 * restored tabs and don't add a stray one on top.
 */
function restoreTabs() {
  const saved = useWorkspaceStore.getState().restored;
  if (!saved) return;

  useTerminalStore.setState({ fontSize: saved.fontSize });

  const files = useFileStore.getState();
  if (Object.keys(files.sessions).length === 0) {
    for (const tab of saved.files.tabs) files.createSession(tab.id, tab.name, tab.cwd);
    if (saved.files.activeId) files.setActiveSession(saved.files.activeId);
  }

  const terminals = useTerminalStore.getState();
  if (Object.keys(terminals.sessions).length === 0) {
    for (const tab of saved.terminals.tabs) terminals.createSession(tab.id, tab.name, tab.cwd || undefined);
    if (saved.terminals.activeId) terminals.setActiveSession(saved.terminals.activeId);
  }
}

/** Mirror tab changes back into the workspace file (the store debounces). */
function watchTabs(): () => void {
  const { saveTabs } = useWorkspaceStore.getState();
  let lastFiles = "";
  let lastTerminals = "";

  const unsubFiles = useFileStore.subscribe((state) => {
    const tabs = Object.values(state.sessions).map((s) => ({ id: s.id, name: s.name, cwd: s.cwd }));
    const key = JSON.stringify([tabs, state.activeSessionId]);
    if (key === lastFiles) return;
    lastFiles = key;
    saveTabs({ files: { tabs, activeId: state.activeSessionId } });
  });

  const unsubTerminals = useTerminalStore.subscribe((state) => {
    const tabs = Object.values(state.sessions).map((s) => ({ id: s.id, name: s.name, cwd: s.cdCwd }));
    const key = JSON.stringify([tabs, state.activeSessionId]);
    if (key === lastTerminals) return;
    lastTerminals = key;
    saveTabs({ terminals: { tabs, activeId: state.activeSessionId } });
  });

  return () => {
    unsubFiles();
    unsubTerminals();
  };
}

export default function AppShell() {
  const activeTab = useUiStore((s) => s.activeTab);
  const isDesktop = useIsDesktop();
  const socketConnected = useTerminalStore((s) => s.socketConnected);
  const initSocket = useTerminalStore((s) => s.initSocket);
  const authLoaded = useAuthStore((s) => s.loaded);
  const locked = useAuthStore((s) => s.enabled && !s.authenticated);
  const refreshAuth = useAuthStore((s) => s.refresh);
  const hydrateWorkspace = useWorkspaceStore((s) => s.hydrate);
  const [workspaceReady, setWorkspaceReady] = useState(false);

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

        {isDesktop ? (
          /* Desktop: 3-column resizable panels */
          <div className="flex flex-1 overflow-hidden min-h-0">
            <ResizablePanels
              left={<FilesPage />}
              right={
                <div className="flex flex-col h-full min-h-0 min-w-0 w-full">
                  <TerminalPage />
                  <InputBox />
                </div>
              }
            />
          </div>
        ) : (
          /* Mobile: single panel with tab switching */
          <>
            <div className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div
                className="flex-1 flex flex-col min-h-0"
                style={{ display: activeTab === "terminal" ? "flex" : "none" }}
              >
                <TerminalPage />
                <InputBox />
              </div>
              <div
                className="flex-1 flex flex-col min-h-0"
                style={{ display: activeTab === "files" ? "flex" : "none" }}
              >
                <FilesPage />
              </div>
            </div>
            <MobileTabBar />
          </>
        )}
      </div>
      {!socketConnected && <ConnectionGate />}
    </div>
  );
}
