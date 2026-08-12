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
  /**
   * Repeat events sharing a key inside the dedupe window are dropped. Stored on
   * the entry so the dedupe index can be rebuilt from a reloaded feed.
   */
  dedupeKey?: string;
  /** Cleared when the panel is opened — drives the badge. */
  seen: boolean;
  /** Cleared when the row is clicked or "mark all as read" runs — drives New/Earlier. */
  read: boolean;
}

type NewNotification = Omit<NotificationEntry, "id" | "createdAt" | "seen" | "read"> & {
  createdAt?: number;
};

interface NotificationCenterValue {
  notifications: NotificationEntry[];
  unseenCount: number;
  unreadCount: number;
  /** Returns the id of the entry this event is represented by, new or deduped. */
  addNotification: (entry: NewNotification) => string;
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

  /**
   * Repeats are recognised here rather than inside the state updater: an updater
   * runs whenever React gets round to it, and the entry's id has to be settled
   * *now* so the caller can hand it to the toast it is about to raise.
   */
  const dedupeIndex = useRef<Map<string, { id: string; at: number }>>(new Map());

  // Swap the feed whenever the signed-in account changes.
  useEffect(() => {
    hydrated.current = userId;
    const loaded = load(userId);
    // Newest first, so the first sighting of a key is the one worth indexing.
    const index = new Map<string, { id: string; at: number }>();
    for (const n of loaded) {
      if (n.dedupeKey && !index.has(n.dedupeKey)) index.set(n.dedupeKey, { id: n.id, at: n.createdAt });
    }
    dedupeIndex.current = index;
    setNotifications(loaded);
  }, [userId]);

  useEffect(() => {
    if (hydrated.current !== userId) return;
    save(userId, notifications);
  }, [notifications, userId]);

  const addNotification = useCallback((entry: NewNotification): string => {
    const { dedupeKey, createdAt, ...rest } = entry;
    const now = createdAt ?? Date.now();

    if (dedupeKey) {
      const previous = dedupeIndex.current.get(dedupeKey);
      // The repeat itself is dropped, but the caller still gets back the entry it
      // stands for, so clicking its toast marks the row already in the feed.
      if (previous && now - previous.at < DEDUPE_WINDOW_MS) return previous.id;
    }

    const id = `${dedupeKey ?? rest.kind}::${now}-${Math.random().toString(36).slice(2, 8)}`;
    if (dedupeKey) {
      dedupeIndex.current.set(dedupeKey, { id, at: now });
      // Keys past the window can no longer dedupe anything; drop them so a long
      // session cannot grow the index without bound.
      for (const [key, seen] of dedupeIndex.current) {
        if (now - seen.at >= DEDUPE_WINDOW_MS) dedupeIndex.current.delete(key);
      }
    }
    setNotifications((prev) =>
      [{ ...rest, dedupeKey, id, createdAt: now, seen: false, read: false }, ...prev].slice(0, MAX_NOTIFICATIONS),
    );
    return id;
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

  // Dismissing an entry has to release its dedupe key too, or the same event
  // repeating moments later would be swallowed with nothing left to show for it.
  const remove = useCallback((id: string) => {
    for (const [key, seen] of dedupeIndex.current) {
      if (seen.id === id) dedupeIndex.current.delete(key);
    }
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clear = useCallback(() => {
    dedupeIndex.current.clear();
    setNotifications([]);
  }, []);

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
