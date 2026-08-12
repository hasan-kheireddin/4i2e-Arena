import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFriendships } from "../../context/FriendshipContext";
import { useBlocks } from "../../context/BlockContext";
import { useToast } from "../../context/ToastContext";
import InviteGamePicker from "./InviteGamePicker";
import { useChatSocket } from "./useChatSocket";
import { useChatEventEffects } from "../../hooks/useChatEventEffects";
import ChatWindow from "./ChatWindow";
import ConversationList from "./ConversationList";
import { buildActivePeople } from "./activePeople";
import { IconChatFilled, IconClose } from "./ChatIcons";
import { loadHiddenChannels, saveHiddenChannels } from "./hiddenChats";
import { registerChatOpener } from "./chatOpener";
import { withLatestMessages } from "./channelPreviews";
import {
  fetchChannels,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
  getOrCreateDM,
  markChannelRead,
  toggleNotificationMute,
  type Channel,
} from "../../services/chat";
import { useAuth } from "../../context/AuthContext";

export default function FloatingChatWidget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "chat">("list");
  const [hidden, setHidden] = useState<Set<string>>(() => loadHiddenChannels(user?.id));

  const { friendships, setFriendships, refresh: refreshFriendships } = useFriendships();
  const { blocks, blockedUserIds, blockedByUserIds, block: doBlock, unblock: doUnblock } = useBlocks();
  const [inviteTarget, setInviteTarget] = useState<string | null>(null);
  const [showInvitePicker, setShowInvitePicker] = useState(false);

  const { showToast } = useToast();

  const {
    status,
    messages,
    connectedChannels,
    sendMessage,
    sendEmote,
    sendTyping,
    joinChannel,
    requestHistory,
    typingUsers,
    gameInvite,
    gameInviteAccepted,
    clearGameInviteAccepted,
    sendGameInvite,
    sendGameInviteResponse,
    onlineUserIds,
    friendRequest: wsFriendRequest,
    clearFriendRequest,
    friendAccepted,
    clearFriendAccepted,
    friendRemoved,
    clearFriendRemoved,
    readReceipt,
    clearReadReceipt,
    chatError,
    clearChatError,
    onNewMessageRef,
    reconnectCount,
  } = useChatSocket();

  const hydratedFor = useRef<string | undefined>(user?.id);

  useEffect(() => {
    hydratedFor.current = user?.id;
    setHidden(loadHiddenChannels(user?.id));
  }, [user?.id]);

  // Persisted here rather than inside the setHidden updaters: updaters run
  // during render and must stay free of side effects. The guard keeps a
  // just-swapped account from having the previous user's set written to it.
  useEffect(() => {
    if (hydratedFor.current !== user?.id) return;
    saveHiddenChannels(user?.id, hidden);
  }, [hidden, user?.id]);

  const unhide = useCallback((channelId: string) => {
    setHidden((prev) => {
      if (!prev.has(channelId)) return prev;
      const next = new Set(prev);
      next.delete(channelId);
      return next;
    });
  }, []);

  const handleSelectChannel = useCallback(async (channelId: string) => {
    setActiveChannel(channelId);
    joinChannel(channelId);
    setView("chat");
    try {
      await markChannelRead(channelId);
      setChannels((prev) => prev.map((ch) => ch.id === channelId ? { ...ch, unread_count: 0 } : ch));
    } catch {}
  }, [joinChannel]);

  const openConversation = useCallback((channelId: string) => {
    setOpen(true);
    unhide(channelId);
    handleSelectChannel(channelId);
  }, [unhide, handleSelectChannel]);

  // Notifications and message toasts open conversations in this bubble rather
  // than routing to the full messages page.
  useEffect(() => registerChatOpener(openConversation), [openConversation]);

  // A message toast is suppressed for the conversation the user is already
  // looking at — but only while they are actually looking at it. `activeChannel`
  // outlives the view: closing the bubble with its X or the backdrop, or going
  // back to the list, all leave it pointing at a conversation that is no longer
  // on screen. Passing it raw meant a conversation opened once stayed silent for
  // the rest of the session, which reads exactly like a mute that will not lift.
  const visibleChannel = open && view === "chat" ? activeChannel : null;

  useChatEventEffects({
    gameInvite, gameInviteAccepted, clearGameInviteAccepted,
    friendAccepted, clearFriendAccepted,
    friendRemoved, clearFriendRemoved,
    wsFriendRequest, clearFriendRequest,
    readReceipt, clearReadReceipt,
    chatError, clearChatError,
    onNewMessageRef,
    setChannels, setFriendships,
    showToast,
    navigateToChat: openConversation,
    navigateToProfile: (uid) => navigate(`/profile/${uid}`),
    currentUserId: user?.id,
    channels,
    activeChannel: visibleChannel,
  });

  const handleOpenDM = useCallback(async (userIdToDM: string) => {
    try {
      const channel = await getOrCreateDM(userIdToDM);
      setChannels((prev) => {
        const exists = prev.find((c) => c.id === channel.id);
        return exists ? prev : [...prev, channel];
      });
      unhide(channel.id);
      handleSelectChannel(channel.id);
    } catch {}
  }, [handleSelectChannel, unhide]);

  useEffect(() => {
    fetchChannels()
      .then((list) => setChannels(list))
      .catch(() => {});
  }, [open, reconnectCount]);

  // Keep the conversation list's preview line and ordering in step with what
  // the socket delivers, instead of only with what the last fetch returned.
  useEffect(() => {
    setChannels((prev) => withLatestMessages(prev, messages));
  }, [messages]);

  // A message can arrive for a conversation this list has never seen — someone
  // DMs you for the first time, or starts one while the bubble sits closed. The
  // socket delivers it, but with no matching channel there is nothing to list,
  // badge or open, which is why it only showed up after closing and reopening
  // (the reopen is what refetched the list). Pull it in as soon as it lands.
  const requestedLookups = useRef<Set<string>>(new Set());
  useEffect(() => {
    const unknown = Object.keys(messages).filter(
      (cid) => !channels.some((c) => c.id === cid) && !requestedLookups.current.has(cid),
    );
    if (unknown.length === 0) return;
    unknown.forEach((cid) => requestedLookups.current.add(cid));
    fetchChannels()
      .then((list) => {
        setChannels(list);
        // Anything the server still doesn't return is not ours to show; leave it
        // marked so a burst of messages can't spin this into a fetch loop.
        list.forEach((c) => requestedLookups.current.delete(c.id));
      })
      .catch(() => unknown.forEach((cid) => requestedLookups.current.delete(cid)));
  }, [messages, channels]);

  useEffect(() => {
    if (activeChannel) {
      requestHistory(activeChannel);
    }
  }, [activeChannel, requestHistory, reconnectCount]);

  useEffect(() => {
    refreshFriendships();
  }, [reconnectCount]);

  // If the active channel is no longer reachable, drop back to the list — and
  // only to the list. Substituting the first still-connected conversation put
  // the user in front of a thread they never opened (with the composer aimed at
  // it) and left `activeChannel` naming a conversation nobody is reading, which
  // silenced its message toasts.
  useEffect(() => {
    if (activeChannel && !connectedChannels.includes(activeChannel)) {
      setActiveChannel(null);
      setView("list");
    }
  }, [connectedChannels, activeChannel]);

  // Mark read on widget open
  useEffect(() => {
    if (open && activeChannel) {
      markChannelRead(activeChannel).catch(() => {});
      setChannels((prev) => prev.map((ch) => ch.id === activeChannel ? { ...ch, unread_count: 0 } : ch));
    }
  }, [open, activeChannel]);

  // Auto-mark-read when widget is open and new messages arrive
  const activeMessages = activeChannel ? messages[activeChannel] || [] : [];
  const prevMsgLenRef = useRef(0);
  useEffect(() => {
    if (open && activeChannel && activeMessages.length > prevMsgLenRef.current) {
      markChannelRead(activeChannel).catch(() => {});
      setChannels((prev) => prev.map((ch) => ch.id === activeChannel ? { ...ch, unread_count: 0 } : ch));
    }
    prevMsgLenRef.current = activeMessages.length;
  }, [open, activeChannel, activeMessages.length]);

  // Mark read on click
  const handleMarkRead = useCallback(() => {
    if (activeChannel) {
      markChannelRead(activeChannel).catch(() => {});
      setChannels((prev) => prev.map((ch) => ch.id === activeChannel ? { ...ch, unread_count: 0 } : ch));
    }
  }, [activeChannel]);

  // Track new messages for non-active channels to update unread count
  const prevMsgLens = useRef<Record<string, number>>({});
  useEffect(() => {
    for (const [cid, msgs] of Object.entries(messages)) {
      const prev = prevMsgLens.current[cid] ?? 0;
      if (msgs.length > prev && cid !== activeChannel) {
        const added = msgs.length - prev;
        setChannels((prevCh) => prevCh.map((ch) =>
          ch.id === cid ? { ...ch, unread_count: ch.unread_count + added } : ch
        ));
        // A deleted conversation comes back the moment it has new activity.
        unhide(cid);
      }
      prevMsgLens.current[cid] = msgs.length;
    }
  }, [messages, activeChannel, unhide]);

  const visibleChannels = useMemo(
    () => channels.filter((ch) => !hidden.has(ch.id)),
    [channels, hidden],
  );
  const activeChannelData = channels.find((c) => c.id === activeChannel);

  const handleSelfMute = async (channelId: string) => {
    try {
      const result = await toggleNotificationMute(channelId);
      setChannels((prev) => prev.map((c) =>
        c.id === channelId ? { ...c, notifications_muted: result.notifications_muted } : c
      ));
    } catch {}
  };

  const handleFriendAction = async (targetUserId: string) => {
    try {
      if (friendUserIds.has(targetUserId)) {
        const f = friendships.find((fr) => fr.other_user_id === targetUserId);
        if (f) { await removeFriend(f.id); setFriendships((prev) => prev.filter((fr) => fr.id !== f.id)); }
      } else if (pendingReceivedIds.has(targetUserId)) {
        const f = friendships.find((fr) => fr.other_user_id === targetUserId);
        if (f) { const updated = await acceptFriendRequest(f.id); setFriendships((prev) => prev.map((fr) => fr.id === f.id ? { ...fr, ...updated } : fr)); }
      } else if (pendingSentIds.has(targetUserId)) {
        const f = friendships.find((fr) => fr.other_user_id === targetUserId);
        if (f) { await removeFriend(f.id); setFriendships((prev) => prev.filter((fr) => fr.id !== f.id)); }
      } else {
        const created = await sendFriendRequest(targetUserId);
        setFriendships((prev) => [...prev, created]);
      }
    } catch {}
  };

  const handleInviteGame = (userId: string) => {
    setInviteTarget(userId);
    setShowInvitePicker(true);
  };

  const handleBlock = async (userId: string) => {
    await doBlock(userId);
    refreshFriendships();
  };

  const handleUnblockUser = async (userId: string) => {
    const record = blocks.find((b) => b.blocked === userId);
    if (!record) return;
    await doUnblock(record.id);
    refreshFriendships();
  };

  const handleDeleteChat = (channelId: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.add(channelId);
      return next;
    });
    if (activeChannel === channelId) {
      setActiveChannel(null);
      setView("list");
    }
    showToast({ title: t("chat.conversation_removed"), variant: "success" });
  };

  const friendUserIds = new Set(friendships.filter((f) => f.status === "accepted").map((f) => f.other_user_id));
  const pendingSentIds = new Set(friendships.filter((f) => f.status === "pending" && f.direction === "sent").map((f) => f.other_user_id));
  const pendingReceivedIds = new Set(friendships.filter((f) => f.status === "pending" && f.direction === "received").map((f) => f.other_user_id));

  const excludedFromActive = useMemo(() => {
    const set = new Set<string>(blockedUserIds);
    blockedByUserIds.forEach((id) => set.add(id));
    return set;
  }, [blockedUserIds, blockedByUserIds]);

  const activePeople = useMemo(
    () => buildActivePeople(visibleChannels, friendships, onlineUserIds, excludedFromActive),
    [visibleChannels, friendships, onlineUserIds, excludedFromActive],
  );

  const totalUnread = visibleChannels.reduce(
    (sum, ch) => sum + (ch.notifications_muted ? 0 : ch.unread_count),
    0,
  );

  const partner = activeChannelData?.dm_partner || null;
  const activeTitle = partner ? partner.display_name || partner.username : t("chat.conversation");
  const showConversation = view === "chat" && !!activeChannel;

  const closeButton = (
    <button
      type="button"
      onClick={() => setOpen(false)}
      aria-label={t("chat.close_chat")}
      className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-surface-hover"
      style={{ color: "var(--color-text-muted)" }}
    >
      <IconClose size={16} />
    </button>
  );

  return (
    <>
      {open && <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />}

      <div className="fixed bottom-4 end-4 z-[9999] flex flex-col items-end gap-2.5">
        {open && (
          <div
            className="chat-panel-height w-[min(calc(100vw-2rem),380px)] rounded-2xl shadow-2xl flex flex-col overflow-hidden relative"
            style={{
              backgroundColor: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
              boxShadow: "0 24px 60px -18px var(--color-shadow), 0 0 0 1px rgb(var(--color-primary-rgb) / 0.06)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {showInvitePicker && (
              <InviteGamePicker
                onSelect={(gameType) => {
                  if (inviteTarget) sendGameInvite(inviteTarget, gameType);
                  setShowInvitePicker(false);
                  setInviteTarget(null);
                }}
                onCancel={() => { setShowInvitePicker(false); setInviteTarget(null); }}
              />
            )}

            {showConversation ? (
              <div className="flex-1 flex flex-col min-h-0" onClick={handleMarkRead}>
                <ChatWindow
                  noBorder
                  messages={activeMessages}
                  onSendMessage={(content) => sendMessage(activeChannel!, content)}
                  onSendEmote={(emoteId) => sendEmote(activeChannel!, emoteId)}
                  onTyping={() => sendTyping(activeChannel!)}
                  currentUserId={user?.id || null}
                  typingUsers={typingUsers[activeChannel!]}
                  title={activeTitle}
                  onBack={() => setView("list")}
                  partnerAvatar={partner?.avatar_url}
                  partnerOnline={partner ? onlineUserIds.has(partner.id) && !excludedFromActive.has(partner.id) : undefined}
                  isMuted={activeChannelData?.notifications_muted}
                  onToggleMute={() => activeChannel && handleSelfMute(activeChannel)}
                  onTitleClick={partner ? () => navigate(`/profile/${partner.id}`) : undefined}
                  blockedUserIds={blockedUserIds}
                  dmPartnerId={partner?.id || null}
                  onBlockUser={(uid) => handleBlock(uid)}
                  onUnblock={() => partner && handleUnblockUser(partner.id)}
                  onProfileClick={(uid) => navigate(`/profile/${uid}`)}
                  onInviteGame={handleInviteGame}
                  friendUserIds={friendUserIds}
                  pendingSentIds={pendingSentIds}
                  pendingReceivedIds={pendingReceivedIds}
                  onFriendAction={handleFriendAction}
                  dmPartnerReadUntil={partner?.read_until || null}
                  sendGameInviteResponse={sendGameInviteResponse}
                />
              </div>
            ) : (
              <ConversationList
                channels={visibleChannels}
                activeChannelId={activeChannel}
                activePeople={activePeople}
                onlineUserIds={onlineUserIds}
                blockedUserIds={blockedUserIds}
                blockedByUserIds={blockedByUserIds}
                currentUserId={user?.id || null}
                status={status}
                onSelectChannel={handleSelectChannel}
                onOpenDM={handleOpenDM}
                onOpenProfile={(uid) => { setOpen(false); navigate(`/profile/${uid}`); }}
                onToggleMute={handleSelfMute}
                onToggleBlock={(uid, isBlocked) => (isBlocked ? handleUnblockUser(uid) : handleBlock(uid))}
                onDeleteChat={handleDeleteChat}
                headerAction={closeButton}
              />
            )}
          </div>
        )}

        <button
          onClick={() => {
            const wasOpen = open;
            setOpen(!wasOpen);
            if (wasOpen) {
              setActiveChannel(null);
              setView("list");
            }
          }}
          aria-label={open ? t("chat.close_chat") : t("chat.open_chat")}
          className="rounded-full flex items-center justify-center transition-transform active:scale-95 relative text-white"
          style={{
            width: 52,
            height: 52,
            backgroundImage: "var(--gradient-brand)",
            boxShadow: "0 12px 30px -8px rgb(var(--color-primary-rgb) / 0.55)",
          }}
        >
          {open ? <IconClose size={22} /> : <IconChatFilled size={24} />}
          {!open && totalUnread > 0 && (
            <span
              className="absolute -top-0.5 -end-0.5 min-w-[19px] h-[19px] flex items-center justify-center rounded-full text-[9.5px] font-bold text-white px-1"
              style={{ backgroundColor: "var(--color-secondary)", border: "2px solid var(--color-bg)" }}
            >
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </button>
      </div>
    </>
  );
}
