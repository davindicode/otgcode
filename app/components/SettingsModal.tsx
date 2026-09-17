import { useEffect, useRef, useState } from "react";
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from "~/lib/constants";
import { useAuthStore } from "~/stores/authStore";
import { useTerminalStore } from "~/stores/terminalStore";
import { useToastStore } from "~/stores/toastStore";
import { useWorkspaceStore } from "~/stores/workspaceStore";

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

const inputClass =
  "w-full rounded border border-line bg-app px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-ghost focus:border-blue-500 focus:outline-none disabled:opacity-50";

/** Display preferences. Saved to the workspace file the moment they change. */
function Appearance() {
  const theme = useWorkspaceStore((s) => s.theme);
  const setTheme = useWorkspaceStore((s) => s.setTheme);
  const fontSize = useTerminalStore((s) => s.fontSize);
  const setFontSize = useTerminalStore((s) => s.setFontSize);

  const themeButton = (value: "dark" | "light", label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setTheme(value)}
      aria-pressed={theme === value}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
        theme === value ? "bg-hover text-ink" : "text-ink-dim hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-md border border-line bg-raised p-1">
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

      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-ink-dim">Terminal font size</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFontSize(Math.max(MIN_FONT_SIZE, fontSize - 1))}
            disabled={fontSize <= MIN_FONT_SIZE}
            aria-label="Decrease font size"
            className="rounded border border-line px-2 py-0.5 text-xs text-ink-muted transition-colors hover:text-ink disabled:text-ink-ghost"
          >
            −
          </button>
          <span className="w-7 text-center text-xs tabular-nums text-ink">{fontSize}</span>
          <button
            type="button"
            onClick={() => setFontSize(Math.min(MAX_FONT_SIZE, fontSize + 1))}
            disabled={fontSize >= MAX_FONT_SIZE}
            aria-label="Increase font size"
            className="rounded border border-line px-2 py-0.5 text-xs text-ink-muted transition-colors hover:text-ink disabled:text-ink-ghost"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

/** Set, change or remove the access password. */
function AccessPassword() {
  const enabled = useAuthStore((s) => s.enabled);
  const user = useAuthStore((s) => s.user);
  const setPassword = useAuthStore((s) => s.setPassword);
  const disablePassword = useAuthStore((s) => s.disablePassword);
  const showToast = useToastStore((s) => s.show);

  // `null` = collapsed, showing just the toggle.
  const [form, setForm] = useState<"set" | "change" | "disable" | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setForm(null);
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (form === "disable") {
      setBusy(true);
      const message = await disablePassword(current);
      setBusy(false);
      if (message) {
        setError(message);
        return;
      }
      showToast("Access password removed", "info");
      reset();
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
    const message = await setPassword(next, form === "change" ? current : undefined);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    showToast(form === "change" ? "Access password changed" : "Access password enabled", "info");
    reset();
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-ink-dim">
          {enabled ? (
            <span className="text-green-400">On — a login is required</span>
          ) : (
            <span>Off — anyone with the URL gets in</span>
          )}
        </span>
        {form === null && (
          <button
            type="button"
            onClick={() => setForm(enabled ? "disable" : "set")}
            className={`shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors ${
              enabled ? "border border-line text-ink-muted hover:text-ink" : "bg-blue-600 text-white hover:bg-blue-500"
            }`}
          >
            {enabled ? "Turn off" : "Turn on"}
          </button>
        )}
      </div>

      {enabled && form === null && (
        <button
          type="button"
          onClick={() => setForm("change")}
          className="mt-2 text-[11px] text-blue-400 transition-colors hover:text-blue-300"
        >
          Change password
        </button>
      )}

      {form !== null && (
        <form onSubmit={submit} className="mt-3 space-y-2">
          {(form === "change" || form === "disable") && (
            <input
              type="password"
              value={current}
              onChange={(e) => {
                setCurrent(e.target.value);
                setError(null);
              }}
              placeholder="Current password"
              autoComplete="current-password"
              disabled={busy}
              className={inputClass}
            />
          )}
          {form !== "disable" && (
            <>
              <input
                type="password"
                value={next}
                onChange={(e) => {
                  setNext(e.target.value);
                  setError(null);
                }}
                placeholder="New password"
                autoComplete="new-password"
                disabled={busy}
                className={inputClass}
              />
              <input
                type="password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setError(null);
                }}
                placeholder="Confirm new password"
                autoComplete="new-password"
                disabled={busy}
                className={inputClass}
              />
            </>
          )}

          {error && (
            <p role="alert" className="text-[11px] text-red-400">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="submit"
              disabled={busy}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-ink transition-colors disabled:bg-control disabled:text-ink-faint ${
                form === "disable" ? "bg-red-600 hover:bg-red-500" : "bg-blue-600 hover:bg-blue-500"
              }`}
            >
              {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
              {form === "disable" ? "Turn off" : form === "change" ? "Change" : "Enable"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="rounded border border-line px-2.5 py-1 text-xs text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
            >
              Cancel
            </button>
          </div>

          {form === "set" && (
            <p className="text-[10px] leading-relaxed text-ink-ghost">
              You stay signed in on this device. Every other open tab is signed out.
            </p>
          )}
        </form>
      )}

      {!enabled && form === null && (
        <p className="mt-2 text-[10px] leading-relaxed text-ink-ghost">
          OTG Code serves a real shell as{user ? ` "${user}"` : " the user that launched it"}. With the password off,
          the tunnel URL is the only thing protecting it.
        </p>
      )}
    </div>
  );
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const enabled = useAuthStore((s) => s.enabled);
  const logout = useAuthStore((s) => s.logout);
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
      className="absolute right-2 top-10 z-50 max-h-[min(26rem,calc(100vh-4rem))] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-line bg-surface shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-xs font-medium text-ink-muted">Settings</span>
        <button onClick={onClose} className="text-ink-faint transition-colors hover:text-ink" aria-label="Close">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="divide-y divide-gray-700/60">
        <Section
          title="Access password"
          description="Require a password before the terminal, files and browser panels load. Off by default."
        >
          <AccessPassword />
        </Section>

        {enabled && (
          <Section title="Session" description="Sign out of this device. The password stays enabled.">
            <button
              type="button"
              onClick={logout}
              className="rounded border border-line px-2.5 py-1 text-xs text-ink-muted transition-colors hover:text-ink"
            >
              Sign out
            </button>
          </Section>
        )}
      </div>
    </div>
  );
}
