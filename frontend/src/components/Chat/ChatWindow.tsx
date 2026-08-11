import { useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import ChatBubble from "./ChatBubble";
import ChatAvatar from "./ChatAvatar";
import EmotePalette from "./EmotePalette";
import {
  IconArrowLeft,
  IconBell,
  IconBellOff,
  IconBlock,
  IconClock,
  IconDots,
  IconGamepad,
  IconReaction,
  IconSend,
  IconUnblock,
  IconUser,
  IconUserCheck,
  IconUserMinus,
  IconUserPlus,
} from "./ChatIcons";
import type { EmoteDef } from "../../assets/emotes/emotes";
import { useIsRtl } from "../../hooks/useDirection";
import type { ChatMessage, TypingUser } from "./useChatSocket";

interface ChatWindowProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  onSendEmote: (emoteId: string) => void;
  currentUserId: string | null;
  title: string;
  loading?: boolean;
  noBorder?: boolean;
  typingUsers?: TypingUser[];
  onTyping?: () => void;
  onTitleClick?: () => void;
  /** Shown on narrow layouts to return to the conversation list. */
  onBack?: () => void;
  partnerAvatar?: string | null;
  partnerOnline?: boolean;
  isMuted?: boolean;
  onToggleMute?: () => void;
  blockedUserIds?: Set<string>;
  dmPartnerId?: string | null;
  onBlockUser?: (userId: string) => void;
  onUnblock?: () => void;
  onProfileClick?: (userId: string) => void;
  onInviteGame?: (userId: string, userName?: string) => void;
  friendUserIds?: Set<string>;
  pendingSentIds?: Set<string>;
  pendingReceivedIds?: Set<string>;
  onFriendAction?: (userId: string) => void;
  dmPartnerReadUntil?: string | null;
  sendGameInviteResponse?: (channelId: string, gameType: string, gameId: string, accept: boolean) => void;
}

interface MenuItem {
  key: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  danger?: boolean;
  accent?: boolean;
  separatorBefore?: boolean;
  /** Destructive entries ask once, inside the menu, before firing. */
  confirm?: { title: string; body: string; action: string };
  onClick: () => void;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toDateString();
}

function dayLabel(iso: string, t: TFunction, locale: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startOfToday) return t("chat.today");
  if (d.getTime() >= startOfToday - 86_400_000) return t("chat.yesterday");
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

export default function ChatWindow({
  messages,
  onSendMessage,
  onSendEmote,
  currentUserId,
  title,
  loading,
  noBorder,
  typingUsers,
  onTyping,
  onTitleClick,
  onBack,
  partnerAvatar,
  partnerOnline,
  isMuted,
  onToggleMute,
  blockedUserIds,
  dmPartnerId,
  onBlockUser,
  onUnblock,
  onProfileClick,
  onInviteGame,
  friendUserIds,
  pendingSentIds,
  pendingReceivedIds,
  onFriendAction,
  dmPartnerReadUntil,
  sendGameInviteResponse,
}: ChatWindowProps) {
  const { t, i18n } = useTranslation();
  const isRtl = useIsRtl();
  const [input, setInput] = useState("");
  const [showEmotes, setShowEmotes] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmItem, setConfirmItem] = useState<MenuItem | null>(null);
  const [contextMsg, setContextMsg] = useState<{ id: string; sender: string; username?: string; x: number; y: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef(onTyping);
  typingRef.current = onTyping;

  const isBlocked = !!(blockedUserIds && dmPartnerId && blockedUserIds.has(dmPartnerId));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const close = () => {
      setContextMsg(null);
      setShowMenu(false);
      setConfirmItem(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput("");
  };

  const handleEmote = (emote: EmoteDef) => {
    onSendEmote(emote.id);
    setShowEmotes(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    typingRef.current?.();
  };

  const handleContextMenu = (e: React.MouseEvent, msg: ChatMessage) => {
    if (msg.sender && msg.sender !== currentUserId) {
      e.preventDefault();
      setContextMsg({ id: msg.id, sender: msg.sender, username: msg.sender_username || undefined, x: e.clientX, y: e.clientY });
    }
  };

  const otherTyping = (typingUsers || []).filter((u) => u.userId !== currentUserId);

  const visible = useMemo(
    () => messages.filter((msg) => !msg.sender || !blockedUserIds?.has(msg.sender)),
    [messages, blockedUserIds],
  );

  const isFriend = !!dmPartnerId && !!friendUserIds?.has(dmPartnerId);
  const requestReceived = !!dmPartnerId && !!pendingReceivedIds?.has(dmPartnerId);
  const requestSent = !!dmPartnerId && !!pendingSentIds?.has(dmPartnerId);

  const friendItem: MenuItem | null =
    !dmPartnerId || !onFriendAction || isBlocked
      ? null
      : isFriend
        ? {
            key: "friend",
            label: t("chat.remove_friend"),
            hint: t("chat.you_are_friends"),
            icon: <IconUserMinus size={15} />,
            danger: true,
            confirm: {
              title: t("chat.remove_friend_title", { name: title }),
              body: t("chat.remove_friend_body"),
              action: t("chat.remove"),
            },
            onClick: () => onFriendAction(dmPartnerId),
          }
        : requestReceived
          ? {
              key: "friend",
              label: t("chat.accept_friend_request"),
              hint: t("chat.wants_to_be_friends", { name: title }),
              icon: <IconUserCheck size={15} />,
              accent: true,
              onClick: () => onFriendAction(dmPartnerId),
            }
          : requestSent
            ? {
                key: "friend",
                label: t("chat.cancel_friend_request"),
                hint: t("chat.request_pending"),
                icon: <IconClock size={15} />,
                onClick: () => onFriendAction(dmPartnerId),
              }
            : {
                key: "friend",
                label: t("chat.add_friend"),
                icon: <IconUserPlus size={15} />,
                onClick: () => onFriendAction(dmPartnerId),
              };

  const menuItems = [
    dmPartnerId && onProfileClick
      ? { key: "profile", label: t("chat.view_profile"), icon: <IconUser size={15} />, onClick: () => onProfileClick(dmPartnerId) }
      : null,
    friendItem,
    dmPartnerId && onInviteGame && !isBlocked
      ? { key: "invite", label: t("chat.invite_to_game"), icon: <IconGamepad size={15} />, onClick: () => onInviteGame(dmPartnerId, title) }
      : null,
    onToggleMute
      ? {
          key: "mute",
          label: isMuted ? t("chat.unmute_notifications") : t("chat.mute_notifications"),
          hint: isMuted ? t("chat.notifications_off") : undefined,
          icon: isMuted ? <IconBell size={15} /> : <IconBellOff size={15} />,
          separatorBefore: true,
          onClick: onToggleMute,
        }
      : null,
    dmPartnerId && (isBlocked ? onUnblock : onBlockUser)
      ? {
          key: "block",
          label: isBlocked ? t("chat.unblock_player") : t("chat.block_player"),
          hint: isBlocked ? t("chat.you_blocked_them") : undefined,
          icon: isBlocked ? <IconUnblock size={15} /> : <IconBlock size={15} />,
          danger: !isBlocked,
          confirm: isBlocked
            ? undefined
            : {
                title: t("chat.block_title", { name: title }),
                body: t("chat.block_body"),
                action: t("chat.block"),
              },
          onClick: () => (isBlocked ? onUnblock?.() : onBlockUser?.(dmPartnerId)),
        }
      : null,
  ].filter(Boolean) as MenuItem[];

  const containerStyle: React.CSSProperties = noBorder
    ? {}
    : { backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" };

  return (
    <div
      className={`flex flex-col h-full min-h-0 overflow-hidden ${noBorder ? "" : "rounded-2xl"}`}
      style={containerStyle}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t("chat.back_to_conversations")}
            className="w-8 h-8 -ms-1 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors hover:bg-surface-hover"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <IconArrowLeft size={18} className="icon-directional" />
          </button>
        )}

        <ChatAvatar
          src={partnerAvatar}
          name={title}
          size={36}
          online={partnerOnline}
          onClick={onTitleClick}
          title={onTitleClick ? t("chat.view_profile") : undefined}
        />

        <button
          type="button"
          onClick={onTitleClick}
          disabled={!onTitleClick}
          className="flex-1 min-w-0 text-start disabled:cursor-default"
        >
          <p dir="auto" className="text-[13.5px] font-bold truncate" style={{ color: "var(--color-text-primary)" }}>
            {title}
          </p>
          <p
            className="text-[10.5px] truncate"
            style={{ color: partnerOnline ? "var(--color-success)" : "var(--color-text-muted)" }}
          >
            {otherTyping.length > 0 ? t("chat.typing") : partnerOnline ? t("chat.online") : t("chat.offline")}
          </p>
        </button>

        {isMuted && (
          <span style={{ color: "var(--color-text-muted)" }} title={t("chat.notifications_muted")}>
            <IconBellOff size={14} />
          </span>
        )}

        {menuItems.length > 0 && (
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmItem(null);
                setShowMenu((v) => !v);
              }}
              aria-label={t("chat.conversation_options")}
              aria-haspopup="menu"
              aria-expanded={showMenu}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-surface-hover"
              style={{
                color: showMenu ? "var(--color-primary)" : "var(--color-text-secondary)",
                backgroundColor: showMenu ? "var(--color-bg-hover)" : undefined,
              }}
            >
              <IconDots size={17} />
            </button>

            {showMenu && (
              <div
                role="menu"
                className="absolute z-50 mt-1.5 w-60 rounded-xl overflow-hidden shadow-xl"
                style={{
                  insetInlineEnd: 0,
                  backgroundColor: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {confirmItem?.confirm ? (
                  <div className="p-3">
                    <p className="text-[12.5px] font-bold" style={{ color: "var(--color-text-primary)" }}>
                      {confirmItem.confirm.title}
                    </p>
                    <p className="text-[11.5px] leading-relaxed mt-1" style={{ color: "var(--color-text-muted)" }}>
                      {confirmItem.confirm.body}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => setConfirmItem(null)}
                        className="flex-1 py-1.5 rounded-lg text-[11.5px] font-semibold transition-colors hover:bg-surface-hover"
                        style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
                      >
                        {t("chat.cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const run = confirmItem.onClick;
                          setConfirmItem(null);
                          setShowMenu(false);
                          run();
                        }}
                        className="flex-1 py-1.5 rounded-lg text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90"
                        style={{ backgroundColor: "var(--color-danger)" }}
                      >
                        {confirmItem.confirm.action}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-1">
                    {menuItems.map((item) => (
                      <div key={item.key}>
                        {item.separatorBefore && (
                          <div className="my-1 mx-3" style={{ borderTop: "1px solid var(--color-border)" }} />
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            if (item.confirm) {
                              setConfirmItem(item);
                              return;
                            }
                            setShowMenu(false);
                            item.onClick();
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-start transition-colors hover:bg-surface-hover"
                          style={{
                            color: item.danger
                              ? "var(--color-danger)"
                              : item.accent
                                ? "var(--color-success)"
                                : "var(--color-text-primary)",
                          }}
                        >
                          <span
                            className="flex-shrink-0"
                            style={{
                              color: item.danger
                                ? "var(--color-danger)"
                                : item.accent
                                  ? "var(--color-success)"
                                  : "var(--color-text-muted)",
                            }}
                          >
                            {item.icon}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[12.5px] font-medium truncate">{item.label}</span>
                            {item.hint && (
                              <span className="block text-[10.5px] truncate" style={{ color: "var(--color-text-muted)" }}>
                                {item.hint}
                              </span>
                            )}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Messages ───────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-3">
        {loading && (
          <div className="flex justify-center py-4">
            <div
              className="w-6 h-6 rounded-full border-2 animate-spin"
              style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }}
            />
          </div>
        )}
        {!loading && visible.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-center px-6">
            <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {t("chat.no_messages_yet")}
            </p>
            <p className="text-[11.5px]" style={{ color: "var(--color-text-muted)" }}>
              {t("chat.first_message_hint", { name: title })}
            </p>
          </div>
        )}
        {visible.map((msg, i) => {
          const showDay = i === 0 || dayKey(msg.created_at) !== dayKey(visible[i - 1].created_at);
          return (
            <div key={msg.id}>
              {showDay && (
                <div className="flex justify-center my-2">
                  <span
                    className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: "var(--color-bg-input)", color: "var(--color-text-muted)" }}
                  >
                    {dayLabel(msg.created_at, t, i18n.language)}
                  </span>
                </div>
              )}
              <div onContextMenu={(e) => handleContextMenu(e, msg)}>
                <ChatBubble
                  msg={msg}
                  isOwn={msg.sender === currentUserId}
                  onProfileClick={onProfileClick}
                  dmPartnerReadUntil={dmPartnerReadUntil}
                  sendGameInviteResponse={sendGameInviteResponse}
                />
              </div>
            </div>
          );
        })}
        {otherTyping.length > 0 && (
          <div className="flex items-center gap-2 py-1">
            <span
              className="flex items-center gap-1 px-3 py-2 rounded-2xl"
              style={{ backgroundColor: "var(--color-bg-input)" }}
            >
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ backgroundColor: "var(--color-text-muted)", animationDelay: `${d * 0.12}s` }}
                />
              ))}
            </span>
            <span dir="auto" className="text-[11px] italic" style={{ color: "var(--color-text-muted)" }}>
              {t("chat.typing_names", {
                count: otherTyping.length,
                names: otherTyping.map((u) => u.username).join(t("chat.name_separator")),
              })}
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {contextMsg && (
        <div
          className="fixed z-50 rounded-xl shadow-xl py-1 w-44"
          style={{
            // Anchored to the cursor, so it unfolds towards the reading
            // direction: rightwards in LTR, leftwards in RTL. `w-44` is 176px.
            left: isRtl
              ? Math.max(8, contextMsg.x - 176)
              : Math.min(contextMsg.x, window.innerWidth - 190),
            top: Math.min(contextMsg.y, window.innerHeight - 180),
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
          }}
          onClick={() => setContextMsg(null)}
        >
          {onProfileClick && (
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 text-start text-[12.5px] font-medium transition-colors hover:bg-surface-hover"
              style={{ color: "var(--color-text-primary)" }}
              onClick={() => { onProfileClick?.(contextMsg.sender); setContextMsg(null); }}
            >
              <span style={{ color: "var(--color-text-muted)" }}><IconUser size={15} /></span>
              {t("chat.view_profile")}
            </button>
          )}
          {onInviteGame && (
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 text-start text-[12.5px] font-medium transition-colors hover:bg-surface-hover"
              style={{ color: "var(--color-text-primary)" }}
              onClick={() => { onInviteGame?.(contextMsg.sender, contextMsg.username); setContextMsg(null); }}
            >
              <span style={{ color: "var(--color-text-muted)" }}><IconGamepad size={15} /></span>
              {t("chat.invite_to_game")}
            </button>
          )}
          {onFriendAction && (
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 text-start text-[12.5px] font-medium transition-colors hover:bg-surface-hover"
              style={{ color: "var(--color-text-primary)" }}
              onClick={() => { onFriendAction(contextMsg.sender); setContextMsg(null); }}
            >
              <span style={{ color: "var(--color-text-muted)" }}><IconUser size={15} /></span>
              {friendUserIds?.has(contextMsg.sender) ? t("chat.remove_friend") :
               pendingReceivedIds?.has(contextMsg.sender) ? t("chat.accept_request") :
               pendingSentIds?.has(contextMsg.sender) ? t("chat.cancel_request") :
               t("chat.add_friend")}
            </button>
          )}
          {onBlockUser && (
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 text-start text-[12.5px] font-medium transition-colors hover:bg-surface-hover"
              style={{ color: "var(--color-danger)" }}
              onClick={() => { onBlockUser(contextMsg.sender); setContextMsg(null); }}
            >
              <IconBlock size={15} />
              {t("chat.block_player")}
            </button>
          )}
        </div>
      )}

      {/* ── Composer ───────────────────────────────────────────── */}
      <div
        className="relative px-3 py-2.5 flex-shrink-0"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        {isBlocked ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] min-w-0" style={{ color: "var(--color-text-muted)" }}>
              {t("chat.you_blocked")} <strong style={{ color: "var(--color-text-secondary)" }}>{title}</strong>
            </p>
            <button
              onClick={onUnblock}
              className="px-3.5 py-1.5 rounded-lg text-[11.5px] font-semibold text-white flex-shrink-0 transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--color-success)" }}
            >
              {t("chat.unblock")}
            </button>
          </div>
        ) : (
          <>
            {showEmotes && <EmotePalette onEmote={handleEmote} />}
            <div className="flex items-end gap-2 w-full">
              <button
                type="button"
                onClick={() => setShowEmotes(!showEmotes)}
                className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0 transition-colors"
                style={{
                  backgroundColor: showEmotes ? "var(--color-primary)" : "var(--color-bg-input)",
                  color: showEmotes ? "#ffffff" : "var(--color-text-secondary)",
                  border: "1px solid var(--color-border)",
                }}
                title={t("chat.reactions")}
                aria-label={t("chat.reactions")}
                aria-pressed={showEmotes}
              >
                <IconReaction size={18} />
              </button>

              <input
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={t("chat.type_message")}
                aria-label={t("chat.message_label")}
                className="flex-1 min-w-0 w-full rounded-xl px-3 h-9 text-[13px] outline-none transition-shadow focus:shadow-[0_0_0_2px_rgb(var(--color-primary-rgb)/0.3)]"
                style={{
                  backgroundColor: "var(--color-bg-input)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              />

              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim()}
                title={t("chat.send")}
                aria-label={t("chat.send_message")}
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-transform active:scale-95"
                style={{ backgroundImage: "var(--gradient-brand)" }}
              >
                <IconSend size={17} className="icon-directional" style={{ pointerEvents: "none" }} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
