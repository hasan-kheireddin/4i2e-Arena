import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useChatSocket } from "./useChatSocket";
import ChatWindow from "./ChatWindow";
import FriendsPanel from "./FriendsPanel";
import {
  fetchChannels,
  createChannel,
  deleteChannel,
  fetchMembers,
  kickMember,
  muteMember,
  changeMemberRole,
  blockUser,
  unblockUser,
  fetchBlocks,
  fetchFriendships,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
  getOrCreateDM,
  markChannelRead,
  leaveChannel,
  toggleNotificationMute,
  type Channel,
  type Member,
  type BlockRecord,
  type FriendshipRecord,
} from "../../services/chat";
import { useAuth } from "../../context/AuthContext";

export default function FloatingChatWidget() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"public" | "private">("public");

  // Settings panel state
  const [showSettings, setShowSettings] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [blocks, setBlocks] = useState<BlockRecord[]>([]);
  const [kickConfirm, setKickConfirm] = useState<Member | null>(null);
  const [inviteTarget, setInviteTarget] = useState<string | null>(null);
  const [showInvitePicker, setShowInvitePicker] = useState(false);
  const [friendships, setFriendships] = useState<FriendshipRecord[]>([]);
  const [activeView, setActiveView] = useState<"chat" | "friends">("friends");
  const [friendNotif, setFriendNotif] = useState<typeof wsFriendRequest>(null);

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
    clearGameInvite,
    gameInviteAccepted,
    clearGameInviteAccepted,
    sendGameInvite,
    sendGameInviteResponse,
    onlineUserIds,
    friendRequest: wsFriendRequest,
    clearFriendRequest,
    readReceipt,
    clearReadReceipt,
    reconnectCount,
  } = useChatSocket();

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
    if (!open && reconnectCount === 0) return;
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
    if (!activeChannel || !showSettings) return;
    fetchMembers(activeChannel).then(setMembers).catch(() => {});
  }, [activeChannel, showSettings]);

  useEffect(() => {
    fetchBlocks().then(setBlocks).catch(() => {});
    fetchFriendships().then(setFriendships).catch(() => {});
  }, [reconnectCount]);

  // Show friend request notifications
  useEffect(() => {
    if (wsFriendRequest) {
      setFriendNotif(wsFriendRequest);
      clearFriendRequest();
      setActiveView("friends");
    }
  }, [wsFriendRequest, clearFriendRequest]);

  useEffect(() => {
    if (!readReceipt) return;
    setChannels((prev) => prev.map((ch) => {
      if (ch.id === readReceipt.channel_id && ch.dm_partner) {
        return { ...ch, dm_partner: { ...ch.dm_partner, read_until: readReceipt.read_until } };
      }
      return ch;
    }));
    clearReadReceipt();
  }, [readReceipt, clearReadReceipt]);

  useEffect(() => {
    if (!gameInviteAccepted) return;
    const gtype = gameInviteAccepted.game_type === "pong3d" ? "pong3d" : gameInviteAccepted.game_type;
    navigate(`/games/${gtype}?game_id=${gameInviteAccepted.game_id}`);
    clearGameInviteAccepted();
  }, [gameInviteAccepted, navigate, clearGameInviteAccepted]);

  const handleAcceptFriendNotif = async () => {
    if (!friendNotif) return;
    try {
      const f = friendships.find((fr) => fr.other_user_id === friendNotif.from_user_id);
      if (f) {
        const { acceptFriendRequest } = await import("../../services/chat");
        const updated = await acceptFriendRequest(f.id);
        setFriendships((prev) => prev.map((fr) => fr.id === f.id ? { ...fr, ...updated } : fr));
      }
    } catch {}
    setFriendNotif(null);
  };

  const handleDismissFriendNotif = () => setFriendNotif(null);

  // If the kicked user had this channel active, switch away
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

  const activeChannelData = channels.find((c) => c.id === activeChannel);

  const handleCreateChannel = async () => {
    if (!newName.trim()) return;
    try {
      const ch = await createChannel({ name: newName.trim(), channel_type: newType });
      setChannels((prev) => [...prev, ch]);
      handleSelectChannel(ch.id);
      setShowCreate(false);
      setNewName("");
    } catch {}
  };

  const handleDeleteChannel = async () => {
    if (!activeChannel) return;
    try {
      await deleteChannel(activeChannel);
      setChannels((prev) => prev.filter((c) => c.id !== activeChannel));
      setActiveChannel(null);
      setShowSettings(false);
    } catch {}
  };

  const handleKickConfirm = async () => {
    if (!activeChannel || !kickConfirm) return;
    try {
      await kickMember(activeChannel, kickConfirm.id);
      setMembers((prev) => prev.filter((m) => m.id !== kickConfirm.id));
      setKickConfirm(null);
    } catch (err) {
      console.error("Kick failed:", err);
      alert("Kick failed: " + ((err as any)?.detail || (err as any)?.message || "Unknown error"));
    }
  };

  const handleMute = async (membershipId: string, duration: number) => {
    if (!activeChannel) return;
    try {
      const updated = await muteMember(activeChannel, membershipId, duration);
      setMembers((prev) => prev.map((m) => (m.id === membershipId ? updated : m)));
    } catch {}
  };

  const handleSelfMute = async (channelId: string) => {
    try {
      const result = await toggleNotificationMute(channelId);
      setChannels((prev) => prev.map((c) =>
        c.id === channelId ? { ...c, notifications_muted: result.notifications_muted } : c
      ));
    } catch {}
  };

  const handleChangeRole = async (membershipId: string, role: "member" | "admin") => {
    if (!activeChannel) return;
    try {
      const updated = await changeMemberRole(activeChannel, membershipId, role);
      setMembers((prev) => prev.map((m) => (m.id === membershipId ? updated : m)));
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

  const handleSendInvite = (gameType: string) => {
    if (inviteTarget) {
      sendGameInvite(inviteTarget, gameType);
    }
    setShowInvitePicker(false);
    setInviteTarget(null);
  };

  const handleBlock = async (userId: string) => {
    try {
      const block = await blockUser(userId);
      setBlocks((prev) => [...prev, block]);
    } catch {}
  };

  const handleUnblock = async (blockId: string) => {
    try {
      await unblockUser(blockId);
      setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    } catch {}
  };

  const isOwner = activeChannelData?.owner === user?.id;
  const blockedUserIds = new Set(blocks.map((b) => b.blocked));
  const friendUserIds = new Set(friendships.filter((f) => f.status === "accepted").map((f) => f.other_user_id));
  const pendingSentIds = new Set(friendships.filter((f) => f.status === "pending" && f.direction === "sent").map((f) => f.other_user_id));
  const pendingReceivedIds = new Set(friendships.filter((f) => f.status === "pending" && f.direction === "received").map((f) => f.other_user_id));

  const pendingCount = friendships.filter(
    (f) => f.status === "pending" && f.direction === "received"
  ).length;

  const dmChannels = channels.filter((c) => c.channel_type === "dm");
  const publicChannels = channels.filter((c) => c.channel_type !== "dm");
  const totalUnread = channels.reduce((sum, ch) => sum + (ch.notifications_muted ? 0 : ch.unread_count), 0);

  const activeTitle = activeChannelData?.channel_type === "dm" && activeChannelData?.dm_partner
    ? activeChannelData.dm_partner.display_name || activeChannelData.dm_partner.username
    : activeChannelData?.name || "Chat";

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

      <div className="flex-1 overflow-y-auto">
        {/* DMs section */}
        <div className="px-3 pt-2 pb-0.5">
          <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Direct Messages</span>
        </div>
        <div className="px-1.5 pb-1 space-y-0.5">
          {dmChannels.length === 0 && (
            <p className="text-[10px] px-2 py-1" style={{ color: "var(--color-text-muted)" }}>No DMs</p>
          )}
          {dmChannels.map((ch) => {
            const partner = ch.dm_partner;
            const isOnline = partner ? onlineUserIds.has(partner.id) : false;
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

            {/* Channels section */}
          {publicChannels.length > 0 && (
            <>
              <div className="flex items-center justify-between px-2 pt-3 pb-0.5">
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Channels</span>
                <button
                  onClick={() => setShowCreate(!showCreate)}
                  className="w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold"
                  style={{ backgroundColor: "var(--color-primary)", color: "white" }}
                >+</button>
              </div>
              {showCreate && (
                <div className="p-1.5 space-y-1 mb-1 rounded" style={{ backgroundColor: "var(--color-bg-input)" }}>
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name"
                    className="w-full rounded px-1.5 py-1 text-[10px] outline-none"
                    style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
                  <select value={newType} onChange={(e) => setNewType(e.target.value as "public" | "private")}
                    className="w-full rounded px-1.5 py-1 text-[10px] outline-none"
                    style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}>
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                  <button onClick={handleCreateChannel} disabled={!newName.trim()}
                    className="w-full py-1 rounded text-[10px] font-medium text-white disabled:opacity-40"
                    style={{ backgroundColor: "var(--color-primary)" }}>Create</button>
                </div>
              )}
              {publicChannels.map((ch) => {
                const isActive = activeChannel === ch.id;
                return (
                  <div
                    key={ch.id}
                    onClick={() => handleSelectChannel(ch.id)}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors cursor-pointer"
                    style={{
                      backgroundColor: isActive ? "var(--color-bg-input)" : "transparent",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    <span className="flex-1 text-left truncate"># {ch.name}</span>
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
            </>
          )}
        </div>
      </div>

      <div className="px-3 py-1.5 border-t text-[10px]" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
        WS: {status}
      </div>
    </div>
  );

  const settingsPanel = (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--color-border)" }}>
        <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {activeChannelData?.name || "Channel"} — Members
        </h3>
        <button
          onClick={() => setShowSettings(false)}
          className="text-xs px-2 py-1 rounded"
          style={{ backgroundColor: "var(--color-bg-input)", color: "var(--color-text-primary)" }}
        >Back</button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between px-2 py-1.5 rounded text-xs" style={{ backgroundColor: "var(--color-bg-input)" }}>
            <div className="flex items-center gap-2 min-w-0 cursor-pointer" onClick={() => navigate(`/profile/${m.user}`)}>
              {m.avatar_url ? (
                <img src={m.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: "var(--color-primary)", color: "white" }}>{m.username[0]?.toUpperCase()}</div>
              )}
              <span className="truncate" style={{ color: "var(--color-text-primary)" }}>{m.display_name || m.username}</span>
              {m.role === "owner" && (
                <>
                  <span className="text-[9px] px-1 rounded" style={{ backgroundColor: "#FCD34D20", color: "#FCD34D" }}>OWNER</span>
                  <span className="text-[9px] px-1 rounded" style={{ backgroundColor: "#60A5FA20", color: "#60A5FA" }}>ADMIN</span>
                </>
              )}
              {m.role === "admin" && <span className="text-[9px] px-1 rounded" style={{ backgroundColor: "#60A5FA20", color: "#60A5FA" }}>ADMIN</span>}
              {m.muted_until && <span className="text-[9px] px-1 rounded" style={{ backgroundColor: "#EF444420", color: "#EF4444" }}>MUTED</span>}
            </div>
            {m.user !== user?.id && isOwner && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {m.role !== "owner" && (
                  <>
                    {m.role === "admin" ? (
                      <button onClick={() => handleChangeRole(m.id, "member")} className="px-1.5 py-0.5 rounded text-[9px] text-white" style={{ backgroundColor: "#F59E0B" }}>Demote</button>
                    ) : (
                      <button onClick={() => handleChangeRole(m.id, "admin")} className="px-1.5 py-0.5 rounded text-[9px] text-white" style={{ backgroundColor: "#3B82F6" }}>Admin</button>
                    )}
                    <button onClick={() => handleMute(m.id, m.muted_until ? 0 : 5)}
                      className="px-1.5 py-0.5 rounded text-[9px] text-white"
                      style={{ backgroundColor: "#6B7280" }}
                      title={m.muted_until ? "Unmute" : "Mute"}>
                      {m.muted_until ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                      )}
                    </button>
                    <button onClick={() => setKickConfirm(m)}
                      className="px-1.5 py-0.5 rounded text-[9px] text-white"
                      style={{ backgroundColor: "#DC2626" }}>Kick</button>
                  </>
                )}
              </div>
            )}
            {m.user !== user?.id && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {friendUserIds.has(m.user) && <span className="text-[9px] text-green-500">●</span>}
                <button
                  onClick={() => handleOpenDM(m.user)}
                  className="px-1.5 py-0.5 rounded text-[9px] text-white"
                  style={{ backgroundColor: "#3B82F6" }}
                  title="Send Message"
                >💬</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {isOwner ? (
        <div className="px-3 py-2 border-t" style={{ borderColor: "var(--color-border)" }}>
          <button onClick={handleDeleteChannel}
            className="w-full py-1.5 rounded text-xs font-medium text-white"
            style={{ backgroundColor: "#DC2626" }}>Delete Channel</button>
        </div>
      ) : activeChannelData?.channel_type === "public" ? (
        <div className="px-3 py-2 border-t" style={{ borderColor: "var(--color-border)" }}>
          <button onClick={async () => { if (!activeChannel) return; try { await leaveChannel(activeChannel); setChannels((prev) => prev.filter((c) => c.id !== activeChannel)); setActiveChannel(null); setShowSettings(false); } catch {} }}
            className="w-full py-1.5 rounded text-xs font-medium"
            style={{ backgroundColor: "#F59E0B", color: "white" }}>Leave Channel</button>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}

      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        {open && (
          <div
            className="w-[480px] h-[500px] rounded-xl shadow-2xl flex overflow-hidden relative"
            style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {kickConfirm && (
              <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
                <div className="rounded-xl p-4 mx-4 shadow-2xl" style={{ backgroundColor: "var(--color-bg-card)" }}>
                  <p className="text-sm mb-3" style={{ color: "var(--color-text-primary)" }}>
                    Are you sure you want to kick <strong>{kickConfirm.display_name || kickConfirm.username}</strong>?
                  </p>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setKickConfirm(null)}
                      className="px-3 py-1.5 rounded text-xs"
                      style={{ backgroundColor: "var(--color-bg-input)", color: "var(--color-text-primary)" }}
                    >Cancel</button>
                    <button
                      onClick={handleKickConfirm}
                      className="px-3 py-1.5 rounded text-xs text-white"
                      style={{ backgroundColor: "#DC2626" }}
                    >Kick</button>
                  </div>
                </div>
              </div>
            )}

            {showInvitePicker && (
              <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
                <div className="rounded-xl p-4 mx-4 shadow-2xl" style={{ backgroundColor: "var(--color-bg-card)" }}>
                  <p className="text-sm mb-3" style={{ color: "var(--color-text-primary)" }}>Choose a game to play</p>
                  <div className="flex flex-col gap-2">
                    {["pong", "pong3d", "tictactoe"].map((g) => (
                      <button
                        key={g}
                        onClick={() => handleSendInvite(g)}
                        className="px-4 py-2 rounded text-xs font-medium text-white text-left"
                        style={{ backgroundColor: "var(--color-primary)" }}
                      >{g === "pong3d" ? "Pong 3D" : g.charAt(0).toUpperCase() + g.slice(1)}</button>
                    ))}
                    <button
                      onClick={() => { setShowInvitePicker(false); setInviteTarget(null); }}
                      className="px-4 py-2 rounded text-xs"
                      style={{ backgroundColor: "var(--color-bg-input)", color: "var(--color-text-primary)" }}
                    >Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {gameInvite && (
              <div className="absolute bottom-0 left-0 right-0 z-50 p-3 border-t animate-slideUp" style={{ backgroundColor: "var(--color-bg-card)", borderColor: "var(--color-border)" }}>
                <p className="text-xs mb-2" style={{ color: "var(--color-text-primary)" }}>
                  <strong>{gameInvite.from_username}</strong> invited you to play <strong>{gameInvite.game_type === "pong3d" ? "Pong 3D" : gameInvite.game_type.charAt(0).toUpperCase() + gameInvite.game_type.slice(1)}</strong>
                </p>
                <div className="flex gap-2">
                  <button onClick={() => { sendGameInviteResponse(gameInvite.channel_id, gameInvite.game_type, gameInvite.game_id, true); clearGameInvite(); }}
                    className="px-3 py-1 rounded text-xs text-white" style={{ backgroundColor: "#22C55E" }}>Accept</button>
                  <button onClick={() => { sendGameInviteResponse(gameInvite.channel_id, gameInvite.game_type, gameInvite.game_id, false); clearGameInvite(); }}
                    className="px-3 py-1 rounded text-xs" style={{ backgroundColor: "var(--color-bg-input)", color: "var(--color-text-primary)" }}>Decline</button>
                </div>
              </div>
            )}

            {friendNotif && (
              <div className="absolute bottom-14 left-0 right-0 z-50 p-3 border-t" style={{ backgroundColor: "var(--color-bg-card)", borderColor: "var(--color-border)" }}>
                <p className="text-xs mb-2" style={{ color: "var(--color-text-primary)" }}>
                  <strong>{friendNotif.from_display_name || friendNotif.from_username}</strong> sent you a friend request
                </p>
                <div className="flex gap-2">
                  <button onClick={handleAcceptFriendNotif}
                    className="px-3 py-1 rounded text-xs text-white" style={{ backgroundColor: "#22C55E" }}>Accept</button>
                  <button onClick={handleDismissFriendNotif}
                    className="px-3 py-1 rounded text-xs" style={{ backgroundColor: "var(--color-bg-input)", color: "var(--color-text-primary)" }}>Dismiss</button>
                </div>
              </div>
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
            ) : showSettings && activeChannelData?.channel_type === "dm" ? (
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
            ) : showSettings ? (
              settingsPanel
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
                    onTitleClick={activeChannelData?.channel_type === "dm" && activeChannelData?.dm_partner?.id ? () => navigate(`/profile/${activeChannelData!.dm_partner!.id}`) : undefined}
                    onSettingsClick={() => {
                      fetchMembers(activeChannel).then(setMembers).catch(() => {});
                      setShowSettings(true);
                    }}
                    blockedUserIds={blockedUserIds}
                    onBlockUser={(uid) => handleBlock(uid)}
                    onProfileClick={(uid) => navigate(`/profile/${uid}`)}
                    onInviteGame={handleInviteGame}
                    friendUserIds={friendUserIds}
                    pendingSentIds={pendingSentIds}
                    pendingReceivedIds={pendingReceivedIds}
                    onFriendAction={handleFriendAction}
                    dmPartnerReadUntil={activeChannelData?.channel_type === "dm" ? activeChannelData?.dm_partner?.read_until || null : null}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No channels available</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => { setOpen(!open); if (!open) { setActiveView("friends"); setActiveChannel(null); } }}
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