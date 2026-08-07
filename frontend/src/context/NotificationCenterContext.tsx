import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type NotificationKind = "invite" | "friend" | "message" | "achievement";

export interface NotificationEntry {
  id: string;
  kind: NotificationKind;
  title: string;
  avatar?: string;
  createdAt: number;
  read: boolean;
  onClick?: () => void;
}

interface NotificationCenterValue {
  notifications: NotificationEntry[];
  unreadCount: number;
  addNotification: (entry: Omit<NotificationEntry, "id" | "createdAt" | "read">) => void;
  markAllRead: () => void;
  clear: () => void;
}

const NotificationCenterContext = createContext<NotificationCenterValue | null>(null);

const MAX_NOTIFICATIONS = 30;

export function NotificationCenterProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);

  const addNotification = useCallback((entry: Omit<NotificationEntry, "id" | "createdAt" | "read">) => {
    setNotifications((prev) => [
      {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: Date.now(),
        read: false,
      },
      ...prev,
    ].slice(0, MAX_NOTIFICATIONS));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => (prev.some((n) => !n.read) ? prev.map((n) => ({ ...n, read: true })) : prev));
  }, []);

  const clear = useCallback(() => setNotifications([]), []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationCenterContext.Provider value={{ notifications, unreadCount, addNotification, markAllRead, clear }}>
      {children}
    </NotificationCenterContext.Provider>
  );
}

export function useNotificationCenter() {
  const ctx = useContext(NotificationCenterContext);
  if (!ctx) throw new Error("useNotificationCenter must be used within a NotificationCenterProvider");
  return ctx;
}
