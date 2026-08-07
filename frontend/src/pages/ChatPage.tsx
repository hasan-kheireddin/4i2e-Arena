import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useFriendships } from "../context/FriendshipContext";
import { useBlocks } from "../context/BlockContext";
import { useToast } from "../context/ToastContext";
import InviteGamePicker from "../components/Chat/InviteGamePicker";
import { useChatSocket } from "../components/Chat/useChatSocket";
import { useChatEventEffects } from "../hooks/useChatEventEffects";
import ChatWindow from "../components/Chat/ChatWindow";
import FriendsPanel from "../components/Chat/FriendsPanel";
import {
  fetchChannels,
  sendFriendRequest, acceptFriendRequest, removeFriend,
  getOrCreateDM, markChannelRead, toggleNotificationMute,
  searchUsers,
  type Channel, type SearchUser,
} from "../services/chat";
import { useAuth } from "../context/AuthContext";

export default function ChatPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const { friendships, setFriendships, refresh: refreshFriendships } = useFriendships();
  const { blocks, blockedUserIds, block: doBlock, unblock: doUnblock, refresh: refreshBlocks } = useBlocks();
  const { showToast } = useToast();
  const [inviteTarget, setInviteTarget] = useState<string | null>(null);
  const [showInvitePicker, setShowInvitePicker] = useState(false);
  const [activeView, setActiveView] = useState<"chat" | "friends">("friends");
  const userId = user?.id || null;

  const {
    status, messages, connectedChannels, sendMessage, sendEmote, joinChannel, requestHistory, typingUsers, sendTyping,
    gameInvite, gameInviteAccepted, clearGameInviteAccepted, sendGameInvite, sendGameInviteResponse,
    onlineUserIds, friendRequest: wsFriendRequest, clearFriendRequest,
    friendAccepted, clearFriendAccepted,
    friendRemoved, clearFriendRemoved,
    readReceipt, clearReadReceipt,
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
    navigateToChat: (cid) => { setActiveChannel(cid); joinChannel(cid); setActiveView("chat"); },
    navigateToProfile: (uid) => navigate(`/profile/${uid}`),
    currentUserId: userId,
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
        const channelParam = searchParams.get("channel");
        if (channelParam) {
          const found = list.find((c) => c.id === channelParam);
          if (found) {
            setActiveChannel(channelParam);
            joinChannel(channelParam);
            setActiveView("chat");
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
      setShowSettings(false);
    }
  }, [connectedChannels, activeChannel, channels]);

  // Search for a user to start (or resume) a conversation with.
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
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
  }, [searchQuery]);

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
      }
      prevMsgLens.current[cid] = msgs.length;
    }
  }, [messages, activeChannel]);

  // Mark read when user clicks the chat body
  const handleMarkRead = useCallback(() => {
    if (activeChannel) {
      markChannelRead(activeChannel).catch(() => {});
      setChannels((prev) => prev.map((ch) => ch.id === activeChannel ? { ...ch, unread_count: 0 } : ch));
    }
  }, [activeChannel]);
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
        setFriendships((prev) => [...prev, created as any]);
      }
      refreshFriendships();
    } catch {}
  };

  const handleBlock = async (userId: string) => {
    await doBlock(userId);
    refreshFriendships();
  };

  const handleUnblock = async (blockId: string) => {
    await doUnblock(blockId);
    refreshFriendships();
  };

  const handleInviteGame = (userId: string) => {
    setInviteTarget(userId);
    setShowInvitePicker(true);
  };

  const activeTitle = activeChannelData?.dm_partner
    ? activeChannelData.dm_partner.display_name || activeChannelData.dm_partner.username
    : "Chat";

  const friendsLineCount = friendships.filter(f => f.status === "pending" && f.direction === "received").length;

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "var(--color-bg)" }}>
      <div className="max-w-4xl w-full h-[600px] flex gap-4">
        {/* Sidebar */}
        <div className="w-64 flex flex-col rounded-xl flex-shrink-0 overflow-hidden" style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>

          {/* Friends button */}
          <button
            onClick={() => setActiveView("friends")}
            className="flex items-center gap-2 px-4 py-3 border-b text-sm font-bold transition-colors"
            style={{
              borderColor: "var(--color-border)",
              color: activeView === "friends" ? "var(--color-primary)" : "var(--color-text-primary)",
              backgroundColor: activeView === "friends" ? "var(--color-bg-input)" : "transparent",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Friends
            {friendsLineCount > 0 && (
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full text-white font-bold" style={{ backgroundColor: "#EF4444" }}>{friendsLineCount}</span>
            )}
          </button>

          {/* Search for a user to chat with */}
          <div className="px-3 pt-3 pb-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a user..."
              className="w-full rounded-lg px-3 py-1.5 text-xs outline-none"
              style={{ backgroundColor: "var(--color-bg-input)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
            />
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-1 space-y-0.5 min-h-0">
            {searchQuery.trim().length >= 2 ? (
              <>
                {searching && (
                  <div className="flex justify-center py-4">
                    <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
                  </div>
                )}
                {!searching && searchResults.length === 0 && (
                  <p className="text-[11px] px-2 py-2" style={{ color: "var(--color-text-muted)" }}>No users found</p>
                )}
                {searchResults.map((u) => (
                  <div key={u.id} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs" style={{ color: "var(--color-text-primary)" }}>
                    <div
                      className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
                      onClick={() => { navigate(`/profile/${u.id}`); }}
                      title="View profile"
                    >
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: "var(--color-primary)", color: "white" }}>
                          {u.username[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="flex-1 truncate font-medium">{u.display_name || u.username}</span>
                    </div>
                    <button
                      onClick={() => { setSearchQuery(""); handleOpenDM(u.id); }}
                      className="flex-shrink-0 px-2 py-1 rounded text-[10px] font-medium text-white"
                      style={{ backgroundColor: "var(--color-primary)" }}
                      title="Message"
                    >Message</button>
                  </div>
                ))}
              </>
            ) : (
              <>
                <div className="px-2 pt-1 pb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>All Messages</span>
                </div>
                {channels.length === 0 && (
                  <p className="text-[11px] px-2 py-2" style={{ color: "var(--color-text-muted)" }}>No messages yet — search for someone to chat with!</p>
                )}
                {channels.map((ch) => {
                  const partner = ch.dm_partner;
                  const isOnline = partner ? onlineUserIds.has(partner.id) : false;
                  const isActive = activeChannel === ch.id;
                  return (
                    <div
                      key={ch.id}
                      onClick={() => handleSelectChannel(ch.id)}
                      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs transition-colors cursor-pointer"
                      style={{
                        backgroundColor: isActive ? "var(--color-bg-input)" : "transparent",
                        color: "var(--color-text-primary)",
                      }}
                    >
                      <div className="relative flex-shrink-0">
                        {partner?.avatar_url ? (
                          <img src={partner.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ backgroundColor: "var(--color-primary)", color: "white" }}>
                            {(partner?.display_name || partner?.username || "?")[0].toUpperCase()}
                          </div>
                        )}
                        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 ${isOnline ? "bg-green-500" : "bg-gray-500"}`}
                          style={{ borderColor: "var(--color-bg-card)" }}
                        />
                      </div>
                      <span className="flex-1 text-left truncate font-medium">
                        {partner?.display_name || partner?.username || "Unknown"}
                      </span>
                      {ch.unread_count > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-bold flex-shrink-0"
                          style={{ backgroundColor: "#EF4444" }}>{ch.unread_count}</span>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); handleSelfMute(ch.id); }}
                        className="flex-shrink-0 p-0.5 rounded hover:opacity-80"
                        title={ch.notifications_muted ? "Unmute" : "Mute"}>
                        {ch.notifications_muted ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                          </svg>
                        )}
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <div className="px-4 py-2 border-t text-[10px]" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
            WS: {status}
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 relative">
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

          {activeView === "friends" ? (
            <div className="h-full flex flex-col rounded-xl overflow-hidden" style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
              <FriendsPanel
                friendships={friendships}
                onFriendshipsChange={setFriendships}
                onlineUserIds={onlineUserIds}
                onOpenDM={handleOpenDM}
              />
            </div>
          ) : activeChannel && showSettings ? (
            <div className="h-full flex flex-col rounded-xl" style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
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
                    {blockedUserIds.has(activeChannelData!.dm_partner!.id) ? (
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
            activeChannel ? (
              <div onClick={handleMarkRead} className="h-full">
                <ChatWindow
                  messages={activeMessages}
                  onSendMessage={(content) => sendMessage(activeChannel, content)}
                  onSendEmote={(emoteId) => sendEmote(activeChannel, emoteId)}
                  onTyping={() => sendTyping(activeChannel)}
                  currentUserId={userId}
                  typingUsers={activeChannel ? typingUsers[activeChannel] : undefined}
                  title={activeTitle}
                  onTitleClick={activeChannelData?.dm_partner?.id ? () => navigate(`/profile/${activeChannelData!.dm_partner!.id}`) : undefined}
                  onProfileClick={(uid) => navigate(`/profile/${uid}`)}
                  onSettingsClick={() => setShowSettings(true)}
                  blockedUserIds={blockedUserIds}
                  onBlockUser={(uid) => handleBlock(uid)}
                  onInviteGame={handleInviteGame}
                  friendUserIds={friendUserIds}
                  pendingSentIds={pendingSentIds}
                  pendingReceivedIds={pendingReceivedIds}
                  onFriendAction={handleFriendAction}
                  dmPartnerReadUntil={activeChannelData?.dm_partner?.read_until || null}
                  sendGameInviteResponse={sendGameInviteResponse}
                />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center rounded-xl" style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Select a conversation to start chatting</p>
              </div>
            )
          )}
        </div>
      </div>

    </div>
  );
}
