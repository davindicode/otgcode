import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTerminalStore } from "~/stores/terminalStore";

interface QuickKey {
  label: string;
  key: string;
  title: string;
}

interface QuickKeyGroup {
  label: string;
  title: string;
  keys: QuickKey[];
}

const TERMINAL_GROUPS: QuickKeyGroup[] = [
  {
    label: "cmds",
    title: "Common commands (executed immediately)",
    keys: [
      { label: "ls", key: "ls\n", title: "List files" },
      { label: "ls -la", key: "ls -la\n", title: "List all files detailed" },
      { label: "pwd", key: "pwd\n", title: "Print working directory" },
      { label: "top", key: "top\n", title: "Process monitor" },
      { label: "htop", key: "htop\n", title: "Interactive process monitor" },
      { label: "df -h", key: "df -h\n", title: "Disk usage" },
      { label: "free -h", key: "free -h\n", title: "Memory usage" },
      { label: "nvidia-smi", key: "nvidia-smi\n", title: "GPU status" },
      { label: "lscpu", key: "lscpu\n", title: "CPU info" },
      { label: "whoami", key: "whoami\n", title: "Current user" },
      { label: "uptime", key: "uptime\n", title: "System uptime" },
    ],
  },
];

// Always-visible nav keys (shown below text input)
const NAV_KEYS: QuickKey[] = [
  { label: "Enter", key: "\r", title: "Enter / Confirm" },
  { label: "Bksp", key: "\x7f", title: "Backspace" },
  { label: "\u2191", key: "\x1b[A", title: "Up / Previous command" },
  { label: "\u2193", key: "\x1b[B", title: "Down / Next command" },
  { label: "\u2190", key: "\x1b[D", title: "Cursor left" },
  { label: "\u2192", key: "\x1b[C", title: "Cursor right" },
];

// Less common nav keys (shown after NAV_KEYS)
const NAV_TAIL: QuickKey[] = [
  { label: "Esc", key: "\x1b", title: "Escape" },
  { label: "Tab", key: "\t", title: "Autocomplete" },
  { label: "PgUp", key: "\x1b[5~", title: "Page up" },
  { label: "PgDn", key: "\x1b[6~", title: "Page down" },
  { label: "y", key: "y", title: "Yes — approve / confirm (tmux kill-pane, Claude prompts, etc.)" },
  { label: "n", key: "n", title: "No — deny / decline" },
];

const NANO_KEYS: QuickKey[] = [
  { label: "Ctrl+O save", key: "\x0f", title: "Write out (save)" },
  { label: "Ctrl+W search", key: "\x17", title: "Search" },
  { label: "Ctrl+K cut", key: "\x0b", title: "Cut line" },
  { label: "Ctrl+U paste", key: "\x15", title: "Paste" },
  { label: "Ctrl+G help", key: "\x07", title: "Help" },
  { label: "Ctrl+\\ replace", key: "\x1c", title: "Search & replace" },
  { label: "Ctrl+C pos", key: "\x03", title: "Show cursor position" },
  { label: "Ctrl+_ goto", key: "\x1f", title: "Go to line number" },
];

const VIM_KEYS: QuickKey[] = [
  { label: ":w", key: ":w\n", title: "Write (save)" },
  { label: ":q", key: ":q\n", title: "Quit" },
  { label: ":wq", key: ":wq\n", title: "Write & quit" },
  { label: ":q!", key: ":q!\n", title: "Force quit" },
  { label: "Esc", key: "\x1b", title: "Normal mode" },
  { label: "i", key: "i", title: "Insert mode" },
  { label: "a", key: "a", title: "Append" },
  { label: "o", key: "o", title: "Open line below" },
  { label: "dd", key: "dd", title: "Delete line" },
  { label: "yy", key: "yy", title: "Yank line" },
  { label: "p", key: "p", title: "Paste" },
  { label: "u", key: "u", title: "Undo" },
  { label: "Ctrl+R", key: "\x12", title: "Redo" },
  { label: "/", key: "/", title: "Search" },
  { label: "n", key: "n", title: "Next match" },
  { label: "gg", key: "gg", title: "Go to top" },
  { label: "G", key: "G", title: "Go to bottom" },
];

const TMUX_KEYS: QuickKey[] = [
  { label: "c new", key: "\x02c", title: "New window" },
  { label: "n next", key: "\x02n", title: "Next window" },
  { label: "p prev", key: "\x02p", title: "Previous window" },
  { label: "0", key: "\x020", title: "Window 0" },
  { label: "1", key: "\x021", title: "Window 1" },
  { label: "2", key: "\x022", title: "Window 2" },
  { label: "3", key: "\x023", title: "Window 3" },
  { label: "4", key: "\x024", title: "Window 4" },
  { label: "5", key: "\x025", title: "Window 5" },
  { label: "\" hsplit", key: "\x02\"", title: "Split horizontal" },
  { label: "% vsplit", key: "\x02%", title: "Split vertical" },
  { label: "o pane", key: "\x02o", title: "Next pane" },
  { label: "x kill", key: "\x02x", title: "Kill pane" },
  { label: "z zoom", key: "\x02z", title: "Toggle zoom pane" },
  { label: "[ scroll", key: "\x02[", title: "Scroll/copy mode (Esc to exit)" },
  { label: "] paste", key: "\x02]", title: "Paste from tmux buffer" },
  { label: ", rename", key: "\x02,", title: "Rename window" },
  { label: "w list", key: "\x02w", title: "List windows" },
  { label: "s sessions", key: "\x02s", title: "List sessions" },
  { label: ": cmd", key: "\x02:", title: "Command prompt" },
];

// Common key combos shared across all coding CLIs
// (y/n live in NAV_TAIL — always-visible below the input — since they're also
// useful for tmux confirms and other action contexts.)
const CODE_COMMON_KEYS: QuickKey[] = [
  { label: "Ctrl+C", key: "\x03", title: "Cancel / interrupt / quit" },
  { label: "Ctrl+L", key: "\x0c", title: "Clear screen (Claude/Codex) / View logs (OpenCode)" },
  { label: "Ctrl+G", key: "\x07", title: "Open external editor (Claude/Codex)" },
  { label: "Esc Esc", key: "\x1b\x1b", title: "Rewind history (Claude) / Edit prev message (Codex)" },
];

// Per-vendor CLI groups: launch commands, keys, and slash commands
interface CliVendor {
  name: string;
  keys: QuickKey[];
  launch: { label: string; title: string; command: string }[];
  slashCmds: { label: string; title: string; command: string }[];
}

const CLI_VENDORS: CliVendor[] = [
  {
    name: "claude",
    keys: [
      { label: "Shift+Tab", key: "\x1b[Z", title: "Cycle permission modes" },
      { label: "Ctrl+O", key: "\x0f", title: "Toggle full transcript view" },
      { label: "Ctrl+R", key: "\x12", title: "Reverse history search" },
      { label: "Alt+T", key: "\x1bt", title: "Toggle extended thinking" },
      { label: "Alt+P", key: "\x1bp", title: "Model picker" },
    ],
    launch: [
      { label: "claude", title: "Interactive mode", command: "claude\n" },
      { label: "yolo", title: "Skip all permission checks", command: "claude --dangerously-skip-permissions\n" },
      { label: "plan", title: "Read-only plan mode", command: "claude --allowedTools Read,Glob,Grep,WebSearch,WebFetch\n" },
    ],
    slashCmds: [
      { label: "/clear", title: "Clear conversation context", command: "/clear\n" },
      { label: "/compact", title: "Compact conversation to save context", command: "/compact\n" },
      { label: "/cost", title: "Show token usage and cost", command: "/cost\n" },
      { label: "/help", title: "Show available commands", command: "/help\n" },
      { label: "/model", title: "Show or switch model", command: "/model\n" },
      { label: "/exit", title: "Exit Claude Code", command: "/exit\n" },
      { label: "/config", title: "Open config", command: "/config\n" },
      { label: "/memory", title: "Edit CLAUDE.md memory", command: "/memory\n" },
      { label: "/review", title: "Review a PR", command: "/review\n" },
      { label: "/vim", title: "Toggle vim mode", command: "/vim\n" },
    ],
  },
  {
    name: "codex",
    keys: [
      { label: "Shift+Tab", key: "\x1b[Z", title: "Cycle approval modes" },
      { label: "Ctrl+O", key: "\x0f", title: "Choose environment (cloud)" },
    ],
    launch: [
      { label: "suggest", title: "Proposes changes for approval", command: "codex --approval-mode suggest\n" },
      { label: "auto-edit", title: "Applies file changes, asks for commands", command: "codex --approval-mode auto-edit\n" },
      { label: "full-auto", title: "Runs without confirmation", command: "codex --approval-mode full-auto\n" },
    ],
    slashCmds: [
      { label: "/help", title: "Show available commands", command: "/help\n" },
      { label: "/model", title: "Show or switch model", command: "/model\n" },
      { label: "/exit", title: "Exit Codex", command: "/exit\n" },
      { label: "/clear", title: "Clear conversation", command: "/clear\n" },
      { label: "/approval", title: "Change approval mode", command: "/approval\n" },
    ],
  },
  {
    name: "opencode",
    keys: [
      { label: "Ctrl+O", key: "\x0f", title: "Model selection dialog" },
      { label: "Ctrl+K", key: "\x0b", title: "Command dialog" },
      { label: "Ctrl+N", key: "\x0e", title: "New session" },
      { label: "Ctrl+X", key: "\x18", title: "Cancel generation" },
      { label: "Ctrl+S", key: "\x13", title: "Send message" },
      { label: "Ctrl+A", key: "\x01", title: "Switch session" },
    ],
    launch: [
      { label: "opencode", title: "Interactive mode", command: "opencode\n" },
    ],
    slashCmds: [
      { label: "/help", title: "Show available commands", command: "/help\n" },
      { label: "/exit", title: "Exit OpenCode", command: "/exit\n" },
      { label: "/clear", title: "Clear conversation", command: "/clear\n" },
      { label: "/compact", title: "Compact context", command: "/compact\n" },
    ],
  },
];

// Git quick action commands
const GIT_QUICK_CMDS: { label: string; title: string; command: string }[] = [
  { label: "status", title: "git status", command: "git status\n" },
  { label: "log", title: "git log --oneline -10", command: "git log --oneline -10\n" },
  { label: "diff", title: "git diff", command: "git diff\n" },
  { label: "add .", title: "git add . (stage all)", command: "git add .\n" },
  { label: "fetch", title: "git fetch", command: "git fetch\n" },
  { label: "pull", title: "git pull", command: "git pull\n" },
  { label: "push", title: "git push", command: "git push\n" },
  { label: "stash", title: "git stash", command: "git stash\n" },
  { label: "stash pop", title: "git stash pop", command: "git stash pop\n" },
  { label: "branch", title: "git branch (list branches)", command: "git branch\n" },
];

// Tab IDs
const STICKY_TAB = "__sticky__";
const TMUX_TAB = "__tmux__";
const NANO_TAB = "__nano__";
const VIM_TAB = "__vim__";
const CODE_TAB = "__code__";
const GIT_TAB = "__git__";
const CD_TAB = "__cd__";

type StickyMode = "ctrl" | "ctrl+shift" | "alt" | "alt+shift";

const STICKY_MODES: { id: StickyMode; label: string }[] = [
  { id: "ctrl", label: "Ctrl+" },
  { id: "ctrl+shift", label: "Ctrl+Shift+" },
  { id: "alt", label: "Alt+" },
  { id: "alt+shift", label: "Alt+Shift+" },
];

function getStickyKey(ch: string, mode: StickyMode): string {
  const isLetter = ch >= "A" && ch <= "Z";
  switch (mode) {
    case "ctrl":
      // Ctrl+Letter = control code, Ctrl+Digit = send via CSI u
      return isLetter
        ? String.fromCharCode(ch.charCodeAt(0) - 64)
        : `\x1b[${ch.charCodeAt(0)};5u`;
    case "ctrl+shift":
      return `\x1b[${ch.charCodeAt(0)};6u`;
    case "alt":
      return `\x1b${isLetter ? ch.toLowerCase() : ch}`;
    case "alt+shift":
      return `\x1b${ch}`;
  }
}

interface TmuxSession {
  name: string;
  windows: number;
  attached: boolean;
}

export default function InputBox() {
  const [text, setText] = useState("");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [tmuxSessions, setTmuxSessions] = useState<TmuxSession[]>([]);
  const [tmuxLoading, setTmuxLoading] = useState(false);
  const [toolVersions, setToolVersions] = useState<{ tmux: string | null; nano: string | null; vim: string | null; claude: string | null; codex: string | null; opencode: string | null }>({ tmux: null, nano: null, vim: null, claude: null, codex: null, opencode: null });
  const toolVersionsFetched = useRef(false);
  const [tmuxNewName, setTmuxNewName] = useState("");
  const [editorFileName, setEditorFileName] = useState("");
  const [cdDirs, setCdDirs] = useState<string[]>([]);
  const [cdLoading, setCdLoading] = useState(false);
  const [stickyMode, setStickyMode] = useState<StickyMode>("ctrl");
  const [codeVendorIdx, setCodeVendorIdx] = useState(0);
  const [codeVendorOpen, setCodeVendorOpen] = useState(false);
  const codeVendorBtnRef = useRef<HTMLButtonElement>(null);
  const codeVendorMenuRef = useRef<HTMLDivElement>(null);
  const [gitCommitMsg, setGitCommitMsg] = useState("");
  const [gitConfigName, setGitConfigName] = useState("");
  const [gitConfigEmail, setGitConfigEmail] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const sendInput = useTerminalStore((s) => s.sendInput);
  const setInTmux = useTerminalStore((s) => s.setInTmux);
  const setInEditor = useTerminalStore((s) => s.setInEditor);
  const setCdCwd = useTerminalStore((s) => s.setCdCwd);
  const sessions = useTerminalStore((s) => s.sessions);

  // Close vendor dropdown on outside click
  useEffect(() => {
    if (!codeVendorOpen) return;
    const handler = (e: MouseEvent) => {
      if (codeVendorBtnRef.current?.contains(e.target as Node)) return;
      if (codeVendorMenuRef.current?.contains(e.target as Node)) return;
      setCodeVendorOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [codeVendorOpen]);

  const activeSession = activeSessionId ? sessions[activeSessionId] : null;
  const inTmux = activeSession?.inTmux ?? false;
  const inEditor = activeSession?.inEditor ?? null;
  const cdCwd = activeSession?.cdCwd ?? "";

  // --- Handlers ---
  const handleSend = () => {
    if (!activeSessionId || !text) return;
    sendInput(activeSessionId, text + "\n");
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    textareaRef.current?.focus();
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  };

  const handleQuickKey = useCallback((key: string) => {
    if (!activeSessionId) return;
    if (key.length === 2 && key.charCodeAt(0) < 0x20 && key.charCodeAt(1) >= 0x20) {
      sendInput(activeSessionId, key[0]);
      setTimeout(() => sendInput(activeSessionId, key[1]), 50);
    } else {
      sendInput(activeSessionId, key);
    }
  }, [activeSessionId, sendInput]);

  // Long-press repeat with scroll detection
  const repeatRef = useRef<{
    timeout: ReturnType<typeof setTimeout>;
    interval: ReturnType<typeof setInterval>;
    fired: boolean;
    startX: number;
    startY: number;
  } | null>(null);

  const startRepeat = useCallback((key: string, x: number, y: number) => {
    const timeout = setTimeout(() => {
      if (!repeatRef.current) return;
      repeatRef.current.fired = true;
      handleQuickKey(key);
      const interval = setInterval(() => handleQuickKey(key), 80);
      if (repeatRef.current) repeatRef.current.interval = interval;
    }, 120);
    repeatRef.current = { timeout, interval: null as any, fired: false, startX: x, startY: y };
  }, [handleQuickKey]);

  const cancelRepeat = useCallback(() => {
    if (repeatRef.current) {
      clearTimeout(repeatRef.current.timeout);
      clearInterval(repeatRef.current.interval);
      repeatRef.current = null;
    }
  }, []);

  const finishRepeat = useCallback((key: string) => {
    if (repeatRef.current && !repeatRef.current.fired) handleQuickKey(key);
    cancelRepeat();
  }, [handleQuickKey, cancelRepeat]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!repeatRef.current) return;
    if (Math.abs(e.clientX - repeatRef.current.startX) > 10 || Math.abs(e.clientY - repeatRef.current.startY) > 10) {
      cancelRepeat();
    }
  }, [cancelRepeat]);

  const repeatProps = (key: string) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); startRepeat(key, e.clientX, e.clientY); },
    onPointerMove: handlePointerMove,
    onPointerUp: () => finishRepeat(key),
    onPointerLeave: cancelRepeat,
    onPointerCancel: cancelRepeat,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  // Fetch tool versions (re-fetch each time a tool tab is opened to catch new installs)
  const fetchToolVersions = async () => {
    try {
      const res = await fetch("/api/tool-versions");
      const data = await res.json();
      setToolVersions(data);
    } catch {}
  };

  // Initial fetch
  useEffect(() => {
    if (toolVersionsFetched.current) return;
    toolVersionsFetched.current = true;
    fetchToolVersions();
  }, []);

  // When the active terminal tab changes while the cd picker is open, resync
  // to that terminal's current cwd (the cd panel is per-terminal stateful).
  useEffect(() => {
    if (activeGroup !== CD_TAB) return;
    setCdDirs([]);
    if (activeSessionId) fetchDirs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  const toggleGroup = (id: string) => {
    if (activeGroup === id) {
      setActiveGroup(null);
    } else {
      setActiveGroup(id);
      if (id === TMUX_TAB && !inTmux) fetchTmuxSessions();
      if (id === CD_TAB) fetchDirs();
      if ([TMUX_TAB, NANO_TAB, VIM_TAB, CODE_TAB].includes(id)) fetchToolVersions();
    }
  };

  // Tmux
  const fetchTmuxSessions = async () => {
    setTmuxLoading(true);
    try {
      const res = await fetch("/api/tmux/sessions");
      const data = await res.json();
      setTmuxSessions(data.sessions || []);
    } catch { setTmuxSessions([]); }
    setTmuxLoading(false);
  };

  const handleTmuxAttach = (name: string) => {
    if (!activeSessionId) return;
    // Set extended-keys off inline via shell command to avoid visible tmux prompt flicker
    sendInput(activeSessionId, `tmux set -g extended-keys off 2>/dev/null; tmux attach -t ${name}\n`);
    setInTmux(activeSessionId, true);
    setActiveGroup(null);
  };

  const handleTmuxNew = () => {
    if (!activeSessionId || !tmuxNewName.trim()) return;
    sendInput(activeSessionId, `tmux set -g extended-keys off 2>/dev/null; tmux new -s ${tmuxNewName.trim()}\n`);
    setTmuxNewName("");
    setInTmux(activeSessionId, true);
    setActiveGroup(null);
  };

  const handleTmuxDetach = () => {
    if (!activeSessionId) return;
    sendInput(activeSessionId, "\x02");
    setTimeout(() => {
      sendInput(activeSessionId, "d");
      setInTmux(activeSessionId, false);
      setActiveGroup(null);
    }, 50);
  };

  // cd directory picker — always scoped to the currently-active terminal session
  const fetchDirs = async (dir?: string) => {
    const sessionId = activeSessionId;
    if (!sessionId) return;
    setCdLoading(true);
    try {
      // If no dir specified, detect this terminal's actual CWD first
      let targetDir = dir;
      if (!targetDir) {
        try {
          const cwdRes = await fetch(`/api/terminal/cwd?sessionId=${sessionId}&inTmux=${inTmux}`);
          const cwdData = await cwdRes.json();
          if (cwdData.cwd) targetDir = cwdData.cwd;
        } catch {}
      }
      const query = targetDir ? `?dir=${encodeURIComponent(targetDir)}&showHidden=false` : "?showHidden=false";
      const res = await fetch(`/api/files/list${query}`);
      const data = await res.json();
      if (!data.error) {
        // Only apply the result if the user hasn't switched to a different tab while we were fetching
        if (useTerminalStore.getState().activeSessionId === sessionId) {
          setCdCwd(sessionId, data.dir);
          setCdDirs(
            (data.entries || [])
              .filter((e: { isDirectory: boolean }) => e.isDirectory)
              .map((e: { name: string }) => e.name)
          );
        }
      }
    } catch { setCdDirs([]); }
    setCdLoading(false);
  };

  const handleCdTo = (dir: string) => {
    if (!activeSessionId) return;
    const absPath = dir === ".." ? cdCwd.replace(/\/[^/]+$/, "") || "/" : `${cdCwd}/${dir}`;
    sendInput(activeSessionId, `cd '${absPath}'\n`);
    fetchDirs(absPath);
  };

  const handleCdHome = () => {
    if (!activeSessionId) return;
    sendInput(activeSessionId, "cd ~\n");
    fetchDirs(); // No dir param = defaults to HOME
  };

  // Editors
  const handleOpenEditor = (editor: "nano" | "vim") => {
    if (!activeSessionId || !editorFileName.trim()) return;
    sendInput(activeSessionId, `${editor} ${editorFileName.trim()}\n`);
    setEditorFileName("");
    setInEditor(activeSessionId, editor);
    setActiveGroup(editor === "nano" ? NANO_TAB : VIM_TAB);
  };

  const handleExitNano = () => {
    if (!activeSessionId) return;
    sendInput(activeSessionId, "\x18");
    setInEditor(activeSessionId, null);
    setActiveGroup(null);
  };

  const handleExitVim = () => {
    if (!activeSessionId) return;
    sendInput(activeSessionId, "\x1b");
    setTimeout(() => {
      sendInput(activeSessionId, ":q!\n");
      setInEditor(activeSessionId, null);
      setActiveGroup(null);
    }, 50);
  };

  const handleSaveExitVim = () => {
    if (!activeSessionId) return;
    sendInput(activeSessionId, "\x1b");
    setTimeout(() => {
      sendInput(activeSessionId, ":wq\n");
      setInEditor(activeSessionId, null);
      setActiveGroup(null);
    }, 50);
  };

  // --- Styles ---
  const tabBase = "px-2.5 py-0.5 text-[11px] rounded border whitespace-nowrap transition-colors shrink-0 select-none touch-manipulation";
  const tabDisabledAction = `${tabBase} bg-[#151520] text-gray-600 border-gray-700/50 cursor-not-allowed`;
  const tabDisabledApp = `${tabBase} bg-[#151520] text-gray-600 border-gray-700/50 cursor-not-allowed`;
  // Action tabs (cmds, cd, code, sticky) — blue
  const actionTabOff = `${tabBase} bg-[#1a1e2e] text-blue-400 hover:text-blue-200 hover:bg-[#1a2a3e] border-blue-800`;
  const actionTabOn = `${tabBase} bg-[#1a2a3e] text-blue-200 border-blue-500`;
  // App tabs (nano, vim, tmux) — green
  const appTabOff = `${tabBase} bg-[#1a2e1e] text-green-400 hover:text-green-200 hover:bg-[#1a3e2a] border-green-800`;
  const appTabOn = `${tabBase} bg-[#1a3e2a] text-green-200 border-green-500`;

  // Popup action buttons: neutral gray
  const keyBtn = "px-2 py-0.5 text-[11px] bg-[#1a1a2e] text-gray-400 hover:text-white hover:bg-[#2a2a4a] disabled:text-gray-600 rounded border border-gray-700 whitespace-nowrap transition-colors select-none touch-manipulation";
  const exitBtn = "px-2 py-0.5 text-[11px] bg-[#1a1a2e] text-red-400 hover:text-red-300 hover:bg-[#2a2a4a] disabled:text-gray-600 rounded border border-red-800 whitespace-nowrap transition-colors select-none touch-manipulation";
  const saveExitBtn = "px-2 py-0.5 text-[11px] bg-[#1a1a2e] text-green-400 hover:text-green-300 hover:bg-[#2a2a4a] disabled:text-gray-600 rounded border border-green-800 whitespace-nowrap transition-colors select-none touch-manipulation";

  // --- Determine which tabs to show ---
  // Editor mode (nano/vim): only editor tab + sticky (+ tmux if in tmux)
  // Tmux mode: all action tabs + tmux tab (no nano/vim — can't track state inside tmux)
  // Plain terminal: all action tabs + all app tabs
  const isEditorMode = inEditor !== null;

  const tabBtn = (id: string, label: string, title: string, disabled?: boolean, kind: "action" | "app" = "action") => (
    <button
      key={id}
      onClick={() => !disabled && toggleGroup(id)}
      disabled={disabled}
      title={title}
      className={disabled
        ? (kind === "app" ? tabDisabledApp : tabDisabledAction)
        : activeGroup === id
          ? (kind === "app" ? appTabOn : actionTabOn)
          : (kind === "app" ? appTabOff : actionTabOff)}
    >
      {label}
    </button>
  );

  // Resolve which key group to show in the popup
  const activeStandardGroup = activeGroup && ![STICKY_TAB, TMUX_TAB, NANO_TAB, VIM_TAB, CODE_TAB, GIT_TAB, CD_TAB].includes(activeGroup)
    ? TERMINAL_GROUPS.find((g) => g.label === activeGroup)
    : null;

  return (
    <div className="bg-[#16162a] border-t border-gray-700 shrink-0 overflow-hidden terminal-focus-area rounded-sm" style={{ minWidth: 0 }}>
      {/* Tab bar */}
      <div className="border-b border-gray-700/50 overflow-x-auto scrollbar-none" style={{ minWidth: 0 }}>
        <div className="flex items-center gap-1 px-2 py-1 w-max">
          {/* Action tabs (blue) — always in same order, hidden in editor mode */}
          {!isEditorMode && TERMINAL_GROUPS.map((g) => tabBtn(g.label, g.label, g.title, !activeSessionId))}
          {!isEditorMode && tabBtn(CD_TAB, "cd", "Change directory", !activeSessionId)}
          {tabBtn(STICKY_TAB, STICKY_MODES.find((m) => m.id === stickyMode)?.label || "Ctrl+", "Modifier combos")}
          {!isEditorMode && tabBtn(CODE_TAB, "code", "Coding CLI launchers & keys", !activeSessionId)}
          {!isEditorMode && tabBtn(GIT_TAB, "git", "Git actions", !activeSessionId)}
          {/* App tabs (green) — nano/vim hidden in tmux mode, shown with active indicator in editor mode */}
          {!inTmux && tabBtn(NANO_TAB, inEditor === "nano" ? "nano \u2318" : "nano", inEditor === "nano" ? "nano commands" : "Open file in nano", !activeSessionId && inEditor !== "nano", "app")}
          {!inTmux && tabBtn(VIM_TAB, inEditor === "vim" ? "vim \u2318" : "vim", inEditor === "vim" ? "vim commands" : "Open file in vim", !activeSessionId && inEditor !== "vim", "app")}
          {tabBtn(TMUX_TAB, inTmux ? "tmux \u2318" : "tmux", inTmux ? "tmux commands" : "tmux sessions", !activeSessionId && !inTmux, "app")}
        </div>
      </div>

      {/* Standard key group popup (cmds) */}
      {activeStandardGroup && (
        <div className="border-b border-gray-700/50 bg-[#12122a] px-2 py-1.5">
          <div className="flex flex-wrap gap-1">
            {activeStandardGroup.keys.map((qk) => (
              <button key={qk.label} {...repeatProps(qk.key)} disabled={!activeSessionId} title={qk.title} className={keyBtn}>
                {qk.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* cd directory picker */}
      {activeGroup === CD_TAB && (
        <div className="border-b border-gray-700/50 bg-[#12122a] px-2 py-1.5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[11px] text-gray-500">cd</span>
            <span className="text-[10px] text-gray-600 overflow-hidden text-ellipsis whitespace-nowrap flex-1" title={cdCwd}>{cdCwd}</span>
          </div>
          {cdLoading ? (
            <span className="text-[11px] text-gray-500">Loading...</span>
          ) : (
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              <button
                onClick={() => handleCdTo("..")}
                disabled={!activeSessionId}
                className={`${keyBtn} text-yellow-400 hover:text-yellow-300`}
                title="Go up one directory"
              >
                ..
              </button>
              <button
                onClick={handleCdHome}
                disabled={!activeSessionId}
                className={`${keyBtn} text-blue-400 hover:text-blue-300`}
                title="Go to home directory"
              >
                ~
              </button>
              {cdDirs.map((dir) => (
                <button
                  key={dir}
                  onClick={() => handleCdTo(dir)}
                  disabled={!activeSessionId}
                  className="px-2 py-0.5 text-[11px] bg-[#1a1e2e] text-purple-400 hover:text-purple-200 hover:bg-[#2a2e4a] disabled:text-gray-600 rounded border border-purple-800/50 whitespace-nowrap transition-colors select-none touch-manipulation"
                  title={`cd ${dir}`}
                >
                  {dir}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sticky modifier popup */}
      {activeGroup === STICKY_TAB && (
        <div className="border-b border-gray-700/50 bg-[#12122a] px-2 py-1.5">
          <div className="flex items-center gap-1 mb-1.5">
            {STICKY_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setStickyMode(m.id)}
                className={`px-2 py-0.5 text-[10px] rounded border transition-colors select-none ${
                  stickyMode === m.id
                    ? "bg-blue-600 text-white border-blue-500"
                    : "bg-[#1a1a2e] text-gray-500 hover:text-white border-gray-700"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {"0123456789".split("").map((ch) => (
              <button
                key={ch}
                {...repeatProps(getStickyKey(ch, stickyMode))}
                disabled={!activeSessionId}
                title={`${STICKY_MODES.find((m) => m.id === stickyMode)?.label}${ch}`}
                className={keyBtn}
              >
                {ch}
              </button>
            ))}
            {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((ch) => (
              <button
                key={ch}
                {...repeatProps(getStickyKey(ch, stickyMode))}
                disabled={!activeSessionId}
                title={`${STICKY_MODES.find((m) => m.id === stickyMode)?.label}${ch}`}
                className={keyBtn}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nano popup: commands when inside, file opener when outside */}
      {activeGroup === NANO_TAB && inEditor === "nano" && (
        <div className="border-b border-gray-700/50 bg-[#12122a] px-2 py-1.5">
          <div className="flex flex-wrap gap-1">
            {NANO_KEYS.map((qk) => (
              <button key={qk.label} {...repeatProps(qk.key)} disabled={!activeSessionId} title={qk.title} className={keyBtn}>
                {qk.label}
              </button>
            ))}
            <button onClick={handleExitNano} disabled={!activeSessionId} title="Exit nano (Ctrl+X)" className={exitBtn}>
              exit
            </button>
          </div>
        </div>
      )}
      {activeGroup === NANO_TAB && inEditor !== "nano" && (
        <div className="border-b border-gray-700/50 bg-[#12122a] px-3 py-2">
          {!toolVersions.nano ? (
            <span className="text-[11px] text-yellow-400">nano is not installed. Install it via your package manager.</span>
          ) : (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500">nano{toolVersions.nano ? ` v${toolVersions.nano}` : ""}</span>
            <input
              value={editorFileName}
              onChange={(e) => setEditorFileName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleOpenEditor("nano")}
              placeholder="filename or path..."
              className="flex-1 bg-[#1a1a2e] text-white border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={() => handleOpenEditor("nano")}
              disabled={!editorFileName.trim() || !activeSessionId}
              className="px-2 py-1 text-[11px] bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
            >
              Open
            </button>
          </div>
          )}
        </div>
      )}

      {/* Vim popup: commands when inside, file opener when outside */}
      {activeGroup === VIM_TAB && inEditor === "vim" && (
        <div className="border-b border-gray-700/50 bg-[#12122a] px-2 py-1.5">
          <div className="flex flex-wrap gap-1">
            {VIM_KEYS.map((qk) => (
              <button key={qk.label} {...repeatProps(qk.key)} disabled={!activeSessionId} title={qk.title} className={keyBtn}>
                {qk.label}
              </button>
            ))}
            <button onClick={handleSaveExitVim} disabled={!activeSessionId} title="Save and exit (:wq)" className={saveExitBtn}>
              save+exit
            </button>
            <button onClick={handleExitVim} disabled={!activeSessionId} title="Force quit (:q!)" className={exitBtn}>
              quit
            </button>
          </div>
        </div>
      )}
      {activeGroup === VIM_TAB && inEditor !== "vim" && (
        <div className="border-b border-gray-700/50 bg-[#12122a] px-3 py-2">
          {!toolVersions.vim ? (
            <span className="text-[11px] text-yellow-400">vim is not installed. Install it via your package manager.</span>
          ) : (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500">vim v{toolVersions.vim}</span>
            <input
              value={editorFileName}
              onChange={(e) => setEditorFileName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleOpenEditor("vim")}
              placeholder="filename or path..."
              className="flex-1 bg-[#1a1a2e] text-white border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={() => handleOpenEditor("vim")}
              disabled={!editorFileName.trim() || !activeSessionId}
              className="px-2 py-1 text-[11px] bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
            >
              Open
            </button>
          </div>
          )}
        </div>
      )}

      {/* Tmux popup: commands when inside, sessions when outside */}
      {activeGroup === TMUX_TAB && inTmux && (
        <div className="border-b border-gray-700/50 bg-[#12122a] px-2 py-1.5">
          <div className="flex flex-wrap gap-1">
            {TMUX_KEYS.map((qk) => (
              <button key={qk.label} {...repeatProps(qk.key)} disabled={!activeSessionId} title={qk.title} className={keyBtn}>
                {qk.label}
              </button>
            ))}
            <button onClick={handleTmuxDetach} disabled={!activeSessionId} title="Detach from tmux" className={exitBtn}>
              detach
            </button>
          </div>
        </div>
      )}
      {activeGroup === TMUX_TAB && !inTmux && (
        <div className="border-b border-gray-700/50 bg-[#12122a] px-3 py-2">
          {!toolVersions.tmux ? (
            <span className="text-[11px] text-yellow-400">tmux is not installed. Install it via your package manager.</span>
          ) : (<>
          <span className="text-[10px] text-gray-600 float-right">v{toolVersions.tmux}</span>
          {tmuxLoading ? (
            <span className="text-[11px] text-gray-500">Loading...</span>
          ) : tmuxSessions.length === 0 ? (
            <span className="text-[11px] text-gray-500">No tmux sessions running</span>
          ) : (
            <div className="flex flex-col gap-1 mb-2">
              {tmuxSessions.map((s) => (
                <div key={s.name} className="flex items-center gap-2">
                  <button
                    onClick={() => handleTmuxAttach(s.name)}
                    className="flex-1 text-left px-2 py-1 text-[11px] bg-[#1a1a2e] text-gray-300 hover:text-white hover:bg-[#2a2a4a] rounded border border-gray-700 transition-colors"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-gray-500 ml-2">{s.windows}w</span>
                    {s.attached && <span className="text-green-500 ml-1">(attached)</span>}
                  </button>
                  <button
                    onClick={() => {
                      if (!activeSessionId) return;
                      sendInput(activeSessionId, `tmux kill-session -t ${s.name}\n`);
                      setTimeout(fetchTmuxSessions, 500);
                    }}
                    className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                    title={`Kill session ${s.name}`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            <input
              value={tmuxNewName}
              onChange={(e) => setTmuxNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTmuxNew()}
              placeholder="New session name..."
              className="flex-1 bg-[#1a1a2e] text-white border border-gray-700 rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleTmuxNew}
              disabled={!tmuxNewName.trim() || !activeSessionId}
              className="px-2 py-1 text-[11px] bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
            >
              Create
            </button>
          </div>
          </>)}
        </div>
      )}

      {/* Code tab: common keys + selected vendor panel */}
      {activeGroup === CODE_TAB && (() => {
        const vendor = CLI_VENDORS[codeVendorIdx] || CLI_VENDORS[0];
        return (
        <div className="border-b border-gray-700/50 bg-[#12122a] px-2 py-1.5 max-h-64 overflow-y-auto">
          {/* Common keys (no header) */}
          <div className="flex flex-wrap gap-1 mb-1.5">
            {CODE_COMMON_KEYS.map((qk) => (
              <button key={qk.label} {...repeatProps(qk.key)} disabled={!activeSessionId} title={qk.title} className={keyBtn}>
                {qk.label}
              </button>
            ))}
          </div>
          {/* Selected vendor: toggle selector left, buttons right */}
          <div className="flex items-start gap-1.5 border-t border-gray-700/50 pt-1.5">
            <button
              ref={codeVendorBtnRef}
              onClick={() => setCodeVendorOpen((v) => !v)}
              className="text-[10px] text-gray-400 hover:text-white font-medium flex items-center gap-0.5 pt-0.5 select-none shrink-0"
            >
              <svg className="w-2.5 h-2.5 transition-transform" style={{ transform: codeVendorOpen ? "rotate(90deg)" : "rotate(0deg)" }} fill="currentColor" viewBox="0 0 20 20">
                <path d="M6 4l8 6-8 6V4z" />
              </svg>
              {vendor.name}
            </button>
            {codeVendorOpen && createPortal(
              <div
                ref={codeVendorMenuRef}
                className="fixed bg-[#1a1a2e] border border-gray-600 rounded shadow-lg min-w-[80px] py-0.5"
                style={{ zIndex: 9999, ...((() => {
                  const r = codeVendorBtnRef.current?.getBoundingClientRect();
                  return r ? { left: r.left, bottom: window.innerHeight - r.top + 4 } : {};
                })()) }}
              >
                {CLI_VENDORS.map((v, i) => (
                  <button
                    key={v.name}
                    onClick={() => { setCodeVendorIdx(i); setCodeVendorOpen(false); }}
                    className={`block w-full text-left px-3 py-1 text-[11px] hover:bg-[#2a2a4a] transition-colors ${i === codeVendorIdx ? "text-blue-400" : "text-gray-300"}`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>,
              document.body
            )}
            <div className="flex flex-wrap gap-1 min-w-0">
              {/* Launch buttons (purple) */}
              {vendor.launch.map((cmd) => (
                <button
                  key={`${vendor.name}-${cmd.label}`}
                  onClick={() => { if (activeSessionId) sendInput(activeSessionId, cmd.command); }}
                  disabled={!activeSessionId}
                  title={cmd.title}
                  className="px-2 py-0.5 text-[11px] bg-[#1a1a2e] text-purple-400 hover:text-purple-200 hover:bg-[#2a2a4a] disabled:text-gray-600 rounded border border-purple-800/60 whitespace-nowrap transition-colors select-none"
                >
                  {cmd.label}
                </button>
              ))}
              {/* Vendor-specific keys */}
              {vendor.keys.map((qk) => (
                <button key={`${vendor.name}-${qk.label}`} {...repeatProps(qk.key)} disabled={!activeSessionId} title={qk.title} className={keyBtn}>
                  {qk.label}
                </button>
              ))}
              {/* Slash commands (cyan) */}
              {vendor.slashCmds.map((cmd) => (
                <button
                  key={`${vendor.name}-${cmd.label}`}
                  onClick={() => { if (activeSessionId) sendInput(activeSessionId, cmd.command); }}
                  disabled={!activeSessionId}
                  title={cmd.title}
                  className="px-2 py-0.5 text-[11px] bg-[#1a1a2e] text-cyan-400 hover:text-cyan-200 hover:bg-[#2a2a4a] disabled:text-gray-600 rounded border border-cyan-800/60 whitespace-nowrap transition-colors select-none"
                >
                  {cmd.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Git tab: quick actions + commit + config */}
      {activeGroup === GIT_TAB && (
        <div className="border-b border-gray-700/50 bg-[#12122a] px-2 py-1.5 max-h-48 overflow-y-auto">
          {/* Git quick actions */}
          <div className="flex flex-wrap gap-1 mb-1.5">
            {GIT_QUICK_CMDS.map((cmd) => (
              <button
                key={cmd.label}
                onClick={() => { if (activeSessionId) sendInput(activeSessionId, cmd.command); }}
                disabled={!activeSessionId}
                title={cmd.title}
                className={keyBtn}
              >
                {cmd.label}
              </button>
            ))}
          </div>
          {/* Git commit with message input */}
          <div className="flex items-center gap-1.5 mb-1.5 border-t border-gray-700/50 pt-1.5">
            <span className="text-[10px] text-gray-600 shrink-0">commit</span>
            <input
              value={gitCommitMsg}
              onChange={(e) => setGitCommitMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && gitCommitMsg.trim() && activeSessionId) {
                  const escaped = gitCommitMsg.replace(/'/g, "'\\''");
                  sendInput(activeSessionId, `git commit -m '${escaped}'\n`);
                  setGitCommitMsg("");
                }
              }}
              placeholder="commit message..."
              className="flex-1 bg-[#1a1a2e] text-white border border-gray-700 rounded px-2 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-0"
            />
            <button
              onClick={() => {
                if (activeSessionId && gitCommitMsg.trim()) {
                  const escaped = gitCommitMsg.replace(/'/g, "'\\''");
                  sendInput(activeSessionId, `git commit -m '${escaped}'\n`);
                  setGitCommitMsg("");
                }
              }}
              disabled={!gitCommitMsg.trim() || !activeSessionId}
              className="px-2 py-0.5 text-[11px] bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors shrink-0"
            >
              Commit
            </button>
          </div>
          {/* Git config (name + email) */}
          <div className="flex items-center gap-1.5 border-t border-gray-700/50 pt-1.5">
            <span className="text-[10px] text-gray-600 shrink-0">config</span>
            <input
              value={gitConfigName}
              onChange={(e) => setGitConfigName(e.target.value)}
              placeholder="user.name"
              className="flex-1 bg-[#1a1a2e] text-white border border-gray-700 rounded px-2 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-0"
            />
            <input
              value={gitConfigEmail}
              onChange={(e) => setGitConfigEmail(e.target.value)}
              placeholder="user.email"
              className="flex-1 bg-[#1a1a2e] text-white border border-gray-700 rounded px-2 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-0"
            />
            <button
              onClick={() => {
                if (!activeSessionId) return;
                if (gitConfigName.trim()) sendInput(activeSessionId, `git config --global user.name '${gitConfigName.trim()}'\n`);
                if (gitConfigEmail.trim()) sendInput(activeSessionId, `git config --global user.email '${gitConfigEmail.trim()}'\n`);
              }}
              disabled={!activeSessionId || (!gitConfigName.trim() && !gitConfigEmail.trim())}
              className="px-2 py-0.5 text-[11px] bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors shrink-0"
            >
              Set
            </button>
          </div>
        </div>
      )}

      {/* Text input */}
      <div className="flex gap-2 px-2 pt-2 pb-1">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          placeholder="Type anything... (Enter for newline)"
          rows={1}
          className="flex-1 bg-[#1a1a2e] text-white border border-gray-600 rounded-lg px-3 py-2 text-[16px] leading-5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
          style={{ maxHeight: 120 }}
        />
        <button
          onClick={handleSend}
          disabled={!text || !activeSessionId}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Send
        </button>
      </div>

      {/* Always-visible nav keys */}
      <div className="flex items-center gap-1 px-2 pb-1.5 overflow-x-auto scrollbar-none">
        {NAV_KEYS.map((qk) => (
          <button key={qk.label} {...repeatProps(qk.key)} disabled={!activeSessionId} title={qk.title} className={`${keyBtn} text-[10px] px-1.5`}>
            {qk.label}
          </button>
        ))}
        {NAV_TAIL.map((qk) => (
          <button key={qk.label} {...repeatProps(qk.key)} disabled={!activeSessionId} title={qk.title} className={`${keyBtn} text-[10px] px-1.5`}>
            {qk.label}
          </button>
        ))}
      </div>
    </div>
  );
}
