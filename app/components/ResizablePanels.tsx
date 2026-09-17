import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PANE_SPLIT, MAX_PANE_SPLIT, MIN_PANE_SPLIT } from "~/lib/workspace.shared";
import { useWorkspaceStore } from "~/stores/workspaceStore";

interface ResizablePanelsProps {
  left: ReactNode;
  right: ReactNode;
}

/** Two-column split: file explorer on the left, terminal on the right. */
export default function ResizablePanels({ left, right }: ResizablePanelsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const storedSplit = useWorkspaceStore((s) => s.paneSplit);
  const setPaneSplit = useWorkspaceStore((s) => s.setPaneSplit);
  // Track the drag locally and persist on release: writing every pointermove
  // would re-render the whole tree and hammer the workspace file.
  const [leftWidth, setLeftWidth] = useState(storedSplit);
  const dragging = useRef(false);
  const latest = useRef(storedSplit);

  useEffect(() => {
    if (!dragging.current) setLeftWidth(storedSplit);
  }, [storedSplit]);

  const handlePointerDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (e: PointerEvent) => {
      if (!containerRef.current || !dragging.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      latest.current = Math.max(MIN_PANE_SPLIT, Math.min(MAX_PANE_SPLIT, x));
      setLeftWidth(Math.max(MIN_PANE_SPLIT, Math.min(MAX_PANE_SPLIT, x)));
    };

    const handlePointerUp = () => {
      dragging.current = false;
      setPaneSplit(Math.round(latest.current));
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }, [setPaneSplit]);

  // Shared by the keyboard handler and the double-click reset.
  const commit = (percent: number) => {
    const clamped = Math.max(MIN_PANE_SPLIT, Math.min(MAX_PANE_SPLIT, Math.round(percent)));
    latest.current = clamped;
    setLeftWidth(clamped);
    setPaneSplit(clamped);
  };
  const reset = () => commit(DEFAULT_PANE_SPLIT);

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      {/* Pixel floor as well as the percentage one: on a 1024px window the
          minimum percentage is still too narrow for the explorer toolbar. */}
      <div className="h-full overflow-hidden shrink-0 min-w-[240px]" style={{ width: `${leftWidth}%` }}>
        {left}
      </div>

      <div
        className="divider-handle shrink-0"
        onPointerDown={handlePointerDown}
        onDoubleClick={reset}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") commit(leftWidth - 2);
          else if (e.key === "ArrowRight") commit(leftWidth + 2);
          else if (e.key === "Home" || e.key === "Enter") reset();
          else return;
          e.preventDefault();
        }}
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize panels"
        aria-valuenow={Math.round(leftWidth)}
        aria-valuemin={MIN_PANE_SPLIT}
        aria-valuemax={MAX_PANE_SPLIT}
      >
        <div className="divider-line" />
      </div>

      <div className="h-full overflow-hidden flex-1 min-w-0">{right}</div>
    </div>
  );
}
