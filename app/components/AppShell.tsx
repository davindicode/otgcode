import { useEffect, useState } from "react";
import { watchForExpiredSession } from "~/lib/api";
import { useSplitRoom } from "~/lib/useSplitRoom";
import { useAuthStore } from "~/stores/authStore";
import { usePresenceStore } from "~/stores/presenceStore";
import { type PaneIndex, toWorkspaceTabs, useTabsStore } from "~/stores/tabsStore";
import { useTerminalStore } from "~/stores/terminalStore";
import { useWorkspaceStore } from "~/stores/workspaceStore";
import ConnectionGate from "./ConnectionGate";
import FilesPage from "./files/FilesPage";
import Header from "./Header";
import PaneDivider from "./PaneDivider";
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
  if (saved.tabs.length > 0) tabs.restore(saved.tabs, saved.activeIds, saved.focusedPane);
}

/** Mirror tab changes back into the workspace file (the store debounces). */
function watchTabs(): () => void {
  const { saveTabs } = useWorkspaceStore.getState();
  let last = "";

  const push = () => {
    const { tabs, activeIds, focusedPane } = useTabsStore.getState();
    const payload = { tabs: toWorkspaceTabs(tabs), activeIds, focusedPane };
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

/** Both panes, in order, for the places that have to lay out each of them. */
const PANES: PaneIndex[] = [0, 1];
/** Column 2 is the divider, so the right pane is the third track. */
const COLUMN: Record<PaneIndex, number> = { 0: 1, 1: 3 };

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
  /** The app is behind a gate: visible, but nothing in it should be touched. */
  const tabs = useTabsStore((s) => s.tabs);
  const activeIds = useTabsStore((s) => s.activeIds);
  const focusedPane = useTabsStore((s) => s.focusedPane);
  const mergePanes = useTabsStore((s) => s.mergePanes);
  const panes = useWorkspaceStore((s) => s.panes);
  const splitFraction = useWorkspaceStore((s) => s.split);
  /**
   * Two panes only when they were asked for *and* there is room. A narrow
   * screen draws the focused pane alone and leaves every tab's pane
   * assignment alone, so turning the tablet back restores both columns with
   * everything where it was.
   */
  const hasRoom = useSplitRoom();
  const split = panes === 2 && hasRoom;

  // Leaving the split would otherwise strand the right pane's tabs in a column
  // that is no longer drawn. Narrowing the window must not: that is temporary,
  // and the switcher in Settings reaches the other pane while it lasts.
  useEffect(() => {
    if (panes === 1) mergePanes();
  }, [panes, mergePanes]);

  // Opening or closing the split halves or doubles a pane's width, and a
  // terminal in it measures itself in whole rows and columns — so it has to be
  // told. The divider handles its own drags; this is the on/off, which
  // includes the window crossing the width where two panes stop fitting.
  // biome-ignore lint/correctness/useExhaustiveDependencies: split is the trigger, not a value the effect reads
  useEffect(() => {
    const id = setTimeout(() => useTabsStore.getState().refitVisible(), 60);
    return () => clearTimeout(id);
  }, [split]);

  useEffect(() => {
    // Installed before anything fetches, so an expiry noticed by any request
    // shows the lock screen rather than a toast nobody can act on.
    watchForExpiredSession();
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

  const usable = socketConnected && sessionStatus === "ok";

  return (
    <div className="app-shell bg-app text-ink">
      <Toaster />
      <div
        className={`flex min-h-0 flex-1 flex-col transition-[filter,opacity] duration-200 ${
          usable ? "" : "pointer-events-none opacity-45 grayscale"
        }`}
        inert={!usable}
        aria-hidden={!usable}
      >
        <Header />

        {/*
          One grid for both panes, and every tab mounted in it exactly once.

          The pane a tab belongs to is a `gridColumn` on its wrapper, not a
          different parent — so handing a tab to the other pane is a style
          change on an element that stays put in the React tree. Two real
          containers would unmount the tab to move it, and an xterm instance
          outlives its DOM: it would come back as a dark empty pane. Columns
          also mean the single-pane case is the same tree with one column, so
          narrowing the window moves nothing.
        */}
        <div
          className="grid min-h-0 flex-1 overflow-hidden"
          style={{
            gridTemplateColumns: split ? `${splitFraction * 100}% 0px ${(1 - splitFraction) * 100}%` : "100%",
            gridTemplateRows: "auto minmax(0, 1fr) auto",
          }}
        >
          {PANES.map((pane) =>
            // The hidden pane's strip is left out rather than hidden: it holds
            // the + button, and a + that opens tabs into a column you cannot
            // see is a + that loses them.
            split || pane === focusedPane ? (
              <div key={`strip-${pane}`} style={{ gridColumn: COLUMN[pane], gridRow: 1 }} className="min-w-0">
                <TabBar pane={pane} split={split} />
              </div>
            ) : null,
          )}

          {split && <PaneDivider />}

          {tabs.length === 0 ? (
            <div
              style={{ gridColumn: "1 / -1", gridRow: 2 }}
              className="flex items-center justify-center text-sm text-ink-faint"
            >
              No tabs open
            </div>
          ) : (
            tabs.map((tab) => {
              const pane = split ? tab.pane : focusedPane;
              const showing = activeIds[tab.pane] === tab.id && (split || tab.pane === focusedPane);
              return (
                <div
                  key={tab.id}
                  className="flex min-h-0 min-w-0 flex-col"
                  style={{ gridColumn: COLUMN[pane], gridRow: 2, display: showing ? "flex" : "none" }}
                >
                  {(tab.kind === "terminal" || tab.kind === "tmux") && <TerminalPane sessionId={tab.id} />}
                  {tab.kind === "explorer" && <FilesPage sessionId={tab.id} />}
                  {tab.kind === "viewer" && tab.path && <ViewerPane tabId={tab.id} path={tab.path} />}
                </div>
              );
            })
          )}

          {/* One control surface per terminal or tmux tab, in its own pane's
              column, hidden unless that tab is the one showing. Sharing one
              bound to the active session carried the open drawer and the typed
              text across tabs, and could leave a tmux drawer open on a tab
              with no tmux session behind it. */}
          {tabs
            .filter((tab) => tab.kind === "terminal" || tab.kind === "tmux")
            .map((tab) => {
              const pane = split ? tab.pane : focusedPane;
              const showing = activeIds[tab.pane] === tab.id && (split || tab.pane === focusedPane);
              return (
                <div
                  key={tab.id}
                  style={{ gridColumn: COLUMN[pane], gridRow: 3, display: showing ? "block" : "none" }}
                  className="min-w-0"
                >
                  <InputBox sessionId={tab.id} />
                </div>
              );
            })}
        </div>
      </div>
      {/* Over the app, not instead of it. Returning a different tree here
          unmounted every terminal pane, and the xterm instances outlived it in
          the store — so coming back re-opened an already-opened terminal into a
          fresh element, which renders as a dark empty pane. A refresh looked
          like it fixed things because it threw those instances away and built
          new ones. Nothing is unmounted now, so there is nothing to re-open. */}
      {sessionStatus !== "ok" ? <SessionGate /> : !socketConnected && <ConnectionGate />}
    </div>
  );
}
