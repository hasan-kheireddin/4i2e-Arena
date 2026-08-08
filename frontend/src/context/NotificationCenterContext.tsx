import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";

/**
 * Direct messages deliberately have no kind here: they surface as chat toasts
 * and unread bubbles, which is enough. The bell is for things that happened
 * *to the account* and would otherwise be missed.
 */
export type NotificationKind =
  | "friend_request"
  | "friend_accepted"
  | "invite"
  | "achievement"
  | "level"
  | "xp"
  | "system";

export interface NotificationEntry {
  id: string;
  kind: NotificationKind;
  /** Name rendered in semibold ahead of the title, when the event has an actor. */
  actor?: string;
  title: string;
  body?: string;
  avatar?: string;
  /** In-app route opened when the row is clicked. */
  link?: string;
  /** Conversation to open in the chat bubble; takes precedence over `link`. */
  channelId?: string;
  createdAt: number;
  /** Cleared when the panel is opened — drives the badge. */
  seen: boolean;
  /** Cleared when the row is clicked or "mark all as read" runs — drives New/Earlier. */
  read: boolean;
}

type NewNotification = Omit<NotificationEntry, "id" | "createdAt" | "seen" | "read"> & {
  /** Repeat events sharing a key inside the dedupe window are dropped. */
  dedupeKey?: string;
  createdAt?: number;
};

interface NotificationCenterValue {
  notifications: NotificationEntry[];
  unseenCount: number;
  unreadCount: number;
  addNotification: (entry: NewNotification) => void;
  markAllSeen: () => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

const NotificationCenterContext = createContext<NotificationCenterValue | null>(null);

const MAX_NOTIFICATIONS = 40;
const DEDUPE_WINDOW_MS = 15_000;
const STORAGE_PREFIX = "firearena.notifications.";

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function load(userId: string | undefined): NotificationEntry[] {
  if (!userId) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is NotificationEntry => !!n && typeof n.id === "string" && typeof n.title === "string");
  } catch {
    return [];
  }
}

function save(userId: string | undefined, entries: NotificationEntry[]) {
  if (!userId) return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(entries));
  } catch {
    /* storage unavailable — the feed stays session-only */
  }
}

export function NotificationCenterProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const hydrated = useRef<string | undefined>(undefined);

  // Swap the feed whenever the signed-in account changes.
  useEffect(() => {
    hydrated.current = userId;
    setNotifications(load(userId));
  }, [userId]);

  useEffect(() => {
    if (hydrated.current !== userId) return;
    save(userId, notifications);
  }, [notifications, userId]);

  const addNotification = useCallback((entry: NewNotification) => {
    const { dedupeKey, createdAt, ...rest } = entry;
    const now = createdAt ?? Date.now();
    setNotifications((prev) => {
      if (dedupeKey) {
        const duplicate = prev.some(
          (n) => n.id.startsWith(`${dedupeKey}::`) && now - n.createdAt < DEDUPE_WINDOW_MS,
        );
        if (duplicate) return prev;
      }
      const id = `${dedupeKey ?? rest.kind}::${now}-${Math.random().toString(36).slice(2, 8)}`;
      return [{ ...rest, id, createdAt: now, seen: false, read: false }, ...prev].slice(0, MAX_NOTIFICATIONS);
    });
  }, []);

  const markAllSeen = useCallback(() => {
    setNotifications((prev) => (prev.some((n) => !n.seen) ? prev.map((n) => ({ ...n, seen: true })) : prev));
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true, seen: true } : n)));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) =>
      prev.some((n) => !n.read || !n.seen) ? prev.map((n) => ({ ...n, read: true, seen: true })) : prev,
    );
  }, []);

  const remove = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clear = useCallback(() => setNotifications([]), []);

  const value = useMemo<NotificationCenterValue>(() => ({
    notifications,
    unseenCount: notifications.filter((n) => !n.seen).length,
    unreadCount: notifications.filter((n) => !n.read).length,
    addNotification,
    markAllSeen,
    markRead,
    markAllRead,
    remove,
    clear,
  }), [notifications, addNotification, markAllSeen, markRead, markAllRead, remove, clear]);

  return (
    <NotificationCenterContext.Provider value={value}>
      {children}
    </NotificationCenterContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotificationCenter() {
  const ctx = useContext(NotificationCenterContext);
  if (!ctx) throw new Error("useNotificationCenter must be used within a NotificationCenterProvider");
  return ctx;
}
