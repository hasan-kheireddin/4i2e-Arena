import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useFriendships } from "../../context/FriendshipContext";
import { useBlocks } from "../../context/BlockContext";
import { useToast } from "../../context/ToastContext";
import InviteGamePicker from "./InviteGamePicker";
import { useChatSocket } from "./useChatSocket";
import { useChatEventEffects } from "../../hooks/useChatEventEffects";
import ChatWindow from "./ChatWindow";
import FriendsPanel from "./FriendsPanel";
import {
  fetchChannels,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
  getOrCreateDM,
  markChannelRead,
  toggleNotificationMute,
  searchUsers,
  type Channel,
  type SearchUser,
} from "../../services/chat";
import { useAuth } from "../../context/AuthContext";

export default function FloatingChatWidget() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);

  // Settings panel state
  const [showSettings, setShowSettings] = useState(false);
  const { friendships, setFriendships, refresh: refreshFriendships } = useFriendships();
  const { blocks, blockedUserIds, blockedByUserIds, block: doBlock, unblock: doUnblock } = useBlocks();
  const [inviteTarget, setInviteTarget] = useState<string | null>(null);
  const [showInvitePicker, setShowInvitePicker] = useState(false);
  const [activeView, setActiveView] = useState<"chat" | "friends">("friends");


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

  useChatEventEffects({
    gameInvite, gameInviteAccepted, clearGameInviteAccepted,
    friendAccepted, clearFriendAccepted,
    friendRemoved, clearFriendRemoved,
    wsFriendRequest, clearFriendRequest,
    readReceipt, clearReadReceipt,
    onNewMessageRef,
    setChannels, setFriendships,
    showToast,
    setActiveView,
    navigateToChat: (cid) => { setOpen(true); handleSelectChannel(cid); },
    navigateToProfile: (uid) => navigate(`/profile/${uid}`),
    currentUserId: user?.id,
    channels,
    activeChannel,
  });

  const handleSelectChannel = useCallback(async (channelId: string) => {
    setActiveChannel(channelId);
    joinChannel(channelId);
    setShowSettings(false);
    setActiveView("chat");
    try {
      await markChannelRead(channelId);
      setChannels((prev) => prev.map((ch) => ch.id === channelId ? { ...ch, unread_count: 0 } : ch));
    } catch {}
  }, [joinChannel]);

  const handleOpenDM = useCallback(async (userIdToDM: string) => {
    try {
      const channel = await getOrCreateDM(userIdToDM);
      setChannels((prev) => {
        const exists = prev.find((c) => c.id === channel.id);
        return exists ? prev : [...prev, channel];
      });
      handleSelectChannel(channel.id);
    } catch {}
  }, [handleSelectChannel]);

  useEffect(() => {
    fetchChannels()
      .then((list) => {
        setChannels(list);
      })
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

  // If the active channel is no longer reachable, switch away
  useEffect(() => {
    if (activeChannel && !connectedChannels.includes(activeChannel)) {
      const firstConnected = channels.find((c) => connectedChannels.includes(c.id));
      setActiveChannel(firstConnected?.id || null);
      setShowSettings(false);
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
      }
      prevMsgLens.current[cid] = msgs.length;
    }
  }, [messages, activeChannel]);

  // Search for a user to start (or resume) a conversation with.
  useEffect(() => {
    if (!open || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchUsers(searchQuery.trim());
        setSearchResults(results || []);
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, open]);

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
        setFriendships((prev) => [...prev, created as any]);
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

  const handleUnblock = async (blockId: string) => {
    await doUnblock(blockId);
    refreshFriendships();
  };

  const friendUserIds = new Set(friendships.filter((f) => f.status === "accepted").map((f) => f.other_user_id));
  const pendingSentIds = new Set(friendships.filter((f) => f.status === "pending" && f.direction === "sent").map((f) => f.other_user_id));
  const pendingReceivedIds = new Set(friendships.filter((f) => f.status === "pending" && f.direction === "received").map((f) => f.other_user_id));

  const pendingCount = friendships.filter(
    (f) => f.status === "pending" && f.direction === "received"
  ).length;

  const totalUnread = channels.reduce((sum, ch) => sum + (ch.notifications_muted ? 0 : ch.unread_count), 0);

  const activeTitle = activeChannelData?.dm_partner
    ? activeChannelData.dm_partner.display_name || activeChannelData.dm_partner.username
    : "Chat";

  const sidebar = (
    <div className="w-44 flex flex-col flex-shrink-0" style={{ borderRight: "1px solid var(--color-border)" }}>
      {/* Friends button */}
      <button
        onClick={() => setActiveView("friends")}
        className="flex items-center gap-2 px-3 py-2 text-xs font-bold transition-colors"
        style={{
          borderBottom: "1px solid var(--color-border)",
          color: activeView === "friends" ? "var(--color-primary)" : "var(--color-text-primary)",
          backgroundColor: activeView === "friends" ? "var(--color-bg-input)" : "transparent",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        Friends
        {pendingCount > 0 && (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full text-white font-bold"
            style={{ backgroundColor: "#EF4444" }}>{pendingCount}</span>
        )}
      </button>

      {/* Search for a user to chat with */}
      <div className="px-2 pt-2 pb-1">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for a user..."
          className="w-full rounded px-2 py-1 text-[10px] outline-none"
          style={{ backgroundColor: "var(--color-bg-input)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {searchQuery.trim().length >= 2 ? (
          <div className="px-1.5 pb-1 space-y-0.5">
            {searching && (
              <div className="flex justify-center py-3">
                <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
              </div>
            )}
            {!searching && searchResults.length === 0 && (
              <p className="text-[10px] px-2 py-1" style={{ color: "var(--color-text-muted)" }}>No users found</p>
            )}
            {searchResults.map((u) => (
              <div key={u.id} className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs" style={{ color: "var(--color-text-primary)" }}>
                <div
                  className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                  onClick={() => navigate(`/profile/${u.id}`)}
                  title="View profile"
                >
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                      style={{ backgroundColor: "var(--color-primary)", color: "white" }}>
                      {u.username[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className="flex-1 truncate">{u.display_name || u.username}</span>
                </div>
                <button
                  onClick={() => { setSearchQuery(""); handleOpenDM(u.id); }}
                  className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] text-white"
                  style={{ backgroundColor: "#3B82F6" }}
                  title="Message"
                >💬</button>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="px-3 pt-1 pb-0.5">
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>All Messages</span>
            </div>
            <div className="px-1.5 pb-1 space-y-0.5">
              {channels.length === 0 && (
                <p className="text-[10px] px-2 py-1" style={{ color: "var(--color-text-muted)" }}>No messages yet</p>
              )}
              {channels.map((ch) => {
                const partner = ch.dm_partner;
                const isBlocked = partner ? (blockedUserIds.has(partner.id) || blockedByUserIds.has(partner.id)) : false;
                const isOnline = partner ? onlineUserIds.has(partner.id) && !isBlocked : false;
                const isActive = activeChannel === ch.id;
                return (
                  <div
                    key={ch.id}
                    onClick={() => handleSelectChannel(ch.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors cursor-pointer"
                    style={{
                      backgroundColor: isActive ? "var(--color-bg-input)" : "transparent",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    <div className="relative flex-shrink-0">
                      {partner?.avatar_url ? (
                        <img src={partner.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                      ) : (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                          style={{ backgroundColor: "var(--color-primary)", color: "white" }}>
                          {(partner?.display_name || partner?.username || "?")[0].toUpperCase()}
                        </div>
                      )}
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 ${isOnline ? "bg-green-500" : "bg-gray-500"}`}
                        style={{ borderColor: "var(--color-bg-card)" }} />
                    </div>
                    <span className="flex-1 text-left truncate font-medium">
                      {partner?.display_name || partner?.username || "Unknown"}
                    </span>
                    {ch.unread_count > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full text-white font-bold flex-shrink-0"
                        style={{ backgroundColor: "#EF4444" }}>{ch.unread_count}</span>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); handleSelfMute(ch.id); }}
                      className="flex-shrink-0 p-0.5 rounded hover:opacity-80"
                      title={ch.notifications_muted ? "Unmute" : "Mute"}>
                      {ch.notifications_muted ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
                        </svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="px-3 py-1.5 border-t text-[10px]" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
        WS: {status}
      </div>
    </div>
  );

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
      )}

      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2">
        {open && (
          <div
            className="w-[480px] h-[500px] rounded-xl shadow-2xl flex overflow-hidden relative"
            style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
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

            {sidebar}

            {activeView === "friends" ? (
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <FriendsPanel
                  friendships={friendships}
                  onFriendshipsChange={setFriendships}
                  onlineUserIds={onlineUserIds}
                  onOpenDM={handleOpenDM}
                />
              </div>
            ) : showSettings ? (
              <div className="flex-1 flex flex-col min-w-0">
                <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--color-border)" }}>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>DM Settings</h3>
                  <button onClick={() => setShowSettings(false)}
                    className="text-xs px-2 py-1 rounded" style={{ backgroundColor: "var(--color-bg-input)", color: "var(--color-text-primary)" }}>Back</button>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center p-4 gap-3">
                  <div className="cursor-pointer text-center" onClick={() => activeChannelData?.dm_partner?.id && navigate(`/profile/${activeChannelData.dm_partner.id}`)}>
                    {activeChannelData?.dm_partner?.avatar_url ? (
                      <img src={activeChannelData.dm_partner.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover mx-auto" />
                    ) : (
                      <div className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold mx-auto"
                        style={{ backgroundColor: "var(--color-primary)", color: "white" }}>
                        {(activeChannelData?.dm_partner?.display_name || activeChannelData?.dm_partner?.username || "?")[0].toUpperCase()}
                      </div>
                    )}
                    <p className="text-sm font-semibold mt-2" style={{ color: "var(--color-text-primary)" }}>
                      {activeChannelData?.dm_partner?.display_name || activeChannelData?.dm_partner?.username}
                    </p>
                  </div>
                  <button onClick={() => activeChannelData?.dm_partner?.id && handleInviteGame(activeChannelData.dm_partner.id)}
                    className="px-4 py-2 rounded text-xs font-medium text-white"
                    style={{ backgroundColor: "var(--color-primary)" }}>Invite to Game</button>
                  <button onClick={() => activeChannel && handleSelfMute(activeChannel)}
                    className="px-4 py-2 rounded text-xs font-medium text-white"
                    style={{ backgroundColor: activeChannelData?.notifications_muted ? "#EF4444" : "#6B7280" }}>
                    {activeChannelData?.notifications_muted ? "Unmute" : "Mute"}
                  </button>
                  {activeChannelData?.dm_partner && (
                    <>
                      {blockedUserIds.has(activeChannelData.dm_partner.id) ? (
                        <button onClick={() => handleUnblock(blocks.find(b => b.blocked === activeChannelData!.dm_partner!.id)!.id)}
                          className="px-4 py-2 rounded text-xs font-medium text-white"
                          style={{ backgroundColor: "#10B981" }}>Unblock</button>
                      ) : (
                        <button onClick={() => handleBlock(activeChannelData!.dm_partner!.id)}
                          className="px-4 py-2 rounded text-xs font-medium text-white"
                          style={{ backgroundColor: "#6B7280" }}>Block</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-w-0" onClick={handleMarkRead}>
                {activeChannel ? (
                  <ChatWindow
                    noBorder
                    messages={activeMessages}
                    onSendMessage={(content) => sendMessage(activeChannel, content)}
                    onSendEmote={(emoteId) => sendEmote(activeChannel, emoteId)}
                    onTyping={() => sendTyping(activeChannel!)}
                    currentUserId={user?.id || null}
                    typingUsers={activeChannel ? typingUsers[activeChannel] : undefined}
                    title={activeTitle}
                    onTitleClick={activeChannelData?.dm_partner?.id ? () => navigate(`/profile/${activeChannelData!.dm_partner!.id}`) : undefined}
                    onSettingsClick={() => setShowSettings(true)}
                    blockedUserIds={blockedUserIds}
                    dmPartnerId={activeChannelData?.dm_partner?.id || null}
                    onBlockUser={(uid) => handleBlock(uid)}
                    onUnblock={() => {
                      const id = blocks.find(b => b.blocked === activeChannelData?.dm_partner?.id)?.id;
                      if (id) handleUnblock(id);
                    }}
                    onProfileClick={(uid) => navigate(`/profile/${uid}`)}
                    onInviteGame={handleInviteGame}
                    friendUserIds={friendUserIds}
                    pendingSentIds={pendingSentIds}
                    pendingReceivedIds={pendingReceivedIds}
                    onFriendAction={handleFriendAction}
                    dmPartnerReadUntil={activeChannelData?.dm_partner?.read_until || null}
                    sendGameInviteResponse={sendGameInviteResponse}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No messages yet</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => { const wasOpen = open; setOpen(!open); if (!wasOpen) { setActiveView("friends"); } if (wasOpen) { setActiveChannel(null); } }}
          className="w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-lg transition-transform active:scale-95 relative"
          style={{ backgroundColor: "var(--color-primary)", color: "white" }}
        >
          {open ? "✕" : "💬"}
          {!open && totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[9px] font-bold text-white px-1"
              style={{ backgroundColor: "#EF4444" }}>{totalUnread > 99 ? "99+" : totalUnread}</span>
          )}
        </button>
      </div>

    </>
  );
}
