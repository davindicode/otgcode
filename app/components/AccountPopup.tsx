import { useEffect, useRef } from "react";
import { useAuthStore } from "~/stores/authStore";

/** "3 hours ago", give or take — this is orientation, not a stopwatch. */
function sinceLabel(at: number): string {
  const mins = Math.floor((Date.now() - at) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 text-[11px] text-ink-faint">{label}</span>
      <span className="min-w-0 truncate text-right text-[11px] text-ink">{value}</span>
    </div>
  );
}

/**
 * Who you are on the host, and how to stop being signed in.
 *
 * Split out of Settings, which is for how the app behaves. Signing out is not
 * a preference — it ends the thing you are doing — and the shell runs as a
 * particular user, which is worth being able to check without opening a
 * settings page to find it.
 */
export default function AccountPopup({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const enabled = useAuthStore((s) => s.enabled);
  const since = useAuthStore((s) => s.since);
  const logout = useAuthStore((s) => s.logout);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest("[data-header-panel-trigger]")) return;
      if (panelRef.current && !panelRef.current.contains(target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Account"
      className="glass absolute right-2 top-10 z-50 w-64 max-w-[calc(100vw-1rem)] overflow-hidden rounded-panel"
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-xs font-medium text-ink-muted">Account</span>
        <button onClick={onClose} className="text-ink-faint transition-colors hover:text-ink" aria-label="Close">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="px-3 py-2">
        <Row label="User" value={<span className="font-mono">{user || "unknown"}</span>} />
        {enabled ? (
          <Row label="Signed in" value={since === null ? "this session" : sinceLabel(since)} />
        ) : (
          <Row label="Login" value="not required" />
        )}
      </div>

      {enabled ? (
        <div className="border-t border-line px-3 py-2">
          <button
            type="button"
            onClick={logout}
            className="relief w-full rounded-control px-2.5 py-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
          >
            Sign out
          </button>
        </div>
      ) : (
        <p className="border-t border-line px-3 py-2 text-[10px] leading-relaxed text-ink-ghost">
          Anyone with the tunnel URL reaches a shell as this user. Settings can put a password in front of it.
        </p>
      )}
    </div>
  );
}
