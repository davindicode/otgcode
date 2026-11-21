import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "~/stores/authStore";
import PasswordField from "./PasswordField";

/**
 * A note worth reading once, kept out of the way until it is asked for.
 *
 * Inline rather than a shared component: there is one of these, and a tooltip
 * primitive with a single caller is a file to maintain for nothing. Opens on
 * click rather than on hover because the screen it sits on is used from a
 * phone, where there is no hover and a `title` attribute never appears.
 */
function InfoNote({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="What this means"
        className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[9px] font-semibold text-ink-ghost hover:text-ink-faint"
      >
        i
      </button>
      {open && (
        // Above the icon: this sits low in a short panel, and a note below it
        // would open off the bottom of a phone's viewport.
        <span
          role="tooltip"
          className="glass absolute bottom-full right-0 z-10 mb-1.5 w-52 rounded-control p-2 text-[10px] leading-relaxed text-ink-dim"
        >
          {children}
        </span>
      )}
    </span>
  );
}

/**
 * Full-screen lock shown before anything else when an access password is set.
 * The server enforces the same check on every request and socket, so this is
 * the front door rather than the lock itself.
 */
export default function PasswordGate() {
  const login = useAuthStore((s) => s.login);
  const needsReload = useAuthStore((s) => s.needsReload);
  const user = useAuthStore((s) => s.user);
  const host = useAuthStore((s) => s.host);
  const [password, setPassword] = useState("");
  const [stay, setStay] = useState(false);
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
    const message = await login(password, stay);
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
      <form onSubmit={handleSubmit} className="w-full max-w-xs glass rounded-panel p-6">
        <div className="flex flex-col items-center gap-3">
          <img src="/logo-square.png" alt="" className="h-10 w-10 rounded-control" />
          <div className="text-center">
            <h1 className="text-sm font-semibold text-ink">OTG Code is locked</h1>
            {user && (
              <p className="mt-1 font-mono text-[11px] text-ink">
                {user} <span className="text-ink-ghost">on</span> {host}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5">
          <PasswordField
            inputRef={inputRef}
            value={password}
            onChange={(v) => {
              setPassword(v);
              setError(null);
            }}
            autoComplete="current-password"
            placeholder="Password"
            disabled={busy}
            className="px-3 py-2 text-sm"
          />
        </div>

        {error && (
          <p role="alert" className="mt-2 text-[11px] text-red-400">
            {error}
          </p>
        )}

        {/* The label wraps the box and its words and stops there, so the rest
            of the row is not a toggle. It shares the row with a button now,
            and a full-width label made the gap beside that button one more
            place a tap flipped the tick by accident. */}
        <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-faint">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={stay}
              onChange={(e) => setStay(e.target.checked)}
              disabled={busy}
              className="accent-blue-500"
            />
            Stay signed in until I close the browser
          </label>
          <InfoNote>Left unticked, the session expires after 30 minutes idle.</InfoNote>
        </div>

        <button
          type="submit"
          disabled={busy || !password}
          className="mt-4 flex w-full items-center justify-center gap-2 relief-accent rounded-control px-3 py-2 text-sm font-medium text-white disabled:bg-control disabled:text-ink-faint"
        >
          {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
          {busy ? "Unlocking..." : "Unlock"}
        </button>

        <p className="mt-3 text-center text-[10px] leading-relaxed text-ink-ghost">
          Forgot it? Remove <code className="text-ink-faint">passwordEnabled</code> from{" "}
          <code className="text-ink-faint">~/.otgcode/config.json</code> on the host and restart.
        </p>
      </form>
    </div>
  );
}
