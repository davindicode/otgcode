import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "~/stores/authStore";

/**
 * Full-screen lock shown before anything else when an access password is set.
 * The server enforces the same check on every request and socket, so this is
 * the front door rather than the lock itself.
 */
export default function PasswordGate() {
  const login = useAuthStore((s) => s.login);
  const needsReload = useAuthStore((s) => s.needsReload);
  const user = useAuthStore((s) => s.user);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    const message = await login(password);
    if (message) {
      setError(message);
      setPassword("");
      setBusy(false);
      inputRef.current?.focus();
      return;
    }
    if (needsReload) {
      window.location.reload();
      return;
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-app px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xs rounded-xl border border-line/70 bg-surface p-6 shadow-2xl"
      >
        <div className="flex flex-col items-center gap-3">
          <img src="/logo-square.png" alt="" className="h-10 w-10 rounded" />
          <div className="text-center">
            <h1 className="text-sm font-semibold text-ink">OTG Code is locked</h1>
            <p className="mt-1 text-[11px] text-ink-faint">
              {user
                ? `Enter the access password to reach ${user}'s terminal.`
                : "Enter the access password to continue."}
            </p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          autoComplete="current-password"
          placeholder="Password"
          disabled={busy}
          className="mt-5 w-full rounded border border-line bg-app px-3 py-2 text-sm text-ink placeholder:text-ink-ghost focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />

        {error && (
          <p role="alert" className="mt-2 text-[11px] text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !password}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:bg-control disabled:text-ink-faint"
        >
          {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
          {busy ? "Unlocking..." : "Unlock"}
        </button>

        <p className="mt-4 text-center text-[10px] leading-relaxed text-ink-ghost">
          Forgot it? Remove <code className="text-ink-faint">passwordEnabled</code> from{" "}
          <code className="text-ink-faint">~/.otgcode/config.json</code> on the host and restart.
        </p>
      </form>
    </div>
  );
}
