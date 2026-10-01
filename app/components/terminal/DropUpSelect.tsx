import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Pick-one selector that opens upward, sitting to the left of the buttons it
 * governs so it reads as their prefix.
 *
 * Opens upward and through a portal because it lives in the input drawer at
 * the bottom of the screen: a downward menu would be off-screen, and the
 * drawer clips its own overflow.
 */
export default function DropUpSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
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

  const current = options.find((o) => o.id === value) ?? options[0];

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex shrink-0 select-none items-center gap-0.5 pt-0.5 text-[10px] font-medium text-ink-dim hover:text-ink"
      >
        <svg
          className="h-2.5 w-2.5 transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M6 4l8 6-8 6V4z" />
        </svg>
        {current?.label}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="glass fixed min-w-[80px] rounded-control py-0.5"
            style={{
              zIndex: 9999,
              ...(() => {
                const r = buttonRef.current?.getBoundingClientRect();
                return r ? { left: r.left, bottom: window.innerHeight - r.top + 4 } : {};
              })(),
            }}
          >
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-1 text-left text-[11px] transition-colors hover:bg-hover ${
                  o.id === value ? "text-blue-400" : "text-ink-muted"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
