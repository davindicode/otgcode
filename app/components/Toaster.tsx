import { useEffect, useRef, useState } from "react";
import { type Toast, useToastStore } from "~/stores/toastStore";

const TTL_MS = 3000;

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Slide out, then remove from the store.
  const close = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => dismiss(toast.id), 180);
  };

  // Auto-dismiss after the TTL (also animates out).
  useEffect(() => {
    timer.current = setTimeout(close, TTL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const isError = toast.type === "error";

  return (
    <button
      type="button"
      onClick={close}
      className={`pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-lg shadow-xl text-xs max-w-[90vw] border ${
        isError ? "bg-red-900/95 border-red-600 text-red-100" : "bg-[#1e1e3a]/95 border-gray-600 text-gray-100"
      } ${leaving ? "animate-toast-out" : "animate-toast-in"}`}
      title="Dismiss"
    >
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        {isError ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        )}
      </svg>
      <span className="truncate">{toast.message}</span>
    </button>
  );
}

// App-wide toast layer: small popups centered at the top, above all widgets.
export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed top-3 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
