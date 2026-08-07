import { Bell, Gamepad2, UserPlus, MessageCircle, Award } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useNotificationCenter, type NotificationKind } from "@/context/NotificationCenterContext";

const KIND_ICON: Record<NotificationKind, React.ReactNode> = {
  invite: <Gamepad2 className="w-4 h-4" />,
  friend: <UserPlus className="w-4 h-4" />,
  message: <MessageCircle className="w-4 h-4" />,
  achievement: <Award className="w-4 h-4" />,
};

function timeAgo(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead } = useNotificationCenter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) markAllRead();
      return next;
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        className={cn(
          "relative flex items-center justify-center p-2 rounded-lg transition-colors outline-none hover:bg-surface-hover",
          open && "bg-surface-hover"
        )}
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4 text-secondary" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[9px] font-bold text-white px-1"
            style={{ backgroundColor: "#EF4444" }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl shadow-lg py-1 bg-surface border z-50"
          style={{ insetInlineEnd: 0 }}
        >
          <div className="px-4 py-2.5 border-b">
            <p className="text-sm font-semibold text-primary">Notifications</p>
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-xs text-center text-muted">No notifications yet</p>
          ) : (
            <div className="py-1">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => { n.onClick?.(); setOpen(false); }}
                  className="w-full flex items-start gap-2.5 px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-hover"
                >
                  {n.avatar ? (
                    <img src={n.avatar} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-brand/10 text-brand">
                      {KIND_ICON[n.kind]}
                    </div>
                  )}
                  <span className="flex-1 min-w-0 text-secondary">
                    <span className="block truncate">{n.title}</span>
                    <span className="block text-[10px] text-muted mt-0.5">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
