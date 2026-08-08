import { useEffect, useRef, useState, type ReactNode } from "react";

export interface SwipeAction {
  key: string;
  label: string;
  icon: ReactNode;
  background: string;
  color?: string;
  onClick: () => void;
}

interface SwipeableRowProps {
  actions: SwipeAction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  actionWidth?: number;
  className?: string;
}

const DRAG_THRESHOLD = 8;

/**
 * A list row whose trailing edge hides a rail of destructive/utility actions.
 * Drag (touch or mouse) to reveal; on pointer devices a grip button fades in on
 * hover so the same actions are reachable without a swipe gesture.
 */
export default function SwipeableRow({
  actions,
  open,
  onOpenChange,
  children,
  actionWidth = 68,
  className = "",
}: SwipeableRowProps) {
  const total = actions.length * actionWidth;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; from: number; axis: "" | "x" | "y"; id: number } | null>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (!dragging) setOffset(open ? -total : 0);
  }, [open, total, dragging]);

  const endDrag = (el: HTMLElement | null) => {
    const state = drag.current;
    drag.current = null;
    setDragging(false);
    if (!state) return;
    if (state.axis === "x" && el) {
      try {
        el.releasePointerCapture(state.id);
      } catch {
        /* pointer already released */
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, from: offset, axis: "", id: e.pointerId };
    moved.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const dx = e.clientX - state.x;
    const dy = e.clientY - state.y;

    if (state.axis === "") {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      // A mostly-vertical gesture belongs to the scroll container, not to us.
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      state.axis = "x";
      moved.current = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    setOffset(Math.max(-total, Math.min(0, state.from + dx)));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const wasDragging = drag.current?.axis === "x";
    const settled = offset;
    endDrag(e.currentTarget);
    if (!wasDragging) return;
    onOpenChange(settled < -total / 2);
  };

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      data-swipe-row=""
      onClickCapture={(e) => {
        // Swallow the click that terminates a drag so the row doesn't also open.
        if (moved.current) {
          e.preventDefault();
          e.stopPropagation();
          moved.current = false;
        }
      }}
    >
      <div className="absolute inset-y-0 right-0 flex" style={{ width: total }}>
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenChange(false);
              action.onClick();
            }}
            className="h-full flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-opacity hover:opacity-90"
            style={{
              width: actionWidth,
              backgroundColor: action.background,
              color: action.color || "#ffffff",
            }}
            tabIndex={open ? 0 : -1}
            aria-hidden={!open}
          >
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      <div
        className="relative group"
        style={{
          transform: `translate3d(${offset}px, 0, 0)`,
          transition: dragging ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          touchAction: "pan-y",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={(e) => endDrag(e.currentTarget)}
      >
        {children}

        {!open && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenChange(true);
            }}
            title="More actions"
            aria-label="More actions"
            className="absolute inset-y-0 right-0 w-12 hidden md:flex items-center justify-end pr-2 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              color: "var(--color-text-muted)",
              background: "linear-gradient(to right, transparent, var(--color-bg-hover) 45%)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
