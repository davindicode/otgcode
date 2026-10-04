import { useCallback, useEffect, useRef, useState } from "react";
import { apiJson } from "~/lib/api";
import { shellQuote } from "~/lib/shell";
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
    label: "commands",
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
const KB_TAB = "__keyboard__";

/**
 * What the keyboard's bottom row is showing. One list, because a modifier set,
 * a coding CLI and git are all "a bar of keys with something above it" — they
 * were four tabs duplicating the same two rows.
 */
type KbMode = "keys" | ComboSet | `cli:${string}` | "git";

/** The git form line, chosen the way a combo modifier is. */
type GitForm = "commit" | "config";
const GIT_FORMS: { id: GitForm; label: string }[] = [
  { id: "commit", label: "commit" },
  { id: "config", label: "config" },
];
const CD_TAB = "__cd__";

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
  const [tmuxGroup, setTmuxGroup] = useState(TMUX_GROUPS[0].label);
  const [cdDirs, setCdDirs] = useState<string[]>([]);
  const [cdLoading, setCdLoading] = useState(false);
  const [stickyMode, setStickyMode] = useState<StickyMode>("none");
  const [kbMode, setKbMode] = useState<KbMode>("keys");
  const [gitForm, setGitForm] = useState<GitForm>("commit");
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
    textareaRef.current?.focus();
  };

  const commitGit = () => {
    const message = gitCommitMsg.trim();
    if (!sessionId || !message) return;
    sendInput(sessionId, `git commit -m ${shellQuote(message)}\n`);
    setGitCommitMsg("");
  };

  const setGitIdentity = () => {
    if (!sessionId) return;
    if (gitConfigName.trim())
      sendInput(sessionId, `git config --global user.name ${shellQuote(gitConfigName.trim())}\n`);
    if (gitConfigEmail.trim())
      sendInput(sessionId, `git config --global user.email ${shellQuote(gitConfigEmail.trim())}\n`);
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

  const modeLabel = stickyMode === "none" ? "" : (STICKY_MODES.find((m) => m.id === stickyMode)?.label ?? "");

  const KB_MODES: { id: KbMode; label: string }[] = [
    { id: "keys", label: "keys" },
    ...COMBO_SETS.map((set) => ({ id: set as KbMode, label: set })),
    ...CLI_VENDORS.map((v) => ({ id: `cli:${v.name}` as KbMode, label: v.name })),
    { id: "git", label: "git" },
  ];
  const comboSet = COMBO_SETS.includes(kbMode as ComboSet) ? (kbMode as ComboSet) : null;
  const vendor = kbMode.startsWith("cli:") ? CLI_VENDORS.find((v) => `cli:${v.name}` === kbMode) : undefined;

  /** The bottom row's keys for the current combo set, modifier already applied. */
  const comboKeys = (): { label: string; seq: string; title: string }[] => {
    if (comboSet === "numbers") {
      return "0123456789"
        .split("")
        .map((ch) => ({ label: ch, seq: comboSequence(ch, stickyMode), title: `${modeLabel}${ch}` }));
    }
    if (comboSet === "letters") {
      return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((ch) => ({
        // Unmodified, the key sends lowercase, so it says lowercase.
        label: stickyMode === "none" ? ch.toLowerCase() : ch,
        seq: comboSequence(ch, stickyMode),
        title: `${modeLabel}${ch}`,
      }));
    }
    if (comboSet === "nav" || comboSet === "function") {
      return (comboSet === "nav" ? NAV_COMBO_KEYS : FN_COMBO_KEYS).map((key) => ({
        label: key.label,
        seq: comboSequence(key.label, stickyMode),
        title: `${modeLabel}${key.title}`,
      }));
    }
    if (comboSet === "symbols") {
      return SYMBOL_COMBO_KEYS.map((key) => ({
        label: key.label,
        seq: comboSequence(key.label, stickyMode),
        title: `${modeLabel}${key.label} — ${key.title}`,
      }));
    }
    return [];
  };

  const toggleGroup = (id: string) => {
    if (activeGroup === id) {
      setActiveGroup(null);
    } else {
      setActiveGroup(id);
      if (id === CD_TAB) fetchDirs();
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
          const cwdData = await apiJson<{ cwd?: string }>(`/api/terminal/cwd?sessionId=${sessionId}`);
          if (cwdData?.cwd) targetDir = cwdData.cwd;
        } catch {}
      }
      const query = targetDir ? `?dir=${encodeURIComponent(targetDir)}&showHidden=false` : "?showHidden=false";
      const data = await apiJson<{
        dir: string;
        entries?: { name: string; isDirectory: boolean }[];
        error?: string;
      }>(`/api/files/list${query}`);
      // null means the session expired and the lock screen is already up.
      if (!data) {
        return;
      } else if (data.error) {
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
    sendInput(sessionId, `cd ${shellQuote(absPath)}\n`);
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
    drawerGroup && ![TMUX_TAB, KB_TAB, CD_TAB].includes(drawerGroup)
      ? TERMINAL_GROUPS.find((g) => g.label === drawerGroup)
      : null;

  const isCmdsGroup = activeStandardGroup?.label === "commands";
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
          {tabBtn(KB_TAB, "keyboard", "Type, and the keys a terminal needs", !sessionId)}
          {TERMINAL_GROUPS.map((g) => tabBtn(g.label, g.label, g.title, !sessionId))}
          {/* navigate works on a tmux tab too: the server resolves the pane
          that tab's own tmux client is looking at, so it follows you between
          windows. A tmux tab then also gets its session's controls, last
          because they act on the session rather than on a directory. */}
          {tabBtn(CD_TAB, "navigate", "Move to another directory", !sessionId)}
          {tmuxSession && tabBtn(TMUX_TAB, "tmux session", `Controls for session "${tmuxSession}"`, false, "app")}
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
                <span className="shrink-0 text-[11px] text-ink-faint">navigate</span>
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
                <div className="chip-rows flex flex-wrap gap-1">
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

          {/*
            The keyboard. Three fixed rows: what you type, what qualifies it,
            and the keys themselves. A modifier set, a coding CLI and git were
            three tabs each repeating that shape, so they are modes of one tab
            instead — and every row stays one line high, scrolling sideways,
            so opening the keyboard never changes how much terminal you can see.
          */}
          {drawerGroup === KB_TAB && (
            <div className="border-b border-line/50 bg-panel px-2 py-1.5">
              {/* 1. The input itself. */}
              <div className="flex gap-2 pb-1.5">
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type anything... (Enter for newline)"
                  rows={1}
                  className="field scrollbar-none flex-1 resize-none overflow-y-auto rounded-panel px-3 py-2 text-[16px] leading-5"
                />
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

              {/* 2. The mode, and whatever qualifies it. The mode selector is
                  pinned left and anything the mode adds sits to its right. */}
              <div className="flex items-center gap-1.5 border-t border-line/50 pt-1.5">
                <DropUpSelect value={kbMode} options={KB_MODES} onChange={setKbMode} />

                {comboSet && (
                  <>
                    <span className="shrink-0 text-[10px] text-ink-ghost">combo mode:</span>
                    <DropUpSelect value={stickyMode} options={STICKY_MODES} onChange={setStickyMode} />
                  </>
                )}

                {vendor &&
                  (() => {
                    const prefix = `${vendor.name}:`;
                    const slashChips: Chip[] = [
                      ...vendor.slashCmds
                        .filter((c) => !hiddenSlash.includes(prefix + c.label))
                        .map((c) => ({ label: c.label, command: c.command, title: c.title })),
                      ...customSlash
                        .filter((c) => c.vendor === vendor.name)
                        .map((c) => ({ label: c.label, command: `${c.command}\n`, title: c.command, custom: true })),
                    ];
                    return (
                      <div className="min-w-0 flex-1">
                        <CommandChips
                          layout="row"
                          chips={slashChips}
                          hidden={hiddenSlash.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length))}
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
                    );
                  })()}

                {kbMode === "git" && (
                  <>
                    <DropUpSelect value={gitForm} options={GIT_FORMS} onChange={setGitForm} />
                    {gitForm === "commit" ? (
                      <>
                        <input
                          value={gitCommitMsg}
                          onChange={(e) => setGitCommitMsg(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && commitGit()}
                          placeholder="commit message..."
                          className="field min-w-0 flex-1 px-2 py-0.5 text-[11px]"
                        />
                        <button
                          onClick={commitGit}
                          disabled={!gitCommitMsg.trim() || !sessionId}
                          className="shrink-0 rounded-control relief-accent relief-success px-2 py-0.5 text-[11px] text-white"
                        >
                          Commit
                        </button>
                      </>
                    ) : (
                      <>
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
                          onClick={setGitIdentity}
                          disabled={!sessionId || (!gitConfigName.trim() && !gitConfigEmail.trim())}
                          className="shrink-0 rounded-control relief-accent px-2 py-0.5 text-[11px] text-white transition-colors disabled:bg-control disabled:text-ink-faint"
                        >
                          Set
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* 3. The keys. One line, scrolled sideways — never taller. */}
              <div className="mt-1.5 flex items-center gap-1 overflow-x-auto scrollbar-none border-t border-line/50 pt-1.5">
                {kbMode === "keys" &&
                  [...NAV_KEYS, ...NAV_TAIL, ...NAV_ARROWS].map((qk) => (
                    <button
                      key={qk.label}
                      {...repeatProps(qk.key)}
                      disabled={!sessionId}
                      title={qk.title}
                      className={`${keyBtn} shrink-0 px-1.5 text-[10px]`}
                    >
                      {qk.label}
                    </button>
                  ))}

                {comboSet &&
                  comboKeys().map((key) => (
                    <button
                      key={key.label}
                      {...repeatProps(key.seq)}
                      disabled={!sessionId}
                      title={key.title}
                      className={`${keyBtn} shrink-0`}
                    >
                      {key.label}
                    </button>
                  ))}

                {vendor && (
                  <>
                    {vendor.launch.map((cmd) => (
                      <button
                        key={`${vendor.name}-${cmd.label}`}
                        onClick={() => {
                          if (sessionId) sendInput(sessionId, cmd.command);
                        }}
                        disabled={!sessionId}
                        title={cmd.title}
                        className="shrink-0 whitespace-nowrap rounded-control relief select-none px-2 py-0.5 text-[11px] text-purple-300 hover:text-purple-100"
                      >
                        {cmd.label}
                      </button>
                    ))}
                    {[...CODE_COMMON_KEYS, ...vendor.keys].map((qk) => (
                      <button
                        key={`${vendor.name}-${qk.label}`}
                        {...repeatProps(qk.key)}
                        disabled={!sessionId}
                        title={qk.title}
                        className={`${keyBtn} shrink-0`}
                      >
                        {qk.label}
                      </button>
                    ))}
                  </>
                )}

                {kbMode === "git" &&
                  GIT_QUICK_CMDS.map((cmd) => (
                    <button
                      key={cmd.label}
                      onClick={() => {
                        if (sessionId) sendInput(sessionId, cmd.command);
                      }}
                      disabled={!sessionId}
                      title={cmd.title}
                      className={`${keyBtn} shrink-0`}
                    >
                      {cmd.label}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
