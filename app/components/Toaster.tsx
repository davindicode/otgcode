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
      className={`pointer-events-auto max-w-[90vw] rounded-panel px-3.5 py-2 text-xs ${
        isError ? "glass glass-danger text-red-100" : "glass toast text-ink"
      } ${leaving ? "animate-toast-out" : "animate-toast-in"}`}
      title="Dismiss"
    >
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
