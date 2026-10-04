import { useCallback, useEffect, useRef, useState } from "react";
import { useTerminalStore } from "~/stores/terminalStore";
import { showToast } from "~/stores/toastStore";
import { useWorkspaceStore } from "~/stores/workspaceStore";
import CommandChips, { type Chip } from "./CommandChips";
import {
  COMBO_SETS,
  type ComboSet,
  comboSequence,
  FN_COMBO_KEYS,
  NAV_COMBO_KEYS,
  STICKY_MODES,
  type StickyMode,
  SYMBOL_COMBO_KEYS,
} from "./combos";
import DropUpSelect from "./DropUpSelect";

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

// Arrow keys pinned to the end of the bar
const NAV_ARROWS: QuickKey[] = [
  { label: "↑", key: "\x1b[A", title: "Up / Previous command" },
  { label: "↓", key: "\x1b[B", title: "Down / Next command" },
  { label: "←", key: "\x1b[D", title: "Cursor left" },
  { label: "→", key: "\x1b[C", title: "Cursor right" },
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
      {
        label: "plan",
        title: "Read-only plan mode",
        command: "claude --allowedTools Read,Glob,Grep,WebSearch,WebFetch\n",
      },
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
      { label: "/context", title: "Show context window usage", command: "/context\n" },
      { label: "/resume", title: "Resume a past session", command: "/resume\n" },
      { label: "/agents", title: "Manage subagents", command: "/agents\n" },
      { label: "/status", title: "Show account and system status", command: "/status\n" },
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
      {
        label: "auto-edit",
        title: "Applies file changes, asks for commands",
        command: "codex --approval-mode auto-edit\n",
      },
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
    launch: [{ label: "opencode", title: "Interactive mode", command: "opencode\n" }],
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
// Matches the .drawer transition in app.css.
const DRAWER_MS = 280;

// Grow to three lines, then scroll inside the field: 3 × leading-5, plus the
// field's py-2 and its 1px borders.
const TEXTAREA_MAX_PX = 3 * 20 + 16 + 2;

// Controls for the session a tmux tab is attached to. No session list or
// switch: the tab is bound to one session and choosing one happens in the +
// picker. No detach either — closing the tab detaches, and the session keeps
// running, which is the whole point of it.
const TMUX_SESSION_KEYS: QuickKey[] = [
  { label: "$ rename", key: "\x02$", title: "Rename this session" },
  { label: ": cmd", key: "\x02:", title: "tmux command prompt" },
];

// Grouped by what each control acts on, one group shown at a time.
const TMUX_GROUPS: { label: string; keys: QuickKey[] }[] = [
  {
    label: "windows",
    keys: [
      { label: "c new", key: "\x02c", title: "New window" },
      { label: "n next", key: "\x02n", title: "Next window" },
      { label: "p prev", key: "\x02p", title: "Previous window" },
      { label: "0", key: "\x020", title: "Window 0" },
      { label: "1", key: "\x021", title: "Window 1" },
      { label: "2", key: "\x022", title: "Window 2" },
      { label: "3", key: "\x023", title: "Window 3" },
      { label: "4", key: "\x024", title: "Window 4" },
      { label: "5", key: "\x025", title: "Window 5" },
      { label: ", rename", key: "\x02,", title: "Rename window" },
      { label: "& kill", key: "\x02&", title: "Kill window" },
      { label: "w list", key: "\x02w", title: "List windows" },
    ],
  },
  {
    label: "panes",
    keys: [
      { label: '" hsplit', key: '\x02"', title: "Split horizontal" },
      { label: "% vsplit", key: "\x02%", title: "Split vertical" },
      { label: "o pane", key: "\x02o", title: "Next pane" },
      { label: "z zoom", key: "\x02z", title: "Toggle zoom pane" },
      { label: "x kill", key: "\x02x", title: "Kill pane" },
    ],
  },
  {
    label: "copy",
    keys: [
      { label: "[ scroll", key: "\x02[", title: "Scroll/copy mode (Esc to exit)" },
      { label: "] paste", key: "\x02]", title: "Paste from tmux buffer" },
    ],
  },
];

const TMUX_TAB = "__tmux__";
const TEXT_TAB = "__text__";
const STICKY_TAB = "__sticky__";
const CODE_TAB = "__code__";
const GIT_TAB = "__git__";
const CD_TAB = "__cd__";

interface TmuxSession {
  name: string;
  windows: number;
  attached: boolean;
}

/**
 * The command-line helpers for one terminal or tmux tab.
 *
 * One instance per tab, not one shared instance bound to whichever tab is
 * active: the open drawer, the typed text, the picked CLI and the cd listing
 * are all things a tab should keep while you work in another one.
 */
export default function InputBox({ sessionId }: { sessionId: string }) {
  const [text, setText] = useState("");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  // What is currently painted. Lags `activeGroup` on close so the drawer can
  // animate shut instead of vanishing.
  const [drawerGroup, setDrawerGroup] = useState<string | null>(null);
  const customCommands = useWorkspaceStore((s) => s.customCommands);
  const hiddenCommands = useWorkspaceStore((s) => s.hiddenCommands);
  const addCommand = useWorkspaceStore((s) => s.addCommand);
  const removeCommand = useWorkspaceStore((s) => s.removeCommand);
  const restoreCommand = useWorkspaceStore((s) => s.restoreCommand);
  const customSlash = useWorkspaceStore((s) => s.customSlash);
  const hiddenSlash = useWorkspaceStore((s) => s.hiddenSlash);
  const addSlash = useWorkspaceStore((s) => s.addSlash);
  const removeSlash = useWorkspaceStore((s) => s.removeSlash);
  const restoreSlash = useWorkspaceStore((s) => s.restoreSlash);
  const [comboSet, setComboSet] = useState<ComboSet>("letters");
  const [tmuxGroup, setTmuxGroup] = useState(TMUX_GROUPS[0].label);
  const [toolVersions, setToolVersions] = useState<{
    claude: string | null;
    codex: string | null;
    opencode: string | null;
  }>({ claude: null, codex: null, opencode: null });
  const toolVersionsFetched = useRef(false);
  const [cdDirs, setCdDirs] = useState<string[]>([]);
  const [cdLoading, setCdLoading] = useState(false);
  const [stickyMode, setStickyMode] = useState<StickyMode>("ctrl");
  const [codeVendorIdx, setCodeVendorIdx] = useState(0);
  const [gitCommitMsg, setGitCommitMsg] = useState("");
  const [gitConfigName, setGitConfigName] = useState("");
  const [gitConfigEmail, setGitConfigEmail] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (activeGroup) {
      setDrawerGroup(activeGroup);
      return;
    }
    const timer = setTimeout(() => setDrawerGroup(null), DRAWER_MS);
    return () => clearTimeout(timer);
  }, [activeGroup]);
  const sendInput = useTerminalStore((s) => s.sendInput);
  const setCdCwd = useTerminalStore((s) => s.setCdCwd);
  const sessions = useTerminalStore((s) => s.sessions);

  // Close vendor dropdown on outside click

  const session = sessions[sessionId] ?? null;
  // A tmux tab runs tmux as its process, so this is also "am I in tmux".
  const tmuxSession = session?.tmuxSession;
  const cdCwd = session?.cdCwd ?? "";

  // --- Handlers ---
  const handleSend = () => {
    if (!sessionId || !text) return;
    sendInput(sessionId, text + "\n");
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    textareaRef.current?.focus();
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, TEXTAREA_MAX_PX)}px`;
  };

  const handleQuickKey = useCallback(
    (key: string) => {
      if (!sessionId) return;
      if (key.length === 2 && key.charCodeAt(0) < 0x20 && key.charCodeAt(1) >= 0x20) {
        sendInput(sessionId, key);
      } else {
        sendInput(sessionId, key);
      }
    },
    [sessionId, sendInput],
  );

  // Long-press repeat with scroll detection
  const repeatRef = useRef<{
    timeout: ReturnType<typeof setTimeout>;
    interval: ReturnType<typeof setInterval> | null;
    fired: boolean;
    startX: number;
    startY: number;
  } | null>(null);

  const startRepeat = useCallback(
    (key: string, x: number, y: number) => {
      const timeout = setTimeout(() => {
        if (!repeatRef.current) return;
        repeatRef.current.fired = true;
        handleQuickKey(key);
        const interval = setInterval(() => handleQuickKey(key), 80);
        if (repeatRef.current) repeatRef.current.interval = interval;
      }, 120);
      repeatRef.current = { timeout, interval: null, fired: false, startX: x, startY: y };
    },
    [handleQuickKey],
  );

  const cancelRepeat = useCallback(() => {
    if (repeatRef.current) {
      clearTimeout(repeatRef.current.timeout);
      // null until the hold actually starts repeating.
      if (repeatRef.current.interval) clearInterval(repeatRef.current.interval);
      repeatRef.current = null;
    }
  }, []);

  const finishRepeat = useCallback(
    (key: string) => {
      if (repeatRef.current && !repeatRef.current.fired) handleQuickKey(key);
      cancelRepeat();
    },
    [handleQuickKey, cancelRepeat],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!repeatRef.current) return;
      if (Math.abs(e.clientX - repeatRef.current.startX) > 10 || Math.abs(e.clientY - repeatRef.current.startY) > 10) {
        cancelRepeat();
      }
    },
    [cancelRepeat],
  );

  const repeatProps = (key: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      startRepeat(key, e.clientX, e.clientY);
    },
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

  const modeLabel = STICKY_MODES.find((m) => m.id === stickyMode)?.label ?? "";

  const toggleGroup = (id: string) => {
    if (activeGroup === id) {
      setActiveGroup(null);
    } else {
      setActiveGroup(id);
      if (id === CD_TAB) fetchDirs();
      if (id === CODE_TAB) fetchToolVersions();
    }
  };

  // cd directory picker — always scoped to the currently-active terminal session
  const fetchDirs = async (dir?: string) => {
    if (!sessionId) return;
    setCdLoading(true);
    try {
      // If no dir specified, detect this terminal's actual CWD first
      let targetDir = dir;
      if (!targetDir) {
        try {
          const cwdRes = await fetch(`/api/terminal/cwd?sessionId=${sessionId}&inTmux=${!!tmuxSession}`);
          const cwdData = await cwdRes.json();
          if (cwdData.cwd) targetDir = cwdData.cwd;
        } catch {}
      }
      const query = targetDir ? `?dir=${encodeURIComponent(targetDir)}&showHidden=false` : "?showHidden=false";
      const res = await fetch(`/api/files/list${query}`);
      const data = await res.json();
      if (data.error) {
        showToast(data.error);
      } else if (useTerminalStore.getState().sessions[sessionId]) {
        // Drop the result if the tab was closed while we were fetching.
        setCdCwd(sessionId, data.dir);
        setCdDirs(
          (data.entries || [])
            .filter((e: { isDirectory: boolean }) => e.isDirectory)
            .map((e: { name: string }) => e.name),
        );
      }
    } catch {
      setCdDirs([]);
      showToast("Could not reach the server");
    }
    setCdLoading(false);
  };

  const handleCdTo = (dir: string) => {
    if (!sessionId) return;
    const absPath = dir === ".." ? cdCwd.replace(/\/[^/]+$/, "") || "/" : `${cdCwd}/${dir}`;
    sendInput(sessionId, `cd '${absPath}'\n`);
    fetchDirs(absPath);
  };

  const handleCdHome = () => {
    if (!sessionId) return;
    sendInput(sessionId, "cd ~\n");
    fetchDirs(); // No dir param = defaults to HOME
  };

  // Editors

  // --- Styles ---
  const tabBase = "px-2.5 py-0.5 text-[11px] rounded-control whitespace-nowrap shrink-0 select-none touch-manipulation";
  const tabDisabled = `${tabBase} bg-disabled text-ink-ghost cursor-not-allowed`;
  // Action tabs (cmds, cd, code, sticky) — blue. `relief` supplies the raised
  // body; the tinted fill underneath only shows through on the active one.
  // Native terminal tabs (text, cmds, cd, combos) — blue
  const actionTabOff = `${tabBase} relief text-tab-action-ink`;
  const actionTabOn = `${tabBase} relief glow bg-tab-action-on text-tab-action-ink-on ring-2 ring-inset ring-blue-400/70`;
  // CLI tool tabs (code, git) — purple
  // In-app tabs (tmux) — green
  const appTabOff = `${tabBase} relief text-tab-app-ink`;
  const appTabOn = `${tabBase} relief glow bg-tab-app-on text-tab-app-ink-on ring-2 ring-inset ring-green-400/70`;
  const cliTabOff = `${tabBase} relief text-tab-cli-ink`;
  const cliTabOn = `${tabBase} relief glow bg-tab-cli-on text-tab-cli-ink-on ring-2 ring-inset ring-purple-400/70`;
  // Popup action buttons — same raised treatment as Send, tinted by role.
  const keyBtn =
    "px-2 py-0.5 text-[11px] relief text-ink-muted hover:text-ink rounded-control whitespace-nowrap select-none touch-manipulation";
  const actionBtn = "px-2.5 py-1 text-[11px] relief rounded-control whitespace-nowrap select-none touch-manipulation";

  // The drawer is the same for a terminal tab and a tmux tab now, so there is
  // no per-mode tab set to work out.
  const SECTORS = {
    native: { on: actionTabOn, off: actionTabOff },
    cli: { on: cliTabOn, off: cliTabOff },
    app: { on: appTabOn, off: appTabOff },
  } as const;

  const tabBtn = (
    id: string,
    label: string,
    title: string,
    disabled?: boolean,
    sector: keyof typeof SECTORS = "native",
  ) => (
    <button
      key={id}
      onClick={() => !disabled && toggleGroup(id)}
      disabled={disabled}
      title={title}
      className={disabled ? tabDisabled : activeGroup === id ? SECTORS[sector].on : SECTORS[sector].off}
    >
      {label}
    </button>
  );

  // Resolve which key group to show in the popup
  const activeStandardGroup =
    drawerGroup && ![TMUX_TAB, TEXT_TAB, STICKY_TAB, CODE_TAB, GIT_TAB, CD_TAB].includes(drawerGroup)
      ? TERMINAL_GROUPS.find((g) => g.label === drawerGroup)
      : null;

  const isCmdsGroup = activeStandardGroup?.label === "cmds";
  // Built-ins the user removed drop out; their own commands are appended.
  const visibleCommands: Chip[] = !activeStandardGroup
    ? []
    : isCmdsGroup
      ? [
          ...activeStandardGroup.keys
            .filter((k) => !hiddenCommands.includes(k.label))
            .map((k) => ({ label: k.label, command: k.key, title: k.title })),
          ...customCommands.map((c) => ({
            label: c.label,
            command: `${c.command}\n`,
            title: c.command,
            custom: true,
          })),
        ]
      : activeStandardGroup.keys.map((k) => ({ label: k.label, command: k.key, title: k.title }));

  return (
    <div
      className="bg-surface border-t border-line shrink-0 overflow-hidden terminal-focus-area rounded-sm"
      style={{ minWidth: 0 }}
    >
      {/* Tab bar */}
      <div className="border-b border-line/50 overflow-x-auto scrollbar-none" style={{ minWidth: 0 }}>
        <div className="flex items-center gap-1 px-2 py-1 w-max">
          {tmuxSession && tabBtn(TMUX_TAB, "tmux", `Controls for session "${tmuxSession}"`, false, "app")}
          {tabBtn(TEXT_TAB, "text", "Type a command or message", !sessionId)}
          {/* Native terminal tabs (blue) — always in same order, hidden in editor mode */}
          {TERMINAL_GROUPS.map((g) => tabBtn(g.label, g.label, g.title, !sessionId))}
          {tabBtn(CD_TAB, "cd", "Change directory", !sessionId)}
          {tabBtn(STICKY_TAB, "combos", "Modifier key combinations")}
          {tabBtn(CODE_TAB, "code", "Coding CLI launchers & keys", !sessionId, "cli")}
          {tabBtn(GIT_TAB, "git", "Git actions", !sessionId, "cli")}
        </div>
      </div>

      {/* One animating container for every drawer: grid-template-rows 0fr->1fr
          transitions to the content's own height, which differs per drawer. */}
      <div className="drawer" data-open={activeGroup ? "true" : "false"}>
        <div className="drawer-inner">
          {/* Standard key group popup (cmds) */}
          {activeStandardGroup && (
            <div className="border-b border-line/50 bg-panel px-2 py-1.5">
              <CommandChips
                chips={visibleCommands}
                hidden={hiddenCommands}
                disabled={!sessionId}
                chipClass={keyBtn}
                dialogTitle="Add command"
                dialogHint="Becomes a button in the cmds group. Runs immediately."
                commandPlaceholder="./deploy.sh --prod"
                onRun={(command) => sessionId && sendInput(sessionId, command)}
                onAdd={(label, command) => addCommand({ label, command })}
                onRemove={removeCommand}
                onRestore={restoreCommand}
              />
            </div>
          )}

          {/* cd directory picker */}
          {drawerGroup === CD_TAB && (
            <div className="border-b border-line/50 bg-panel px-2 py-1.5">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] text-ink-faint">cd</span>
                <span
                  className="text-[10px] text-ink-ghost overflow-hidden text-ellipsis whitespace-nowrap flex-1"
                  title={cdCwd}
                >
                  {cdCwd}
                </span>
              </div>
              {cdLoading ? (
                <span className="text-[11px] text-ink-faint">Loading...</span>
              ) : (
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  <button
                    onClick={() => handleCdTo("..")}
                    disabled={!sessionId}
                    className={`${keyBtn} text-yellow-400 hover:text-yellow-300`}
                    title="Go up one directory"
                  >
                    ..
                  </button>
                  <button
                    onClick={handleCdHome}
                    disabled={!sessionId}
                    className={`${keyBtn} text-blue-400 hover:text-blue-300`}
                    title="Go to home directory"
                  >
                    ~
                  </button>
                  {cdDirs.map((dir) => (
                    <button
                      key={dir}
                      onClick={() => handleCdTo(dir)}
                      disabled={!sessionId}
                      className="px-2 py-0.5 text-[11px] relief text-purple-300 hover:text-purple-100 rounded-control whitespace-nowrap select-none touch-manipulation"
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
          {drawerGroup === TMUX_TAB && tmuxSession && (
            <div className="border-b border-line/50 bg-panel px-2 py-1.5">
              <div className="flex flex-wrap items-center gap-1">
                <span className="shrink-0 text-[10px] text-ink-faint">
                  session <span className="font-medium text-blue-300">{tmuxSession}</span>
                </span>
                <span aria-hidden="true" className="mx-0.5 select-none text-ink-ghost">
                  |
                </span>
                {TMUX_SESSION_KEYS.map((qk) => (
                  <button
                    key={qk.label}
                    {...repeatProps(qk.key)}
                    disabled={!sessionId}
                    title={qk.title}
                    className={keyBtn}
                  >
                    {qk.label}
                  </button>
                ))}
              </div>

              <div className="mt-1.5 flex items-start gap-1.5 border-t border-line/50 pt-1.5">
                <DropUpSelect
                  value={tmuxGroup}
                  options={TMUX_GROUPS.map((g) => ({ id: g.label, label: g.label }))}
                  onChange={setTmuxGroup}
                />
                <div className="flex min-w-0 flex-wrap gap-1">
                  {(TMUX_GROUPS.find((g) => g.label === tmuxGroup) ?? TMUX_GROUPS[0]).keys.map((qk) => (
                    <button
                      key={qk.label}
                      {...repeatProps(qk.key)}
                      disabled={!sessionId}
                      title={qk.title}
                      className={keyBtn}
                    >
                      {qk.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {drawerGroup === STICKY_TAB && (
            <div className="border-b border-line/50 bg-panel px-2 py-1.5">
              {/* Which keys to show. Letters and digits alone were 36 buttons;
                  the named keys would have pushed that past 60. */}
              <div className="mb-1.5 flex flex-wrap items-center gap-1">
                {COMBO_SETS.map((set) => (
                  <button
                    key={set}
                    type="button"
                    onClick={() => setComboSet(set)}
                    className={`px-2 py-0.5 text-[10px] rounded-control border transition-colors select-none ${
                      comboSet === set
                        ? "relief-accent border-blue-500 text-white"
                        : "border-line bg-raised text-ink-faint hover:text-ink"
                    }`}
                  >
                    {set}
                  </button>
                ))}
              </div>

              {/* The modifier is the prefix for everything to its right. */}
              <div className="flex items-start gap-1.5 border-t border-line/50 pt-1.5">
                <DropUpSelect value={stickyMode} options={STICKY_MODES} onChange={setStickyMode} />
                <div className="flex min-w-0 flex-wrap gap-1">
                  {comboSet === "numbers" &&
                    "0123456789".split("").map((ch) => (
                      <button
                        key={ch}
                        {...repeatProps(comboSequence(ch, stickyMode))}
                        disabled={!sessionId}
                        title={`${modeLabel}${ch}`}
                        className={keyBtn}
                      >
                        {ch}
                      </button>
                    ))}

                  {comboSet === "letters" &&
                    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((ch) => (
                      <button
                        key={ch}
                        {...repeatProps(comboSequence(ch, stickyMode))}
                        disabled={!sessionId}
                        title={`${modeLabel}${ch}`}
                        className={keyBtn}
                      >
                        {ch}
                      </button>
                    ))}

                  {(comboSet === "nav" || comboSet === "function") &&
                    (comboSet === "nav" ? NAV_COMBO_KEYS : FN_COMBO_KEYS).map((key) => (
                      <button
                        key={key.label}
                        {...repeatProps(comboSequence(key.label, stickyMode))}
                        disabled={!sessionId}
                        title={`${modeLabel}${key.title}`}
                        className={keyBtn}
                      >
                        {key.label}
                      </button>
                    ))}

                  {comboSet === "symbols" &&
                    SYMBOL_COMBO_KEYS.map((key) => (
                      <button
                        key={key.label}
                        {...repeatProps(comboSequence(key.label, stickyMode))}
                        disabled={!sessionId}
                        title={`${modeLabel}${key.label} — ${key.title}`}
                        className={keyBtn}
                      >
                        {key.label}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* Vim popup: commands when inside, file opener when outside */}

          {/* Tmux popup: commands when inside, sessions when outside */}

          {/* Code tab: common keys + selected vendor panel */}
          {drawerGroup === CODE_TAB &&
            (() => {
              const vendor = CLI_VENDORS[codeVendorIdx] || CLI_VENDORS[0];
              const prefix = `${vendor.name}:`;
              // Slash commands are per CLI: claude's set is not codex's.
              const slashChips: Chip[] = [
                ...vendor.slashCmds
                  .filter((c) => !hiddenSlash.includes(prefix + c.label))
                  .map((c) => ({ label: c.label, command: c.command, title: c.title })),
                ...customSlash
                  .filter((c) => c.vendor === vendor.name)
                  .map((c) => ({ label: c.label, command: `${c.command}\n`, title: c.command, custom: true })),
              ];
              const hiddenSlashLabels = hiddenSlash
                .filter((k) => k.startsWith(prefix))
                .map((k) => k.slice(prefix.length));

              return (
                <div className="border-b border-line/50 bg-panel px-2 py-1.5 max-h-64 overflow-y-auto">
                  {/* Selected CLI on the left; its launchers and keys beside it. */}
                  <div className="flex items-start gap-1.5">
                    <DropUpSelect
                      value={vendor.name}
                      options={CLI_VENDORS.map((v) => ({ id: v.name, label: v.name }))}
                      onChange={(name) => setCodeVendorIdx(CLI_VENDORS.findIndex((v) => v.name === name))}
                    />
                    <div className="flex flex-wrap gap-1 min-w-0">
                      {/* Launchers (purple) */}
                      {vendor.launch.map((cmd) => (
                        <button
                          key={`${vendor.name}-${cmd.label}`}
                          onClick={() => {
                            if (sessionId) sendInput(sessionId, cmd.command);
                          }}
                          disabled={!sessionId}
                          title={cmd.title}
                          className="px-2 py-0.5 text-[11px] relief text-purple-300 hover:text-purple-100 rounded-control whitespace-nowrap select-none"
                        >
                          {cmd.label}
                        </button>
                      ))}
                      {/* Key combos: the ones every CLI shares, then this one's
                          own, as a single group — they are the same kind of
                          thing and were split across two rows for no reason. */}
                      {[...CODE_COMMON_KEYS, ...vendor.keys].map((qk) => (
                        <button
                          key={`${vendor.name}-${qk.label}`}
                          {...repeatProps(qk.key)}
                          disabled={!sessionId}
                          title={qk.title}
                          className={keyBtn}
                        >
                          {qk.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Slash commands, customisable per CLI. */}
                  <div className="mt-1.5 border-t border-line/50 pt-1.5">
                    <CommandChips
                      chips={slashChips}
                      hidden={hiddenSlashLabels}
                      disabled={!sessionId}
                      chipClass="px-2 py-0.5 text-[11px] relief text-cyan-300 hover:text-cyan-100 rounded-control whitespace-nowrap select-none"
                      dialogTitle={`Add ${vendor.name} slash command`}
                      dialogHint={`Sent to ${vendor.name} when tapped. Saved for ${vendor.name} only.`}
                      commandPlaceholder="/review"
                      onRun={(command) => sessionId && sendInput(sessionId, command)}
                      onAdd={(label, command) => addSlash({ vendor: vendor.name, label, command })}
                      onRemove={(label, isCustom) => removeSlash(vendor.name, label, isCustom)}
                      onRestore={(label) => restoreSlash(vendor.name, label)}
                    />
                  </div>
                </div>
              );
            })()}

          {/* Git tab: quick actions + commit + config */}
          {drawerGroup === GIT_TAB && (
            <div className="border-b border-line/50 bg-panel px-2 py-1.5 max-h-48 overflow-y-auto">
              {/* Git quick actions */}
              <div className="flex flex-wrap gap-1 mb-1.5">
                {GIT_QUICK_CMDS.map((cmd) => (
                  <button
                    key={cmd.label}
                    onClick={() => {
                      if (sessionId) sendInput(sessionId, cmd.command);
                    }}
                    disabled={!sessionId}
                    title={cmd.title}
                    className={keyBtn}
                  >
                    {cmd.label}
                  </button>
                ))}
              </div>
              {/* Git commit with message input */}
              <div className="flex items-center gap-1.5 mb-1.5 border-t border-line/50 pt-1.5">
                <span className="text-[10px] text-ink-ghost shrink-0">commit</span>
                <input
                  value={gitCommitMsg}
                  onChange={(e) => setGitCommitMsg(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && gitCommitMsg.trim() && sessionId) {
                      const escaped = gitCommitMsg.replace(/'/g, "'\\''");
                      sendInput(sessionId, `git commit -m '${escaped}'\n`);
                      setGitCommitMsg("");
                    }
                  }}
                  placeholder="commit message..."
                  className="field min-w-0 flex-1 px-2 py-0.5 text-[11px]"
                />
                <button
                  onClick={() => {
                    if (sessionId && gitCommitMsg.trim()) {
                      const escaped = gitCommitMsg.replace(/'/g, "'\\''");
                      sendInput(sessionId, `git commit -m '${escaped}'\n`);
                      setGitCommitMsg("");
                    }
                  }}
                  disabled={!gitCommitMsg.trim() || !sessionId}
                  className="px-2 py-0.5 text-[11px] relief-accent relief-success text-white rounded-control shrink-0"
                >
                  Commit
                </button>
              </div>
              {/* Git config (name + email) */}
              <div className="flex items-center gap-1.5 border-t border-line/50 pt-1.5">
                <span className="text-[10px] text-ink-ghost shrink-0">config</span>
                <input
                  value={gitConfigName}
                  onChange={(e) => setGitConfigName(e.target.value)}
                  placeholder="user.name"
                  className="field min-w-0 flex-1 px-2 py-0.5 text-[11px]"
                />
                <input
                  value={gitConfigEmail}
                  onChange={(e) => setGitConfigEmail(e.target.value)}
                  placeholder="user.email"
                  className="field min-w-0 flex-1 px-2 py-0.5 text-[11px]"
                />
                <button
                  onClick={() => {
                    if (!sessionId) return;
                    if (gitConfigName.trim())
                      sendInput(sessionId, `git config --global user.name '${gitConfigName.trim()}'\n`);
                    if (gitConfigEmail.trim())
                      sendInput(sessionId, `git config --global user.email '${gitConfigEmail.trim()}'\n`);
                  }}
                  disabled={!sessionId || (!gitConfigName.trim() && !gitConfigEmail.trim())}
                  className="px-2 py-0.5 text-[11px] relief-accent disabled:bg-control disabled:text-ink-faint text-white rounded-control transition-colors shrink-0"
                >
                  Set
                </button>
              </div>
            </div>
          )}

          {/* Text input — now the "text" tab's drawer rather than a pinned row, so
          an unselected input area collapses to just the tab strip. */}
          {drawerGroup === TEXT_TAB && (
            <>
              <div className="flex gap-2 px-2 py-2">
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={handleInput}
                  placeholder="Type anything... (Enter for newline)"
                  rows={1}
                  className="field scrollbar-none flex-1 resize-none rounded-panel px-3 py-2 text-[16px] leading-5"
                  style={{ maxHeight: TEXTAREA_MAX_PX }}
                />
                {/* A glyph rather than the word: the composer is narrow on a
                phone and the text area is what should get the width. */}
                <button
                  onClick={handleSend}
                  disabled={!text || !sessionId}
                  aria-label="Send"
                  title="Send"
                  className="relief-accent shrink-0 self-end rounded-panel p-2.5 text-white transition-colors disabled:bg-control disabled:text-ink-faint"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                  </svg>
                </button>
              </div>

              {/* Nav keys travel with the text input. */}
              <div className="flex items-center gap-1 px-2 pt-1 pb-2 overflow-x-auto scrollbar-none">
                {NAV_KEYS.map((qk) => (
                  <button
                    key={qk.label}
                    {...repeatProps(qk.key)}
                    disabled={!sessionId}
                    title={qk.title}
                    className={`${keyBtn} text-[10px] px-1.5`}
                  >
                    {qk.label}
                  </button>
                ))}
                {NAV_TAIL.map((qk) => (
                  <button
                    key={qk.label}
                    {...repeatProps(qk.key)}
                    disabled={!sessionId}
                    title={qk.title}
                    className={`${keyBtn} text-[10px] px-1.5`}
                  >
                    {qk.label}
                  </button>
                ))}
                {NAV_ARROWS.map((qk) => (
                  <button
                    key={qk.label}
                    {...repeatProps(qk.key)}
                    disabled={!sessionId}
                    title={qk.title}
                    className={`${keyBtn} text-[10px] px-1.5`}
                  >
                    {qk.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
