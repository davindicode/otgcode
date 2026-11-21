import { useEffect, useRef, useState } from "react";
import { MIN_PASSWORD_LENGTH } from "~/lib/workspace.shared";
import { useAuthStore } from "~/stores/authStore";
import { useToastStore } from "~/stores/toastStore";
import PasswordField from "./PasswordField";

/**
 * Setting an access password, shown on a fresh install and again from Settings.
 * One dialog for both so the wording and the warning can't drift apart.
 *
 * `onCancel` is absent on first run: there is no app behind this yet, so the
 * only ways out are setting a password or explicitly declining one.
 */
export default function PasswordSetup({ onCancel }: { onCancel?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const setPassword = useAuthStore((s) => s.setPassword);
  const declinePassword = useAuthStore((s) => s.declinePassword);
  const showToast = useToastStore((s) => s.show);

  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (next !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    const message = await setPassword(next);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    showToast("Access password enabled", "info");
    onCancel?.();
  };

  const decline = async () => {
    setBusy(true);
    const message = await declinePassword();
    setBusy(false);
    if (message) {
      setError(message);
      setWarning(false);
      return;
    }
    onCancel?.();
  };

  if (warning) {
    return (
      <Shell>
        <h1 className="text-sm font-semibold text-ink">Leave the app unprotected?</h1>
        <div className="mt-3 space-y-2 text-[11px] leading-relaxed text-ink-muted">
          <p>
            Anyone who opens your tunnel URL gets a terminal on this machine as{" "}
            <span className="font-medium text-ink">{user || "the user that launched it"}</span>, plus read and write
            access to your files. Without a password the URL is the only thing protecting it, and URLs get shared,
            logged and pasted by accident.
          </p>
          <p className="text-ink-faint">
            You can turn a password on at any time from Settings — the cog in the top right of the header.
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-2 text-[11px] text-red-400">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={decline}
            disabled={busy}
            className="relief-accent relief-danger rounded-control px-2.5 py-1 text-xs font-medium text-white disabled:bg-control disabled:text-ink-faint"
          >
            {busy ? "Saving..." : "Don't use a password"}
          </button>
          <button
            type="button"
            onClick={() => setWarning(false)}
            disabled={busy}
            className="relief rounded-control px-2.5 py-1 text-xs text-ink-muted"
          >
            Back
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={submit}>
        <h1 className="text-sm font-semibold text-ink">Set an access password</h1>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
          OTG Code serves a real terminal as {user ? `"${user}"` : "the user that launched it"}. A password keeps
          whoever finds your tunnel URL from using it.
        </p>

        <div className="mt-4 space-y-2">
          <PasswordField
            inputRef={inputRef}
            value={next}
            onChange={(v) => {
              setNext(v);
              setError(null);
            }}
            placeholder="New password"
            autoComplete="new-password"
            disabled={busy}
            className="px-3 py-2 text-sm"
          />
          <PasswordField
            value={confirm}
            onChange={(v) => {
              setConfirm(v);
              setError(null);
            }}
            placeholder="Confirm password"
            autoComplete="new-password"
            disabled={busy}
            className="px-3 py-2 text-sm"
          />
        </div>

        {error && (
          <p role="alert" className="mt-2 text-[11px] text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !next || !confirm}
          className="relief-accent mt-4 flex w-full items-center justify-center gap-2 rounded-control px-3 py-2 text-sm font-medium text-white disabled:bg-control disabled:text-ink-faint"
        >
          {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
          {busy ? "Saving..." : "Set password"}
        </button>

        <div className="mt-3 flex items-center justify-center gap-3 text-[11px]">
          <button
            type="button"
            onClick={() => setWarning(true)}
            disabled={busy}
            className="text-ink-faint transition-colors hover:text-ink-muted"
          >
            Don't use a password
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="text-ink-faint transition-colors hover:text-ink-muted"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="scrim fixed inset-0 z-[300] flex items-center justify-center px-4">
      <div className="glass w-full max-w-xs rounded-panel p-6">{children}</div>
    </div>
  );
}
