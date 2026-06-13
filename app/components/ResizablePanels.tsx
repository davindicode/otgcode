import { type ReactNode, useCallback, useRef, useState } from "react";

interface ResizablePanelsProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}

// Minimum gap between the two dividers in percentage of container width.
// This ensures they never overlap and are always grabbable.
const MIN_DIVIDER_GAP = 2; // ~2% of container = ~20px on a 1000px screen

export default function ResizablePanels({ left, center, right }: ResizablePanelsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState(20);
  const [rightWidth, setRightWidth] = useState(30);
  const dragging = useRef<"left" | "right" | null>(null);

  const handlePointerDown = useCallback(
    (divider: "left" | "right") => {
      dragging.current = divider;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handlePointerMove = (e: PointerEvent) => {
        if (!containerRef.current || !dragging.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;

        if (dragging.current === "left") {
          // Left divider: can go from 0% up to (100% - rightWidth - MIN_DIVIDER_GAP)
          const maxLeft = 100 - rightWidth - MIN_DIVIDER_GAP;
          setLeftWidth(Math.max(0, Math.min(maxLeft, x)));
        } else {
          // Right divider: fromRight can go from 0% up to (100% - leftWidth - MIN_DIVIDER_GAP)
          const fromRight = 100 - x;
          const maxRight = 100 - leftWidth - MIN_DIVIDER_GAP;
          setRightWidth(Math.max(0, Math.min(maxRight, fromRight)));
        }
      };

      const handlePointerUp = () => {
        dragging.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [leftWidth, rightWidth],
  );

  const centerWidth = 100 - leftWidth - rightWidth;

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      {/* Left panel */}
      {leftWidth > 0 && (
        <div className="h-full overflow-hidden shrink-0" style={{ width: `${leftWidth}%` }}>
          {left}
        </div>
      )}

      {/* Left divider */}
      <div className="divider-handle shrink-0" onPointerDown={() => handlePointerDown("left")}>
        <div className="divider-line" />
      </div>

      {/* Center panel */}
      {centerWidth > 0 && <div className="h-full overflow-hidden flex-1 min-w-0">{center}</div>}

      {/* Right divider */}
      <div className="divider-handle shrink-0" onPointerDown={() => handlePointerDown("right")}>
        <div className="divider-line" />
      </div>

      {/* Right panel */}
      {rightWidth > 0 && (
        <div className="h-full overflow-hidden shrink-0" style={{ width: `${rightWidth}%` }}>
          {right}
        </div>
      )}
    </div>
  );
}
