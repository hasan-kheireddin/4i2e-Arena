import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
    onNewMessageRef,
    reconnectCount,
  } = useChatSocket();

  useEffect(() => {
    setHidden(loadHiddenChannels(user?.id));
  }, [user?.id]);

  const unhide = useCallback((channelId: string) => {
    setHidden((prev) => {
      if (!prev.has(channelId)) return prev;
      const next = new Set(prev);
      next.delete(channelId);
      saveHiddenChannels(user?.id, next);
      return next;
    });
  }, [user?.id]);

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

  useChatEventEffects({
    gameInvite, gameInviteAccepted, clearGameInviteAccepted,
    friendAccepted, clearFriendAccepted,
    friendRemoved, clearFriendRemoved,
    wsFriendRequest, clearFriendRequest,
    readReceipt, clearReadReceipt,
    onNewMessageRef,
    setChannels, setFriendships,
    showToast,
    navigateToChat: openConversation,
    navigateToProfile: (uid) => navigate(`/profile/${uid}`),
    currentUserId: user?.id,
    channels,
    activeChannel,
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

  useEffect(() => {
    if (activeChannel) {
      requestHistory(activeChannel);
    }
  }, [activeChannel, requestHistory, reconnectCount]);

  useEffect(() => {
    refreshFriendships();
  }, [reconnectCount]);

  // If the active channel is no longer reachable, drop back to the list.
  useEffect(() => {
    if (activeChannel && !connectedChannels.includes(activeChannel)) {
      const firstConnected = channels.find((c) => connectedChannels.includes(c.id));
      setActiveChannel(firstConnected?.id || null);
      if (!firstConnected) setView("list");
    }
  }, [connectedChannels, activeChannel, channels]);

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
      saveHiddenChannels(user?.id, next);
      return next;
    });
    if (activeChannel === channelId) {
      setActiveChannel(null);
      setView("list");
    }
    showToast({ title: "Conversation removed from your list", variant: "success" });
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
  const activeTitle = partner ? partner.display_name || partner.username : "Chat";
  const showConversation = view === "chat" && !!activeChannel;

  const closeButton = (
    <button
      type="button"
      onClick={() => setOpen(false)}
      aria-label="Close chat"
      className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-surface-hover"
      style={{ color: "var(--color-text-muted)" }}
    >
      <IconClose size={16} />
    </button>
  );

  return (
    <>
      {open && <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />}

      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2.5">
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
          aria-label={open ? "Close chat" : "Open chat"}
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
              className="absolute -top-0.5 -right-0.5 min-w-[19px] h-[19px] flex items-center justify-center rounded-full text-[9.5px] font-bold text-white px-1"
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
