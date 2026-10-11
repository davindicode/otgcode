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
/**
 * Each selector in a row gets its own hue, so a label and the value it governs
 * read as one control rather than four words in a line. The label is the same
 * hue held back, which is what pairs them without competing with the value.
 */
const TINTS = {
  sky: { name: "text-sky-400/60", value: "text-sky-300 hover:text-sky-200" },
  emerald: { name: "text-emerald-400/60", value: "text-emerald-300 hover:text-emerald-200" },
} as const;

export default function DropUpSelect<T extends string>({
  value,
  options,
  onChange,
  name,
  tint,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
  /** Hue for this selector. Plain ink when there is only one in the row. */
  tint?: keyof typeof TINTS;
  /**
   * Static label in front of the trigger, for when the current value alone is
   * ambiguous. Outside the button on purpose: what you can tap is the triangle
   * and the value, and a tappable word in front of them only suggests
   * otherwise.
   */
  name?: string;
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
      {name && (
        <span className={`shrink-0 select-none text-[10px] ${tint ? TINTS[tint].name : "text-ink-ghost"}`}>
          {name}:
        </span>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex shrink-0 select-none items-center gap-0.5 pt-0.5 text-[10px] font-medium ${
          tint ? TINTS[tint].value : "text-ink-dim hover:text-ink"
        }`}
      >
        {/* Points the way the menu opens — up, from a drawer at the bottom of
            the screen — and flips once it is open. */}
        <svg
          className="h-2.5 w-2.5 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M10 5l6 10H4l6-10z" />
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
