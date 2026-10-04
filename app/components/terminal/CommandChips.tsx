import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface Chip {
  label: string;
  /** What gets sent to the terminal. */
  command: string;
  title?: string;
  /** User-added, so removing deletes it rather than hiding a built-in. */
  custom?: boolean;
}

/**
 * A row of runnable command buttons the user can add to and prune.
 *
 * Shared by the cmds group and each CLI's slash commands: both are "a set of
 * one-shot commands, with defaults the user may not want", and a second copy
 * of this would drift from the first.
 */
export default function CommandChips({
  chips,
  hidden,
  disabled,
  chipClass,
  layout = "wrap",
  dialogTitle,
  dialogHint,
  commandPlaceholder,
  onRun,
  onAdd,
  onRemove,
  onRestore,
}: {
  chips: Chip[];
  /** Labels of removed built-ins, offered back while editing. */
  hidden: string[];
  disabled?: boolean;
  chipClass: string;
  /**
   * `wrap` grows downward, up to the three-row cap. `row` stays one line and
   * scrolls sideways, with the controls pinned beside it — for the keyboard,
   * where every row has a fixed height.
   */
  layout?: "wrap" | "row";
  dialogTitle: string;
  dialogHint: string;
  commandPlaceholder: string;
  onRun: (command: string) => void;
  onAdd: (label: string, command: string) => void;
  onRemove: (label: string, isCustom: boolean) => void;
  onRestore: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState(false);
  const row = layout === "row";

  // Same ink as the commands beside them; the glow is what marks edit as armed.
  const actionBtn =
    "px-2 py-0.5 text-[11px] relief rounded-control text-ink-muted hover:text-ink select-none touch-manipulation";

  return (
    <>
      {dialog && (
        <AddCommandDialog
          title={dialogTitle}
          hint={dialogHint}
          commandPlaceholder={commandPlaceholder}
          existing={chips.map((c) => c.label)}
          onAdd={onAdd}
          onClose={() => setDialog(false)}
        />
      )}

      <div className={row ? "flex items-center gap-1" : "chip-rows flex flex-wrap items-center gap-1"}>
        <div
          className={
            row
              ? "flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none"
              : "flex flex-wrap items-center gap-1"
          }
        >
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              disabled={disabled && !editing}
              title={editing ? `Remove "${chip.label}"` : chip.title}
              onClick={() => (editing ? onRemove(chip.label, !!chip.custom) : onRun(chip.command))}
              className={`${chipClass} ${editing ? "relative pr-5 opacity-80" : ""}`}
            >
              {chip.label}
              {editing && (
                <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[11px] leading-none text-red-400">
                  ×
                </span>
              )}
            </button>
          ))}
        </div>

        {/* The controls ride on the same line as the commands they manage; the
            rule keeps them from reading as two more commands. In `row` they are
            outside the scrolling half, so they stay reachable at any scroll. */}
        <span aria-hidden="true" className="mx-0.5 shrink-0 select-none text-ink-ghost">
          |
        </span>
        <button type="button" onClick={() => setDialog(true)} title={dialogTitle} className={`${actionBtn} shrink-0`}>
          +
        </button>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-pressed={editing}
          title={editing ? "Stop removing" : "Remove buttons"}
          className={`${actionBtn} shrink-0 ${editing ? "glow text-amber-300 ring-2 ring-inset ring-amber-400/70" : ""}`}
        >
          {editing ? "done" : "edit"}
        </button>
        {editing && !row && <span className="text-[10px] text-ink-ghost">tap one to remove it</span>}
      </div>

      {editing && hidden.length > 0 && (
        <div className="chip-rows mt-1.5 flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-ink-ghost">removed:</span>
          {hidden.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => onRestore(label)}
              title={`Restore "${label}"`}
              className={`${chipClass} text-[10px] opacity-70`}
            >
              + {label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function AddCommandDialog({
  title,
  hint,
  commandPlaceholder,
  existing,
  onAdd,
  onClose,
}: {
  title: string;
  hint: string;
  commandPlaceholder: string;
  existing: string[];
  onAdd: (label: string, command: string) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [command, setCommand] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const trimmedLabel = label.trim();
  const trimmedCommand = command.trim();
  const duplicate = existing.includes(trimmedLabel);
  const valid = !!trimmedLabel && !!trimmedCommand && !duplicate;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onAdd(trimmedLabel, trimmedCommand);
    onClose();
  };

  return createPortal(
    <div className="scrim fixed inset-0 z-[160] flex items-center justify-center px-4">
      <form onSubmit={submit} className="glass w-full max-w-xs rounded-panel p-4">
        <h2 className="text-xs font-medium text-ink">{title}</h2>
        <p className="mt-0.5 text-[11px] text-ink-faint">{hint}</p>

        <label className="mt-3 block text-[11px] text-ink-dim" htmlFor="cmd-label">
          Button label
        </label>
        <input
          id="cmd-label"
          ref={inputRef}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="deploy"
          className="field mt-1 w-full px-2.5 py-1.5 text-xs"
        />

        <label className="mt-2.5 block text-[11px] text-ink-dim" htmlFor="cmd-command">
          Command
        </label>
        <input
          id="cmd-command"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={commandPlaceholder}
          className="field mt-1 w-full px-2.5 py-1.5 font-mono text-xs"
        />

        {duplicate && <p className="mt-2 text-[11px] text-red-400">"{trimmedLabel}" already exists</p>}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="submit"
            disabled={!valid}
            className="relief-accent rounded-control px-2.5 py-1 text-xs font-medium text-white disabled:bg-control disabled:text-ink-faint"
          >
            Add
          </button>
          <button type="button" onClick={onClose} className="relief rounded-control px-2.5 py-1 text-xs text-ink-muted">
            Cancel
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
