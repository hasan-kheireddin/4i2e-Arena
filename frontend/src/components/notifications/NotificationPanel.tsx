import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import ChatAvatar from "@/components/Chat/ChatAvatar";
import { IconClose, IconDots } from "@/components/Chat/ChatIcons";
import { useFriendships } from "@/context/FriendshipContext";
import { useNotificationCenter, type NotificationEntry } from "@/context/NotificationCenterContext";
import { useToast } from "@/context/ToastContext";
import { acceptFriendRequest, rejectFriendRequest, type FriendshipRecord } from "@/services/chat";
import { openChatBubble } from "@/components/Chat/chatOpener";
import { IconInbox, IconMailOpen, IconSweep } from "./NotificationIcons";
import { KIND_STYLE, relativeTime } from "./notificationKinds";

type FeedItem =
  | { key: string; createdAt: number; isNew: boolean; type: "entry"; entry: NotificationEntry }
  | { key: string; createdAt: number; isNew: boolean; type: "request"; request: FriendshipRecord };

export default function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { notifications, markRead, markAllRead, remove, clear } = useNotificationCenter();
  const { friendships, setFriendships, refresh: refreshFriendships } = useFriendships();
  const { showToast } = useToast();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Incoming requests are read straight off the friendship list so they survive
  // reloads and disappear the moment they are answered anywhere in the app.
  const pendingRequests = friendships.filter((f) => f.status === "pending" && f.direction === "received");

  const items = useMemo<FeedItem[]>(() => {
    const requestItems: FeedItem[] = pendingRequests.map((request) => ({
      key: `request-${request.id}`,
      createdAt: new Date(request.created_at).getTime() || Date.now(),
      isNew: true,
      type: "request",
      request,
    }));
    const entryItems: FeedItem[] = notifications.map((entry) => ({
      key: entry.id,
      createdAt: entry.createdAt,
      isNew: !entry.read,
      type: "entry",
      entry,
    }));
    return [...requestItems, ...entryItems].sort((a, b) => b.createdAt - a.createdAt);
  }, [notifications, pendingRequests]);

  const visible = tab === "unread" ? items.filter((i) => i.isNew) : items;
  const fresh = visible.filter((i) => i.isNew);
  const earlier = visible.filter((i) => !i.isNew);

  const respond = async (f: FriendshipRecord, action: "accept" | "reject") => {
    const name = f.other_display_name || f.other_username;
    setBusyId(f.id);
    try {
      if (action === "accept") {
        const updated = await acceptFriendRequest(f.id);
        setFriendships((prev) => prev.map((x) => (x.id === f.id ? { ...x, ...updated } : x)));
        showToast({
          title: t("notifications.toast_now_friends_title", { name }),
          description: t("notifications.toast_say_hello"),
          variant: "friend_accepted",
          onClick: () => navigate(`/profile/${f.other_user_id}`),
        });
      } else {
        await rejectFriendRequest(f.id);
        setFriendships((prev) => prev.filter((x) => x.id !== f.id));
        showToast({ title: t("notifications.toast_request_declined", { name }), variant: "info", duration: 2500 });
      }
    } catch {
      showToast({ title: t("notifications.toast_failed"), variant: "info" });
    }
    refreshFriendships();
    setBusyId(null);
  };

  const openEntry = (entry: NotificationEntry) => {
    markRead(entry.id);
    // Conversations belong in the chat bubble; only fall back to the full
    // messages page when no bubble is mounted (game screens, /chat itself).
    if (entry.channelId && openChatBubble(entry.channelId)) {
      onClose();
      return;
    }
    if (entry.link) {
      navigate(entry.link);
      onClose();
    }
  };

  return (
    <div className="flex flex-col max-h-[min(32rem,calc(100vh-6rem))]">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5 pb-1">
        <h2 className="text-[19px] font-bold tracking-tight text-primary">{t("notifications.panel_title")}</h2>
        <div className="relative">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            aria-label={t("notifications.options")}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-surface-hover"
            style={{
              color: "var(--color-text-secondary)",
              backgroundColor: menuOpen ? "var(--color-bg-hover)" : undefined,
            }}
          >
            <IconDots size={17} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute z-10 mt-1 w-52 rounded-xl overflow-hidden shadow-xl py-1"
              style={{
                insetInlineEnd: 0,
                backgroundColor: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <MenuItem
                icon={<IconMailOpen size={15} />}
                label={t("notifications.mark_all_read")}
                onClick={() => { markAllRead(); setMenuOpen(false); }}
              />
              <MenuItem
                icon={<IconSweep size={15} />}
                label={t("notifications.clear_all")}
                danger
                onClick={() => { clear(); setMenuOpen(false); }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-2 px-4 pb-2">
        {(["all", "unread"] as const).map((key) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-colors",
                !active && "hover:bg-surface-hover",
              )}
              style={{
                backgroundColor: active ? "rgb(var(--color-primary-rgb) / 0.14)" : "transparent",
                color: active ? "var(--color-primary)" : "var(--color-text-secondary)",
              }}
            >
              {key === "all" ? t("notifications.tab_all") : t("notifications.tab_unread")}
            </button>
          );
        })}
      </div>

      {/* ── Feed ── */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-2">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center gap-2 px-8 py-12">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: "var(--color-bg-input)", color: "var(--color-text-muted)" }}
            >
              <IconInbox size={22} />
            </div>
            <p className="text-[13px] font-semibold text-primary">
              {tab === "unread" ? t("notifications.nothing_unread") : t("notifications.all_caught_up")}
            </p>
            <p className="text-[11.5px] leading-relaxed text-muted">
              {t("notifications.empty_hint")}
            </p>
          </div>
        ) : (
          <>
            {fresh.length > 0 && (
              <>
                <SectionLabel>{t("notifications.section_new")}</SectionLabel>
                {fresh.map((item) => (
                  <Row
                    key={item.key}
                    item={item}
                    busyId={busyId}
                    onRespond={respond}
                    onOpenEntry={openEntry}
                    onRemove={remove}
                    onNavigate={(to) => { navigate(to); onClose(); }}
                  />
                ))}
              </>
            )}
            {earlier.length > 0 && (
              <>
                <SectionLabel>{t("notifications.section_earlier")}</SectionLabel>
                {earlier.map((item) => (
                  <Row
                    key={item.key}
                    item={item}
                    busyId={busyId}
                    onRespond={respond}
                    onOpenEntry={openEntry}
                    onRemove={remove}
                    onNavigate={(to) => { navigate(to); onClose(); }}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 pt-2 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
      {children}
    </p>
  );
}

function MenuItem({
  icon, label, danger, onClick,
}: { icon: React.ReactNode; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] font-medium text-left transition-colors hover:bg-surface-hover"
      style={{ color: danger ? "var(--color-danger)" : "var(--color-text-primary)" }}
    >
      <span style={{ color: danger ? "var(--color-danger)" : "var(--color-text-muted)" }}>{icon}</span>
      {label}
    </button>
  );
}

interface RowProps {
  item: FeedItem;
  busyId: string | null;
  onRespond: (f: FriendshipRecord, action: "accept" | "reject") => void;
  onOpenEntry: (entry: NotificationEntry) => void;
  onRemove: (id: string) => void;
  onNavigate: (to: string) => void;
}

function Row({ item, busyId, onRespond, onOpenEntry, onRemove, onNavigate }: RowProps) {
  const { t } = useTranslation();
  const isRequest = item.type === "request";
  const kind = isRequest ? "friend_request" : item.entry.kind;
  const style = KIND_STYLE[kind];

  const name = isRequest
    ? item.request.other_display_name || item.request.other_username
    : item.entry.actor;
  const avatar = isRequest ? item.request.other_avatar : item.entry.avatar;
  const title = isRequest ? t("notifications.entry_sent_friend_request") : item.entry.title;
  const body = isRequest ? undefined : item.entry.body;

  // Every row answers to a click, whether or not it has somewhere to send you:
  // an entry with no destination still has an unread dot to clear. Gating the
  // handler on `link` was why rows for achievements, levels and chat-only
  // notifications stayed marked new however often they were clicked.
  const activate = () => {
    if (isRequest) onNavigate(`/profile/${item.request.other_user_id}`);
    else onOpenEntry(item.entry);
  };

  return (
    <div
      className="group relative px-2 cursor-pointer"
      onClick={activate}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
    >
      <div className="flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface-hover">
        {/* A person gets an avatar with a kind badge; system rewards get a tile. */}
        {name || avatar ? (
          <div className="relative flex-shrink-0">
            <ChatAvatar src={avatar} name={name} size={48} />
            <span
              className="absolute -bottom-0.5 -right-0.5 w-[22px] h-[22px] rounded-full flex items-center justify-center text-white"
              style={{ backgroundColor: style.color, border: "2px solid var(--color-bg-surface)" }}
              title={t(style.labelKey)}
            >
              {style.icon}
            </span>
          </div>
        ) : (
          <span
            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `rgb(${style.rgb} / 0.14)`, color: style.color }}
            title={t(style.labelKey)}
          >
            <span className="scale-[1.7] flex">{style.icon}</span>
          </span>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] leading-snug text-secondary">
            {name && <span className="font-semibold text-primary">{name} </span>}
            {title}
          </p>
          {body && <p className="text-[12px] leading-snug mt-0.5 text-muted">{body}</p>}
          <p
            className="text-[11.5px] font-semibold mt-1"
            style={{ color: item.isNew ? "var(--color-primary)" : "var(--color-text-muted)" }}
          >
            {relativeTime(item.createdAt, t)}
          </p>

          {isRequest && (
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                disabled={busyId === item.request.id}
                onClick={(e) => { e.stopPropagation(); onRespond(item.request, "accept"); }}
                className="px-5 py-1.5 rounded-lg text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundImage: "var(--gradient-brand)" }}
              >
                {t("notifications.confirm")}
              </button>
              <button
                type="button"
                disabled={busyId === item.request.id}
                onClick={(e) => { e.stopPropagation(); onRespond(item.request, "reject"); }}
                className="px-5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors hover:bg-surface-hover disabled:opacity-50"
                style={{ backgroundColor: "var(--color-bg-input)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
              >
                {t("notifications.delete")}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 flex-shrink-0 pt-1">
          {item.isNew && (
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundImage: "var(--gradient-brand)" }}
              title={t("notifications.unread")}
            />
          )}
          {!isRequest && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(item.entry.id); }}
              aria-label={t("notifications.remove_notification")}
              title={t("notifications.remove")}
              className="w-6 h-6 rounded-full items-center justify-center hidden group-hover:flex transition-colors hover:bg-surface-hover"
              style={{ color: "var(--color-text-muted)" }}
            >
              <IconClose size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
