import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../services/api";
import {
  sendFriendRequest, acceptFriendRequest, rejectFriendRequest, removeFriend,
  type FriendshipRecord,
} from "../../services/chat";

interface FriendsPanelProps {
  friendships: FriendshipRecord[];
  onFriendshipsChange: (f: FriendshipRecord[]) => void;
  onlineUserIds: Set<string>;
  onOpenDM: (userId: string) => void;
}

interface SearchUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

export default function FriendsPanel({
  friendships, onFriendshipsChange, onlineUserIds,
  onOpenDM,
}: FriendsPanelProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"online" | "all" | "pending" | "add">("online");

  // Add friend search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (tab !== "add" || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await apiFetch<SearchUser[]>(
          `/api/accounts/users/search/?q=${encodeURIComponent(searchQuery)}`
        );
        setSearchResults(results || []);
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, tab]);

  const accepted = friendships.filter((f) => f.status === "accepted");
  const pending = friendships.filter((f) => f.status === "pending");

  const friendList = tab === "online"
    ? accepted.filter((f) => onlineUserIds.has(f.other_user_id))
    : tab === "pending"
      ? pending
      : accepted;

  const handleSendRequest = async (userId: string) => {
    try {
      const created = await sendFriendRequest(userId);
      onFriendshipsChange([...friendships, created as any]);
      setSearchResults((prev) => prev.filter((u) => u.id !== userId));
    } catch {}
  };

  const handleAccept = async (f: FriendshipRecord) => {
    try {
      const updated = await acceptFriendRequest(f.id);
      onFriendshipsChange(friendships.map((fr) => fr.id === f.id ? { ...fr, ...updated } : fr));
    } catch {}
  };

  const handleDecline = async (f: FriendshipRecord) => {
    try {
      await rejectFriendRequest(f.id);
      onFriendshipsChange(friendships.filter((fr) => fr.id !== f.id));
    } catch {}
  };

  const handleRemove = async (f: FriendshipRecord) => {
    try {
      await removeFriend(f.id);
      onFriendshipsChange(friendships.filter((fr) => fr.id !== f.id));
    } catch {}
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b" style={{ borderColor: "var(--color-border)" }}>
        {(["online", "all", "pending", "add"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 px-2 py-2 text-[10px] font-medium uppercase tracking-wider transition-colors"
            style={{
              color: tab === t ? "var(--color-primary)" : "var(--color-text-muted)",
              borderBottom: tab === t ? "2px solid var(--color-primary)" : "2px solid transparent",
            }}
          >
            {t === "online" ? `Online (${accepted.filter((f) => onlineUserIds.has(f.other_user_id)).length})` :
             t === "all" ? `All (${accepted.length})` :
             t === "pending" ? `Pending (${pending.length})` :
             "Add Friend"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {tab === "add" ? (
          <div className="space-y-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by username..."
              autoFocus
              className="w-full rounded-lg px-3 py-2 text-xs outline-none"
              style={{ backgroundColor: "var(--color-bg-input)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
            />
            {searching && (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
              </div>
            )}
            {!searching && searchResults.length === 0 && searchQuery.length >= 2 && (
              <p className="text-xs text-center py-4" style={{ color: "var(--color-text-muted)" }}>No users found</p>
            )}
            {searchResults.map((u) => {
              const existingRel = friendships.find((f) => f.other_user_id === u.id);
              return (
                <div key={u.id} className="flex items-center justify-between px-3 py-2 rounded-lg text-xs"
                  style={{ backgroundColor: "var(--color-bg-input)" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                    ) : (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ backgroundColor: "var(--color-primary)" }}>{u.username[0]?.toUpperCase()}</div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium" style={{ color: "var(--color-text-primary)" }}>{u.display_name || u.username}</p>
                      <p style={{ color: "var(--color-text-muted)" }}>@{u.username}</p>
                    </div>
                  </div>
                  {existingRel ? (
                    existingRel.status === "accepted" ? (
                      <span className="text-[10px]" style={{ color: "#22C55E" }}>Friends</span>
                    ) : (
                      <span className="text-[10px]" style={{ color: "#F59E0B" }}>Pending</span>
                    )
                  ) : (
                    <button onClick={() => handleSendRequest(u.id)}
                      className="px-2.5 py-1 rounded text-[10px] font-medium text-white"
                      style={{ backgroundColor: "var(--color-primary)" }}>Add</button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          friendList.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: "var(--color-text-muted)" }}>
              {tab === "online" ? "No friends online" : tab === "pending" ? "No pending requests" : "No friends yet"}
            </p>
          ) : (
            friendList.map((f) => {
              const isOnline = onlineUserIds.has(f.other_user_id);
              const isPendingReceived = f.status === "pending" && f.direction === "received";
              return (
                  <div key={f.id} className="flex items-center justify-between px-3 py-2 rounded-lg text-xs"
                    style={{ backgroundColor: "var(--color-bg-input)" }}>
                    <div className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/profile/${f.other_user_id}`)}>
                      <div className="relative">
                        {f.other_avatar ? (
                          <img src={f.other_avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                            style={{ backgroundColor: "var(--color-primary)" }}>{f.other_username[0]?.toUpperCase()}</div>
                        )}
                        {tab !== "pending" && (
                          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${isOnline ? "bg-green-500" : "bg-gray-500"}`}
                            style={{ borderColor: "var(--color-bg-input)" }} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium" style={{ color: "var(--color-text-primary)" }}>{f.other_display_name || f.other_username}</p>
                        <p style={{ color: isOnline ? "#22C55E" : "var(--color-text-muted)" }}>
                          {isOnline ? "Online" : "Offline"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isPendingReceived ? (
                      <>
                        <button onClick={() => handleAccept(f)}
                          className="px-2 py-0.5 rounded text-[9px] text-white font-medium"
                          style={{ backgroundColor: "#22C55E" }}>Accept</button>
                        <button onClick={() => handleDecline(f)}
                          className="px-2 py-0.5 rounded text-[9px] text-white font-medium"
                          style={{ backgroundColor: "#EF4444" }}>Decline</button>
                      </>
                    ) : f.status === "pending" ? (
                      <span className="text-[9px] px-1" style={{ color: "#F59E0B" }}>Pending</span>
                    ) : tab !== "pending" ? (
                      <>
                        <button onClick={() => onOpenDM(f.other_user_id)}
                          className="px-1.5 py-0.5 rounded text-[9px] text-white"
                          style={{ backgroundColor: "#3B82F6" }} title="Message">💬</button>
                      </>
                    ) : null}
                    {f.status === "accepted" && (
                      <button onClick={() => handleRemove(f)}
                        className="px-1.5 py-0.5 rounded text-[9px] text-white"
                        style={{ backgroundColor: "#EF4444" }} title="Remove Friend">✕</button>
                    )}
                    {f.status === "pending" && !isPendingReceived && (
                      <button onClick={() => handleRemove(f)}
                        className="px-1.5 py-0.5 rounded text-[9px] text-white"
                        style={{ backgroundColor: "#6B7280" }} title="Cancel">✕</button>
                    )}
                  </div>
                </div>
              );
            })
          )
        )}
      </div>
    </div>
  );
}