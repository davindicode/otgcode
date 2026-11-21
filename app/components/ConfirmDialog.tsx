import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Asks before something that cannot be taken back.
 *
 * Escape and a tap outside both cancel, and Cancel is what holds focus, so
 * every way of dismissing this without reading it leaves the thing alone. The
 * same reason the confirm button is not focused: a stray Enter should not be
 * able to do what a stray tap already nearly did.
 */
export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  /** Why it matters. Left out where the title is the whole question. */
  body?: React.ReactNode;
  confirmLabel: string;
  /** Red confirm button, for something destroyed rather than merely closed. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Through a portal because the thing being confirmed is often itself an
  // overlay that dismisses on a mousedown outside its own panel — as a child,
  // this dialog would be "outside", and that mousedown would unmount it before
  // the click on Confirm ever landed.
  return createPortal(
    <div className="scrim fixed inset-0 z-[200] flex items-center justify-center" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass mx-4 w-full max-w-sm rounded-panel p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={`text-sm font-medium text-ink ${body ? "mb-2" : "mb-3"}`}>{title}</h3>
        {body && <div className="mb-3 text-[12px] leading-relaxed text-ink-muted">{body}</div>}
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-ink-dim transition-colors hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-control px-3 py-1.5 text-sm text-white transition-colors relief-accent ${
              danger ? "relief-danger" : ""
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
