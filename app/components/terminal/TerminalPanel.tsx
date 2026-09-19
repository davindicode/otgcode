import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { useTerminalStore } from "~/stores/terminalStore";
import { useWorkspaceStore } from "~/stores/workspaceStore";
import { xtermTheme } from "./xtermTheme";
import "@xterm/xterm/css/xterm.css";

export default function TerminalPanel({ sessionId }: { sessionId: string }) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const registerTerminal = useTerminalStore((s) => s.registerTerminal);
  const sendInput = useTerminalStore((s) => s.sendInput);
  const resizeTerminal = useTerminalStore((s) => s.resizeTerminal);
  const fontSize = useTerminalStore((s) => s.fontSize);
  const theme = useWorkspaceStore((s) => s.theme);

  // Terminals are created once and reused, so a theme swap has to be pushed
  // into the live instance rather than waiting for a remount.
  useEffect(() => {
    const term = useTerminalStore.getState().sessions[sessionId]?.terminal;
    if (!term) return;
    term.options.theme = xtermTheme(theme);
    // options.theme repaints the rows, but the viewport element keeps the
    // inline background it was constructed with — that leftover is the band
    // that shows above and below the rows after a theme switch.
    const viewport = term.element?.querySelector<HTMLElement>(".xterm-viewport");
    if (viewport) viewport.style.backgroundColor = "";
    term.refresh(0, term.rows - 1);
  }, [theme, sessionId]);

  useEffect(() => {
    const el = terminalRef.current;
    if (!el || initialized.current) return;

    // Check if this session already has a terminal in the store (re-attach)
    const session = useTerminalStore.getState().sessions[sessionId];
    if (session?.terminal) {
      initialized.current = true;
      el.innerHTML = "";
      session.terminal.open(el);
      setTimeout(() => {
        session.fitAddon?.fit();
        session.terminal!.refresh(0, session.terminal!.rows - 1);
      }, 50);
      return;
    }

    // Delay to ensure the container has dimensions after layout
    const timer = setTimeout(() => {
      if (initialized.current || !el) return;
      initialized.current = true;

      const term = new Terminal({
        cursorBlink: true,
        fontSize,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: xtermTheme(useWorkspaceStore.getState().theme),
        scrollback: 10000,
        allowProposedApi: true,
        wordSeparator: " ()[]{}',\"`",
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());

      term.open(el);

      // Fit after opening
      requestAnimationFrame(() => {
        fitAddon.fit();
        resizeTerminal(sessionId, term.rows, term.cols);
      });

      // Register with store — flushes buffered output
      registerTerminal(sessionId, term, fitAddon);

      // Wire up keyboard input from xterm to the pty
      term.onData((data) => {
        sendInput(sessionId, data);
      });

      // Re-fit on container resize (panel drag) and window resize
      const doFit = () => {
        fitAddon.fit();
        resizeTerminal(sessionId, term.rows, term.cols);
      };

      const ro = new ResizeObserver(() => doFit());
      ro.observe(el);
      window.addEventListener("resize", doFit);

      cleanupRef.current = () => {
        ro.disconnect();
        window.removeEventListener("resize", doFit);
      };
    }, 100);

    return () => {
      clearTimeout(timer);
      cleanupRef.current?.();
    };
  }, [sessionId]);

  return (
    <div className="absolute inset-0 bg-raised">
      <div ref={terminalRef} className="h-full w-full" />
    </div>
  );
}
