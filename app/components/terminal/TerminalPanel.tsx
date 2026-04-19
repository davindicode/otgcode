import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { useTerminalStore } from "~/stores/terminalStore";
import "@xterm/xterm/css/xterm.css";

export default function TerminalPanel({ sessionId }: { sessionId: string }) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const registerTerminal = useTerminalStore((s) => s.registerTerminal);
  const sendInput = useTerminalStore((s) => s.sendInput);
  const resizeTerminal = useTerminalStore((s) => s.resizeTerminal);
  const fontSize = useTerminalStore((s) => s.fontSize);

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
        theme: {
          background: "#1a1a2e",
          foreground: "#e0e0e0",
          cursor: "#e0e0e0",
          cursorAccent: "#1a1a2e",
          selectionBackground: "#264f78",
          black: "#1a1a2e",
          red: "#f44747",
          green: "#6a9955",
          yellow: "#dcdcaa",
          blue: "#569cd6",
          magenta: "#c586c0",
          cyan: "#4ec9b0",
          white: "#d4d4d4",
          brightBlack: "#808080",
          brightRed: "#f44747",
          brightGreen: "#6a9955",
          brightYellow: "#dcdcaa",
          brightBlue: "#569cd6",
          brightMagenta: "#c586c0",
          brightCyan: "#4ec9b0",
          brightWhite: "#ffffff",
        },
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
    <div className="absolute inset-0 bg-[#1a1a2e]">
      <div ref={terminalRef} className="h-full w-full" />
    </div>
  );
}
