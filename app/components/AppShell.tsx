import { useEffect, useState } from "react";
import { useUiStore } from "~/stores/uiStore";
import BrowserPage from "./browser/BrowserPage";
import FilesPage from "./files/FilesPage";
import Header from "./Header";
import MobileTabBar from "./MobileTabBar";
import ResizablePanels from "./ResizablePanels";
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

export default function AppShell() {
  const activeTab = useUiStore((s) => s.activeTab);
  const isDesktop = useIsDesktop();

  return (
    <div className="app-shell bg-[#0d0d1a] text-white">
      <Header />

      {isDesktop ? (
        /* Desktop: 3-column resizable panels */
        <div className="flex flex-1 overflow-hidden min-h-0">
          <ResizablePanels
            left={<FilesPage />}
            center={
              <div className="flex flex-col h-full min-h-0 min-w-0 w-full">
                <TerminalPage />
                <InputBox />
              </div>
            }
            right={<BrowserPage />}
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
            <div className="flex-1 flex flex-col min-h-0" style={{ display: activeTab === "files" ? "flex" : "none" }}>
              <FilesPage />
            </div>
            <div
              className="flex-1 flex flex-col min-h-0"
              style={{ display: activeTab === "browser" ? "flex" : "none" }}
            >
              <BrowserPage />
            </div>
          </div>
          <MobileTabBar />
        </>
      )}
    </div>
  );
}
