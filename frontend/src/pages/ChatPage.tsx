import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useFriendships } from "../context/FriendshipContext";
import { useBlocks } from "../context/BlockContext";
import { useToast } from "../context/ToastContext";
import InviteGamePicker from "../components/Chat/InviteGamePicker";
import { useChatSocket } from "../components/Chat/useChatSocket";
import { useChatEventEffects } from "../hooks/useChatEventEffects";
import ChatWindow from "../components/Chat/ChatWindow";
import ConversationList from "../components/Chat/ConversationList";
import { buildActivePeople } from "../components/Chat/activePeople";
import { IconChat } from "../components/Chat/ChatIcons";
import { loadHiddenChannels, saveHiddenChannels } from "../components/Chat/hiddenChats";
import { registerChatOpener } from "../components/Chat/chatOpener";
import {
  fetchChannels,
  sendFriendRequest, acceptFriendRequest, removeFriend,
  getOrCreateDM, markChannelRead, toggleNotificationMute,
  type Channel,
} from "../services/chat";
import { useAuth } from "../context/AuthContext";

export default function ChatPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => loadHiddenChannels(user?.id));
  const { friendships, setFriendships, refresh: refreshFriendships } = useFriendships();
  const { blocks, blockedUserIds, blockedByUserIds, block: doBlock, unblock: doUnblock, refresh: refreshBlocks } = useBlocks();
  const { showToast } = useToast();
  const [inviteTarget, setInviteTarget] = useState<string | null>(null);
  const [showInvitePicker, setShowInvitePicker] = useState(false);
  const userId = user?.id || null;

  const {
    status, messages, connectedChannels, sendMessage, sendEmote, joinChannel, requestHistory, typingUsers, sendTyping,
    gameInvite, gameInviteAccepted, clearGameInviteAccepted, sendGameInvite, sendGameInviteResponse,
    onlineUserIds, friendRequest: wsFriendRequest, clearFriendRequest,
    friendAccepted, clearFriendAccepted,
    friendRemoved, clearFriendRemoved,
    readReceipt, clearReadReceipt,
    chatError, clearChatError,
    onNewMessageRef,
    reconnectCount,
  } = useChatSocket();

  useEffect(() => {
    setHidden(loadHiddenChannels(userId));
  }, [userId]);

  const unhide = useCallback((channelId: string) => {
    setHidden((prev) => {
      if (!prev.has(channelId)) return prev;
      const next = new Set(prev);
      next.delete(channelId);
      saveHiddenChannels(userId, next);
      return next;
    });
  }, [userId]);

  const handleSelectChannel = useCallback(async (channelId: string) => {
    setActiveChannel(channelId);
    joinChannel(channelId);
    try {
      await markChannelRead(channelId);
      setChannels((prev) => prev.map((ch) => ch.id === channelId ? { ...ch, unread_count: 0 } : ch));
    } catch {}
  }, [joinChannel]);

  const openConversation = useCallback((channelId: string) => {
    unhide(channelId);
    handleSelectChannel(channelId);
  }, [unhide, handleSelectChannel]);

  // No bubble is mounted on this page, so notifications open conversations here.
  useEffect(() => registerChatOpener(openConversation), [openConversation]);

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
    currentUserId: userId,
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
      .then((list) => {
        setChannels(list);
        const channelParam = searchParams.get("channel");
        if (channelParam) {
          const found = list.find((c) => c.id === channelParam);
          if (found) {
            unhide(channelParam);
            setActiveChannel(channelParam);
            joinChannel(channelParam);
            markChannelRead(channelParam).catch(() => {});
          }
        }
      })
      .catch(() => {});
  }, [reconnectCount]);

  useEffect(() => {
    if (activeChannel) requestHistory(activeChannel);
  }, [activeChannel, requestHistory, reconnectCount]);

  useEffect(() => {
    refreshBlocks();
    refreshFriendships();
  }, [reconnectCount, refreshBlocks]);

  useEffect(() => {
    if (activeChannel && !connectedChannels.includes(activeChannel)) {
      const firstConnected = channels.find((c) => connectedChannels.includes(c.id));
      setActiveChannel(firstConnected?.id || null);
    }
  }, [connectedChannels, activeChannel, channels]);

  // Auto-mark-read when new messages arrive in active channel
  const activeMessages = activeChannel ? messages[activeChannel] || [] : [];
  const prevMsgLenRef = useRef(0);
  useEffect(() => {
    if (activeChannel && activeMessages.length > prevMsgLenRef.current) {
      markChannelRead(activeChannel).catch(() => {});
      setChannels((prev) => prev.map((ch) => ch.id === activeChannel ? { ...ch, unread_count: 0 } : ch));
    }
    prevMsgLenRef.current = activeMessages.length;
  }, [activeChannel, activeMessages.length]);

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
        unhide(cid);
      }
      prevMsgLens.current[cid] = msgs.length;
    }
  }, [messages, activeChannel, unhide]);

  // Mark read when user clicks the chat body
  const handleMarkRead = useCallback(() => {
    if (activeChannel) {
      markChannelRead(activeChannel).catch(() => {});
      setChannels((prev) => prev.map((ch) => ch.id === activeChannel ? { ...ch, unread_count: 0 } : ch));
    }
  }, [activeChannel]);

  const visibleChannels = useMemo(
    () => channels.filter((ch) => !hidden.has(ch.id)),
    [channels, hidden],
  );
  const activeChannelData = channels.find((c) => c.id === activeChannel);

  const friendUserIds = new Set(friendships.filter((f) => f.status === "accepted").map((f) => f.other_user_id));
  const pendingSentIds = new Set(friendships.filter((f) => f.status === "pending" && f.direction === "sent").map((f) => f.other_user_id));
  const pendingReceivedIds = new Set(friendships.filter((f) => f.status === "pending" && f.direction === "received").map((f) => f.other_user_id));

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
      refreshFriendships();
    } catch {}
  };

  const handleBlock = async (targetUserId: string) => {
    await doBlock(targetUserId);
    refreshFriendships();
  };

  const handleUnblockUser = async (targetUserId: string) => {
    const record = blocks.find((b) => b.blocked === targetUserId);
    if (!record) return;
    await doUnblock(record.id);
    refreshFriendships();
  };

  const handleDeleteChat = (channelId: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.add(channelId);
      saveHiddenChannels(userId, next);
      return next;
    });
    if (activeChannel === channelId) setActiveChannel(null);
    showToast({ title: "Conversation removed from your list", variant: "success" });
  };

  const handleInviteGame = (targetUserId: string) => {
    setInviteTarget(targetUserId);
    setShowInvitePicker(true);
  };

  const excludedFromActive = useMemo(() => {
    const set = new Set<string>(blockedUserIds);
    blockedByUserIds.forEach((id) => set.add(id));
    return set;
  }, [blockedUserIds, blockedByUserIds]);

  const activePeople = useMemo(
    () => buildActivePeople(visibleChannels, friendships, onlineUserIds, excludedFromActive),
    [visibleChannels, friendships, onlineUserIds, excludedFromActive],
  );

  const partner = activeChannelData?.dm_partner || null;
  const activeTitle = partner ? partner.display_name || partner.username : "Chat";

  return (
    <div className="w-full flex justify-center">
      <div className="chat-page-height w-full max-w-5xl flex gap-4">
        {/* ── Conversations ── */}
        <div
          className={`${activeChannel ? "hidden md:flex" : "flex"} w-full md:w-[320px] md:flex-shrink-0 flex-col rounded-2xl overflow-hidden`}
          style={{
            backgroundColor: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            boxShadow: "0 20px 45px -30px var(--color-shadow)",
          }}
        >
          <ConversationList
            channels={visibleChannels}
            activeChannelId={activeChannel}
            activePeople={activePeople}
            onlineUserIds={onlineUserIds}
            blockedUserIds={blockedUserIds}
            blockedByUserIds={blockedByUserIds}
            currentUserId={userId}
            status={status}
            onSelectChannel={handleSelectChannel}
            onOpenDM={handleOpenDM}
            onOpenProfile={(uid) => navigate(`/profile/${uid}`)}
            onToggleMute={handleSelfMute}
            onToggleBlock={(uid, isBlocked) => (isBlocked ? handleUnblockUser(uid) : handleBlock(uid))}
            onDeleteChat={handleDeleteChat}
          />
        </div>

        {/* ── Conversation ── */}
        <div className={`${activeChannel ? "flex" : "hidden md:flex"} flex-1 min-w-0 relative`}>
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

          {activeChannel ? (
            <div onClick={handleMarkRead} className="w-full h-full min-h-0">
              <ChatWindow
                messages={activeMessages}
                onSendMessage={(content) => sendMessage(activeChannel, content)}
                onSendEmote={(emoteId) => sendEmote(activeChannel, emoteId)}
                onTyping={() => sendTyping(activeChannel)}
                currentUserId={userId}
                typingUsers={typingUsers[activeChannel]}
                title={activeTitle}
                onBack={() => setActiveChannel(null)}
                partnerAvatar={partner?.avatar_url}
                partnerOnline={partner ? onlineUserIds.has(partner.id) && !excludedFromActive.has(partner.id) : undefined}
                isMuted={activeChannelData?.notifications_muted}
                onToggleMute={() => activeChannel && handleSelfMute(activeChannel)}
                onTitleClick={partner ? () => navigate(`/profile/${partner.id}`) : undefined}
                onProfileClick={(uid) => navigate(`/profile/${uid}`)}
                blockedUserIds={blockedUserIds}
                dmPartnerId={partner?.id || null}
                onBlockUser={(uid) => handleBlock(uid)}
                onUnblock={() => partner && handleUnblockUser(partner.id)}
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
            <div
              className="w-full h-full flex flex-col items-center justify-center gap-3 rounded-2xl text-center px-8"
              style={{
                backgroundColor: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                boxShadow: "0 20px 45px -30px var(--color-shadow)",
              }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ backgroundImage: "var(--gradient-brand-subtle)", color: "var(--color-primary)" }}
              >
                <IconChat size={26} />
              </div>
              <p className="text-[15px] font-bold" style={{ color: "var(--color-text-primary)" }}>
                Your messages
              </p>
              <p className="text-[12.5px] max-w-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                Pick a conversation on the left, or search for a player to start a new one.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
