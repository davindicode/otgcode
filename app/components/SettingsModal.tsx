import { useEffect, useRef, useState } from "react";
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from "~/lib/constants";
import { useSplitRoom } from "~/lib/useSplitRoom";
import { type PaneCount, SPLIT_MIN_WIDTH_PX } from "~/lib/workspace.shared";
import { useAuthStore } from "~/stores/authStore";
import { useTabsStore } from "~/stores/tabsStore";
import { useTerminalStore } from "~/stores/terminalStore";
import { useToastStore } from "~/stores/toastStore";
import { useWorkspaceStore } from "~/stores/workspaceStore";
import PasswordField from "./PasswordField";
import PasswordSetup from "./PasswordSetup";

const MIN_PASSWORD_LENGTH = 6;

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-3">
      <h3 className="text-xs font-medium text-ink-muted">{title}</h3>
      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">{description}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function FontRow({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const step = (delta: number) => onChange(Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value + delta)));
  const button = (delta: number, symbol: string, aria: string) => (
    <button
      type="button"
      onClick={() => step(delta)}
      disabled={delta < 0 ? value <= MIN_FONT_SIZE : value >= MAX_FONT_SIZE}
      aria-label={aria}
      className="relief rounded-control px-2 py-0.5 text-xs text-ink-muted hover:text-ink"
    >
      {symbol}
    </button>
  );
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-ink-dim">{label}</span>
      <div className="flex items-center gap-1">
        {button(-1, "\u2212", `Decrease ${label}`)}
        <span className="w-7 text-center text-xs tabular-nums text-ink">{value}</span>
        {button(1, "+", `Increase ${label}`)}
      </div>
    </div>
  );
}

/** Display preferences. Saved to the workspace file the moment they change. */
function Appearance() {
  const theme = useWorkspaceStore((s) => s.theme);
  const setTheme = useWorkspaceStore((s) => s.setTheme);
  const fontSize = useTerminalStore((s) => s.fontSize);
  const setFontSize = useTerminalStore((s) => s.setFontSize);
  const editorFontSize = useWorkspaceStore((s) => s.editorFontSize);
  const setEditorFontSize = useWorkspaceStore((s) => s.setEditorFontSize);

  const themeButton = (value: "dark" | "light", label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setTheme(value)}
      aria-pressed={theme === value}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-control px-2 py-1.5 text-xs font-medium transition-colors ${
        theme === value ? "bg-hover text-ink" : "text-ink-dim hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-control border border-line bg-raised p-1">
        {themeButton(
          "dark",
          "Dark",
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>,
        )}
        {themeButton(
          "light",
          "Light",
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>,
        )}
      </div>

      <FontRow label="Terminal font size" value={fontSize} onChange={setFontSize} />
      <FontRow label="Editor font size" value={editorFontSize} onChange={setEditorFontSize} />

      <Layout />
    </div>
  );
}

/**
 * One pane or two side by side, and — when there is only room to draw one of
 * the two — which of them that is.
 *
 * The split button stays visible on a narrow screen rather than disappearing:
 * a control that vanishes reads as broken, where a disabled one with a reason
 * reads as "not here". The preference is kept either way, so a tablet turned
 * landscape or a window pulled wider comes back to both panes with every tab
 * where it was left.
 */
function Layout() {
  const panes = useWorkspaceStore((s) => s.panes);
  const setPanes = useWorkspaceStore((s) => s.setPanes);
  const hasRoom = useSplitRoom();
  const focusedPane = useTabsStore((s) => s.focusedPane);
  const focusPane = useTabsStore((s) => s.focusPane);
  const tabs = useTabsStore((s) => s.tabs);

  const choice = (value: PaneCount, label: string, hint: string) => {
    const blocked = value === 2 && !hasRoom;
    return (
      <button
        type="button"
        onClick={() => setPanes(value)}
        disabled={blocked}
        aria-pressed={panes === value}
        title={blocked ? `Needs a window at least ${SPLIT_MIN_WIDTH_PX}px wide and wider than it is tall` : hint}
        className={`flex-1 rounded-control px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          panes === value ? "bg-hover text-ink" : "text-ink-dim hover:text-ink"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <span className="text-xs text-ink-dim">Panes</span>
      <div className="flex gap-1 rounded-control border border-line bg-raised p-1">
        {choice(1, "Single", "One pane, the full width")}
        {choice(2, "Split", "Two panes with a divider you can drag")}
      </div>
      {panes === 2 &&
        (hasRoom ? (
          <p className="text-[11px] leading-relaxed text-ink-ghost">
            Drag a tab onto the other strip to move it there. Double-click the divider to even the panes up.
          </p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-[11px] leading-relaxed text-ink-ghost">
              Not enough room for two panes, so one is shown at a time. Both keep their tabs.
            </p>
            <div className="flex gap-1 rounded-control border border-line bg-raised p-1">
              {([0, 1] as const).map((pane) => (
                <button
                  key={pane}
                  type="button"
                  onClick={() => focusPane(pane)}
                  aria-pressed={focusedPane === pane}
                  className={`flex-1 rounded-control px-2 py-1.5 text-xs font-medium transition-colors ${
                    focusedPane === pane ? "bg-hover text-ink" : "text-ink-dim hover:text-ink"
                  }`}
                >
                  {pane === 0 ? "Left" : "Right"}
                  <span className="ml-1 text-ink-ghost">({tabs.filter((t) => t.pane === pane).length})</span>
                </button>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

/**
 * Turning the password off, or changing it.
 *
 * A dialog rather than a form unfolding inside the settings list: both need the
 * current password, which is a thing to stop and do, and inline they pushed
 * everything below them down the panel while you typed.
 */
function PasswordDialog({ mode, onClose }: { mode: "change" | "disable"; onClose: () => void }) {
  const setPassword = useAuthStore((s) => s.setPassword);
  const disablePassword = useAuthStore((s) => s.disablePassword);
  const showToast = useToastStore((s) => s.show);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (mode === "disable") {
      setBusy(true);
      const message = await disablePassword(current);
      setBusy(false);
      if (message) {
        setError(message);
        return;
      }
      showToast("Access password removed", "info");
      onClose();
      return;
    }

    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (next !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setBusy(true);
    const message = await setPassword(next, current);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    showToast("Access password changed", "info");
    onClose();
  };

  const disabling = mode === "disable";

  return (
    <div
      className="scrim fixed inset-0 z-[170] flex items-center justify-center px-4"
      onMouseDown={(e) => {
        if (!busy && !panelRef.current?.contains(e.target as Node)) onClose();
      }}
    >
      <form
        ref={panelRef}
        onSubmit={submit}
        className="glass w-full max-w-xs rounded-panel p-4"
        aria-label={disabling ? "Turn off the access password" : "Change the access password"}
      >
        <h2 className="text-sm font-medium text-ink">{disabling ? "Turn off the password?" : "Change password"}</h2>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
          {disabling
            ? "The tunnel URL becomes the only thing in front of your shell. Every signed-in device is signed out."
            : "Every signed-in device is signed out, including this one."}
        </p>

        <div className="mt-3 space-y-2">
          <PasswordField
            value={current}
            onChange={(v) => {
              setCurrent(v);
              setError(null);
            }}
            placeholder="Current password"
            autoComplete="current-password"
            disabled={busy}
          />
          {!disabling && (
            <>
              <PasswordField
                value={next}
                onChange={(v) => {
                  setNext(v);
                  setError(null);
                }}
                placeholder="New password"
                autoComplete="new-password"
                disabled={busy}
              />
              <PasswordField
                value={confirm}
                onChange={(v) => {
                  setConfirm(v);
                  setError(null);
                }}
                placeholder="Confirm new password"
                autoComplete="new-password"
                disabled={busy}
              />
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-2 text-[11px] text-red-400">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="submit"
            disabled={busy}
            className={`flex items-center gap-1.5 rounded-control px-2.5 py-1 text-xs font-medium text-white transition-colors disabled:bg-control disabled:text-ink-faint ${
              disabling ? "relief-accent relief-danger" : "relief-accent"
            }`}
          >
            {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
            {disabling ? "Turn off" : "Change"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-control border border-line px-2.5 py-1 text-xs text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/** Whether a password is required, and the two ways to change that. */
function AccessPassword() {
  const enabled = useAuthStore((s) => s.enabled);
  const user = useAuthStore((s) => s.user);

  const [dialog, setDialog] = useState<"change" | "disable" | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-[11px] text-ink-dim">
          {enabled ? (
            <span className="text-green-400">On — a login is required</span>
          ) : (
            <span>Off — anyone with the URL gets in</span>
          )}
        </span>

        {/* One line: what to do about it sits beside what it says. */}
        <div className="flex shrink-0 items-center gap-1.5">
          {enabled ? (
            <>
              <button
                type="button"
                onClick={() => setDialog("disable")}
                className="relief rounded-control px-2 py-1 text-xs text-ink-muted transition-colors hover:text-ink"
              >
                Turn off
              </button>
              <button
                type="button"
                onClick={() => setDialog("change")}
                className="relief rounded-control px-2 py-1 text-xs text-ink-muted transition-colors hover:text-ink"
              >
                Change
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              className="relief-accent rounded-control px-2 py-1 text-xs font-medium text-white"
            >
              Turn on
            </button>
          )}
        </div>
      </div>

      {dialog && <PasswordDialog mode={dialog} onClose={() => setDialog(null)} />}
      {setupOpen && <PasswordSetup onCancel={() => setSetupOpen(false)} />}

      {!enabled && (
        <p className="mt-2 text-[10px] leading-relaxed text-ink-ghost">
          OTG Code serves a real shell as{user ? ` "${user}"` : " the user that launched it"}. With the password off,
          the tunnel URL is the only thing protecting it.
        </p>
      )}
    </div>
  );
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Anchored under the cog rather than a centred overlay, so the trigger stays
  // visible and highlighted while the panel is open (and stays clickable to
  // toggle it back off).
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest("[data-header-panel-trigger]")) return;
      if (panelRef.current && !panelRef.current.contains(target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Settings"
      className="absolute right-2 top-10 z-50 flex max-h-[min(26rem,calc(100vh-4rem))] w-80 max-w-[calc(100vw-1rem)] flex-col overflow-hidden glass rounded-panel"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
        <span className="text-xs font-medium text-ink-muted">Settings</span>
        <button onClick={onClose} className="text-ink-faint transition-colors hover:text-ink" aria-label="Close">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-line/60">
        <Section
          title="Appearance"
          description="Theme and terminal text size. Saved on the host, so they follow you across refreshes and devices."
        >
          <Appearance />
        </Section>

        <Section
          title="Access password"
          description="Require a password before anything loads — terminal, files, and the localhost proxy. Off by default."
        >
          <AccessPassword />
        </Section>
      </div>
    </div>
  );
}
