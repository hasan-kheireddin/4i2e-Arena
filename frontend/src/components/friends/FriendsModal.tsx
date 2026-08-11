import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import ChatAvatar from "@/components/Chat/ChatAvatar";
import {
  IconChat,
  IconClose,
  IconSearch,
  IconUserCheck,
  IconUserPlus,
} from "@/components/Chat/ChatIcons";
import { openChatBubble } from "@/components/Chat/chatOpener";
import { useFriendships } from "@/context/FriendshipContext";
import { useToast } from "@/context/ToastContext";
import {
  acceptFriendRequest,
  getOrCreateDM,
  rejectFriendRequest,
  removeFriend,
  type FriendshipRecord,
} from "@/services/chat";

export type FriendsTab = "friends" | "pending";

interface FriendsModalProps {
  onClose: () => void;
  /** Which tab opens first — the header count opens "friends", the badge "pending". */
  initialTab?: FriendsTab;
  /** Presence set from the chat socket; rows render a live dot when supplied. */
  onlineUserIds?: Set<string>;
}

/**
 * The people surface behind the profile header's friend count: accepted friends
 * and both directions of pending requests, in one centred dialog.
 *
 * Only ever rendered for your own profile — the API exposes no one else's
 * friend list, and requests are private by definition.
 */
export default function FriendsModal({ onClose, initialTab = "friends", onlineUserIds }: FriendsModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { friendships, setFriendships, refresh: refreshFriendships } = useFriendships();
  const { showToast } = useToast();

  const [tab, setTab] = useState<FriendsTab>(initialTab);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<FriendshipRecord | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape backs out of the confirmation first, then the dialog.
      if (pendingRemoval) setPendingRemoval(null);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, pendingRemoval]);

  const friends = useMemo(
    () => friendships.filter((f) => f.status === "accepted"),
    [friendships],
  );
  const received = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.direction === "received"),
    [friendships],
  );
  const sent = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.direction === "sent"),
    [friendships],
  );

  const match = (f: FriendshipRecord) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      f.other_username.toLowerCase().includes(q) ||
      (f.other_display_name || "").toLowerCase().includes(q)
    );
  };

  const visibleFriends = friends.filter(match);
  const visibleReceived = received.filter(match);
  const visibleSent = sent.filter(match);

  const openProfile = (userId: string) => {
    navigate(`/profile/${userId}`);
    onClose();
  };

  const openMessage = async (f: FriendshipRecord) => {
    try {
      const channel = await getOrCreateDM(f.other_user_id);
      // Conversations belong in the floating bubble; fall back to the full
      // messages page on the screens that mount no bubble.
      if (!openChatBubble(channel.id)) navigate(`/chat?channel=${channel.id}`);
      onClose();
    } catch {
      showToast({ title: t("friends.dm_failed"), variant: "info" });
    }
  };

  const respond = async (f: FriendshipRecord, action: "accept" | "reject") => {
    const name = f.other_display_name || f.other_username;
    setBusyId(f.id);
    try {
      if (action === "accept") {
        const updated = await acceptFriendRequest(f.id);
        setFriendships((prev) => prev.map((x) => (x.id === f.id ? { ...x, ...updated } : x)));
        showToast({
          title: t("friends.now_friends", { name }),
          description: t("friends.now_friends_desc"),
          variant: "friend_accepted",
          onClick: () => navigate(`/profile/${f.other_user_id}`),
        });
      } else {
        await rejectFriendRequest(f.id);
        setFriendships((prev) => prev.filter((x) => x.id !== f.id));
        showToast({ title: t("friends.declined", { name }), variant: "info", duration: 2500 });
      }
    } catch {
      showToast({ title: t("friends.action_failed"), variant: "info" });
    }
    refreshFriendships();
    setBusyId(null);
  };

  /** Cancels an outgoing request — the same DELETE that removes a friend. */
  const cancelRequest = async (f: FriendshipRecord) => {
    setBusyId(f.id);
    try {
      await removeFriend(f.id);
      setFriendships((prev) => prev.filter((x) => x.id !== f.id));
    } catch {
      showToast({ title: t("friends.action_failed"), variant: "info" });
    }
    refreshFriendships();
    setBusyId(null);
  };

  const confirmRemoval = async () => {
    const f = pendingRemoval;
    if (!f) return;
    setBusyId(f.id);
    try {
      await removeFriend(f.id);
      setFriendships((prev) => prev.filter((x) => x.id !== f.id));
      showToast({
        title: t("friends.removed", { name: f.other_display_name || f.other_username }),
        variant: "info",
        duration: 2500,
      });
    } catch {
      showToast({ title: t("friends.action_failed"), variant: "info" });
    }
    refreshFriendships();
    setBusyId(null);
    setPendingRemoval(null);
  };

  const tabs: { key: FriendsTab; label: string; count: number; badge?: number }[] = [
    { key: "friends", label: t("friends.tab_friends"), count: friends.length },
    {
      key: "pending",
      label: t("friends.tab_pending"),
      count: received.length + sent.length,
      badge: received.length,
    },
  ];

  // Portalled to <body>: any ancestor with a transform, filter or backdrop-filter
  // would otherwise become the containing block and trap the fixed backdrop
  // inside the page content, leaving the navbar and chat bubble undimmed.
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-base/85 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("friends.title")}
        className="relative z-10 flex w-full max-w-[440px] flex-col overflow-hidden rounded-2xl animate-scale-in"
        style={{
          maxHeight: "min(38rem, calc(100vh - 5rem))",
          backgroundColor: "var(--color-bg-surface)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 32px 96px -28px var(--color-shadow), 0 0 0 1px rgb(var(--color-primary-rgb) / 0.05)",
        }}
      >
        {/* ── Header ── */}
        <div
          className="relative flex items-center justify-center px-4 py-3.5"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <h2 className="text-[17px] font-bold tracking-tight text-primary">{t("friends.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("friends.close")}
            className="absolute flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-surface-hover"
            style={{ insetInlineEnd: "0.75rem", color: "var(--color-text-secondary)" }}
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-2 px-4 pt-3">
          {tabs.map((item) => {
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                  !active && "hover:bg-surface-hover",
                )}
                style={{
                  backgroundColor: active ? "rgb(var(--color-primary-rgb) / 0.14)" : "transparent",
                  color: active ? "var(--color-primary)" : "var(--color-text-secondary)",
                }}
              >
                {item.label}
                <span
                  className="text-[12px] font-bold tabular-nums"
                  style={{ color: active ? "var(--color-primary)" : "var(--color-text-muted)" }}
                >
                  {item.count}
                </span>
                {!active && !!item.badge && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundImage: "var(--gradient-brand)" }}
                    title={t("friends.awaiting_reply", { count: item.badge })}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Search ── */}
        <div className="px-4 pb-3 pt-3">
          <div
            className="flex items-center gap-2.5 rounded-xl px-3 py-2"
            style={{ backgroundColor: "var(--color-bg-input)", border: "1px solid var(--color-border)" }}
          >
            <span style={{ color: "var(--color-text-muted)" }}>
              <IconSearch size={15} />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("friends.search")}
              aria-label={t("friends.search_label")}
              className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-muted"
              style={{ color: "var(--color-text-primary)" }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("friends.clear_search")}
                className="flex h-5 w-5 items-center justify-center rounded-full transition-colors hover:bg-surface-hover"
                style={{ color: "var(--color-text-muted)" }}
              >
                <IconClose size={12} />
              </button>
            )}
          </div>
        </div>

        {/* ── List ── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {tab === "friends" ? (
            visibleFriends.length === 0 ? (
              <EmptyState
                icon={<IconUserCheck size={22} />}
                title={query ? t("friends.no_matches") : t("friends.empty_friends_title")}
                body={
                  query
                    ? t("friends.no_friend_matches", { query: query.trim() })
                    : t("friends.empty_friends_body")
                }
              />
            ) : (
              visibleFriends.map((f) => (
                <PersonRow
                  key={f.id}
                  record={f}
                  online={onlineUserIds?.has(f.other_user_id)}
                  onOpen={() => openProfile(f.other_user_id)}
                >
                  <GhostButton label={t("friends.message")} onClick={() => void openMessage(f)}>
                    <IconChat size={15} />
                  </GhostButton>
                  <SecondaryButton disabled={busyId === f.id} onClick={() => setPendingRemoval(f)}>
                    {t("friends.remove")}
                  </SecondaryButton>
                </PersonRow>
              ))
            )
          ) : visibleReceived.length === 0 && visibleSent.length === 0 ? (
            <EmptyState
              icon={<IconUserPlus size={22} />}
              title={query ? t("friends.no_matches") : t("friends.empty_pending_title")}
              body={
                query
                  ? t("friends.no_pending_matches", { query: query.trim() })
                  : t("friends.empty_pending_body")
              }
            />
          ) : (
            <>
              {visibleReceived.length > 0 && (
                <>
                  <SectionLabel>{t("friends.section_received")}</SectionLabel>
                  {visibleReceived.map((f) => (
                    <PersonRow
                      key={f.id}
                      record={f}
                      online={onlineUserIds?.has(f.other_user_id)}
                      onOpen={() => openProfile(f.other_user_id)}
                    >
                      <PrimaryButton
                        disabled={busyId === f.id}
                        onClick={() => void respond(f, "accept")}
                      >
                        {t("friends.confirm")}
                      </PrimaryButton>
                      <SecondaryButton
                        disabled={busyId === f.id}
                        onClick={() => void respond(f, "reject")}
                      >
                        {t("friends.delete")}
                      </SecondaryButton>
                    </PersonRow>
                  ))}
                </>
              )}
              {visibleSent.length > 0 && (
                <>
                  <SectionLabel>{t("friends.section_sent")}</SectionLabel>
                  {visibleSent.map((f) => (
                    <PersonRow
                      key={f.id}
                      record={f}
                      online={onlineUserIds?.has(f.other_user_id)}
                      onOpen={() => openProfile(f.other_user_id)}
                      note={t("friends.request_sent")}
                    >
                      <SecondaryButton
                        disabled={busyId === f.id}
                        onClick={() => void cancelRequest(f)}
                      >
                        {t("friends.cancel")}
                      </SecondaryButton>
                    </PersonRow>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* ── Remove confirmation ── */}
        {pendingRemoval && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center p-6 animate-fade-in"
            style={{ backgroundColor: "rgb(var(--color-background-rgb) / 0.78)", backdropFilter: "blur(4px)" }}
            onClick={() => setPendingRemoval(null)}
          >
            <div
              className="w-full max-w-[300px] rounded-2xl p-5 text-center animate-scale-in"
              style={{
                backgroundColor: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                boxShadow: "0 32px 96px -28px var(--color-shadow)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex justify-center">
                <ChatAvatar
                  src={pendingRemoval.other_avatar}
                  name={pendingRemoval.other_display_name || pendingRemoval.other_username}
                  size={64}
                />
              </div>
              <p className="text-[14px] font-semibold text-primary">
                {t("friends.remove_title", {
                  name: pendingRemoval.other_display_name || pendingRemoval.other_username,
                })}
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                {t("friends.remove_body")}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={busyId === pendingRemoval.id}
                  onClick={() => void confirmRemoval()}
                  className="flex-1 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-danger)" }}
                >
                  {t("friends.remove")}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingRemoval(null)}
                  className="flex-1 rounded-lg px-4 py-2 text-[12.5px] font-semibold transition-colors hover:bg-surface-hover"
                  style={{
                    backgroundColor: "var(--color-bg-input)",
                    color: "var(--color-text-secondary)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {t("friends.cancel")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
      {children}
    </p>
  );
}

function PersonRow({
  record, online, note, onOpen, children,
}: {
  record: FriendshipRecord;
  online?: boolean;
  note?: string;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  const name = record.other_display_name || record.other_username;

  return (
    <div
      className="group cursor-pointer px-2"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface-hover">
        <ChatAvatar
          src={record.other_avatar}
          name={name}
          size={44}
          online={online}
          ringColor="var(--color-bg-surface)"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-primary">{name}</p>
          <p className="truncate text-[12px] text-muted">
            {note ? `@${record.other_username} · ${note}` : `@${record.other_username}`}
          </p>
        </div>
        <div
          className="flex flex-shrink-0 items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function PrimaryButton({
  children, disabled, onClick,
}: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg px-4 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      style={{ backgroundImage: "var(--gradient-brand)" }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children, disabled, onClick,
}: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg px-4 py-1.5 text-[12.5px] font-semibold transition-colors hover:bg-surface-hover disabled:opacity-50"
      style={{
        backgroundColor: "var(--color-bg-input)",
        color: "var(--color-text-secondary)",
        border: "1px solid var(--color-border)",
      }}
    >
      {children}
    </button>
  );
}

function GhostButton({
  children, label, onClick,
}: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-hover"
      style={{ color: "var(--color-text-secondary)" }}
    >
      {children}
    </button>
  );
}

function EmptyState({
  icon, title, body,
}: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-8 py-12 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ backgroundColor: "var(--color-bg-input)", color: "var(--color-text-muted)" }}
      >
        {icon}
      </div>
      <p className="text-[13px] font-semibold text-primary">{title}</p>
      <p className="text-[11.5px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}
