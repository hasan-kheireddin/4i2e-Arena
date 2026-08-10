import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useNotificationCenter } from "@/context/NotificationCenterContext";
import { useFriendships } from "@/context/FriendshipContext";
import NotificationPanel from "@/components/notifications/NotificationPanel";
import { IconBellRinging } from "@/components/notifications/NotificationIcons";

export function NotificationBell() {
  const { unseenCount, markAllSeen } = useNotificationCenter();
  const { friendships } = useFriendships();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const pendingCount = friendships.filter(
    (f) => f.status === "pending" && f.direction === "received",
  ).length;
  const badgeCount = unseenCount + pendingCount;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Opening clears the badge but leaves rows in "New" until they are read.
    // Kept out of the setOpen updater: React runs updaters during render, and
    // touching another component's state there is a render-phase update.
    if (next) markAllSeen();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        className={cn(
          "relative flex items-center justify-center w-9 h-9 rounded-full transition-colors outline-none hover:bg-surface-hover",
        )}
        style={{
          backgroundColor: open ? "rgb(var(--color-primary-rgb) / 0.14)" : "var(--color-bg-input)",
          color: open ? "var(--color-primary)" : "var(--color-text-secondary)",
        }}
        aria-label={badgeCount > 0 ? `Notifications, ${badgeCount} new` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <IconBellRinging size={18} />
        {badgeCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] flex items-center justify-center rounded-full text-[9.5px] font-bold text-white px-1"
            style={{ backgroundColor: "var(--color-secondary)", border: "2px solid var(--color-bg-surface)" }}
          >
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute top-full mt-2 w-[min(calc(100vw-2rem),380px)] rounded-2xl overflow-hidden z-50"
          style={{
            insetInlineEnd: 0,
            backgroundColor: "var(--color-bg-surface)",
            border: "1px solid var(--color-border)",
            boxShadow: "0 24px 60px -18px var(--color-shadow), 0 0 0 1px rgb(var(--color-primary-rgb) / 0.05)",
          }}
        >
          <NotificationPanel onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
