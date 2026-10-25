import { useEffect, useRef, useState } from "react";

interface RenamableTabProps {
  /** Tab id, used by the strip's drag-to-reorder hit testing. */
  id?: string;
  /** True while this tab is the one being dragged. */
  dragging?: boolean;
  /** True while this tab is being previewed in the other pane: hold its space. */
  lent?: boolean;
  name: string;
  isActive: boolean;
  existingNames: string[];
  onRename: (name: string) => void;
  onClick: () => void;
  onClose: () => void;
  icon?: React.ReactNode;
  showClose?: boolean;
  /** Viewer tabs are named by their file, so renaming them would be a lie. */
  renamable?: boolean;
  /** Native tooltip — used to show a viewer tab's full path. */
  title?: string;
}

export default function RenamableTab({
  id,
  dragging = false,
  lent = false,
  name,
  isActive,
  existingNames,
  onRename,
  onClick,
  onClose,
  icon,
  showClose = true,
  renamable = true,
  title,
}: RenamableTabProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setEditValue(name);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [editing]);

  const commit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== name && !existingNames.includes(trimmed)) {
      onRename(trimmed);
    }
    setEditing(false);
  };

  return (
    <div
      data-tab-id={id}
      onClick={onClick}
      onDoubleClick={(e) => {
        if (!renamable) return;
        e.stopPropagation();
        setEditing(true);
      }}
      title={title}
      className={`flex shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-control px-3 py-1.5 text-sm my-1 ml-1 ${
        // Only the selected tab is drawn as a pill. Outlining the others was
        // tried and read as busier, not clearer — the strip is short enough
        // that the filled one is unambiguous on its own.
        isActive
          ? "relief text-ink ring-1 ring-inset ring-blue-500/45"
          : "text-ink-dim transition-colors hover:bg-surface/60 hover:text-ink"
      } ${dragging ? "opacity-60 ring-1 ring-inset ring-blue-400/70" : ""} ${lent ? "invisible" : ""}`}
    >
      {icon}
      {editing && renamable ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          /*
           * Deliberately the same type as the label it replaces, and the same
           * line box: it was `text-xs` against the tab's `text-sm`, so
           * double-tapping a tab shrank its name, and `py-0.5` plus the
           * field's border made the tab taller at the same time.
           *
           * `font: inherit` from the preflight carries the tab's 14px/20px
           * down, so dropping the size class is enough. The pill is then two
           * pixels taller than that line box — the border — and one pixel of
           * negative margin each way hands those back, so the outline sits
           * just outside the name without the tab growing around it. A fixed
           * height would have done the same arithmetic by clipping the
           * descenders instead.
           */
          className="field -mx-1 -my-px px-1 py-0 leading-5"
          // Tracks the name rather than sitting at a fixed width, which would
          // stretch a short tab the moment it was renamed. Capped at the same
          // 80px the label truncates to.
          style={{ width: `min(88px, ${Math.max(editValue.length, 4) + 2}ch)` }}
        />
      ) : (
        <span className="truncate max-w-[80px]">{name}</span>
      )}
      {showClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="ml-0.5 p-0.5 rounded-control hover:bg-control-hover text-ink-faint hover:text-ink-muted transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
