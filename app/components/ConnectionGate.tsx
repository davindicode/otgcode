import { useEffect, useState } from "react";

export default function ConnectionGate() {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDotCount((count) => (count === 3 ? 1 : count + 1));
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className="scrim fixed inset-0 z-[200] flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label="Connecting to the server"
    >
      <div className="flex flex-col items-center gap-4 glass rounded-panel px-8 py-6">
        <div className="spinner" aria-hidden="true" />
        <span className="w-28 text-left text-sm font-medium text-ink-muted">Connecting{".".repeat(dotCount)}</span>
      </div>
    </div>
  );
}
