import { apiFetch } from "./api";

export interface DmPartner {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  read_until: string | null;
}

export interface Channel {
  id: string;
  name: string;
  channel_type: "dm";
  owner: string | null;
  created_at: string;
  member_count: number;
  unread_count: number;
  dm_partner: DmPartner | null;
  read_until: string | null;
  membership_id: string | null;
  muted_until: string | null;
  notifications_muted: boolean;
  last_message: {
    id: string;
    sender: string | null;
    sender_username: string | null;
    message_type: string;
    content: string;
    emote_id: string;
    created_at: string;
  } | null;
}

export interface Message {
  id: string;
  channel: string;
  sender: string | null;
  sender_username: string | null;
  sender_avatar: string;
  message_type: "text" | "emote" | "system";
  content: string;
  emote_id: string;
  created_at: string;
}

export interface BlockRecord {
  id: string;
  blocker: string;
  blocked: string;
  blocked_username: string;
  blocked_display_name: string;
  blocked_avatar: string;
  created_at: string;
}

export interface SearchUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

export async function searchUsers(query: string): Promise<SearchUser[]> {
  return apiFetch<SearchUser[]>(`/api/accounts/users/search/?q=${encodeURIComponent(query)}`);
}

export async function fetchChannels(): Promise<Channel[]> {
  return apiFetch<Channel[]>("/api/chat/channels/");
}

export async function fetchMessages(channelId: string): Promise<Message[]> {
  return apiFetch<Message[]>(`/api/chat/channels/${channelId}/messages/`);
}

export async function getOrCreateDM(targetUserId: string): Promise<Channel> {
  return apiFetch<Channel>("/api/chat/channels/dm/", {
    method: "POST",
    body: { target_user_id: targetUserId },
  });
}

export async function markChannelRead(channelId: string): Promise<{ read_until: string }> {
  return apiFetch<{ read_until: string }>(`/api/chat/channels/${channelId}/mark_read/`, {
    method: "POST",
  });
}

export async function toggleNotificationMute(
  channelId: string,
): Promise<{ notifications_muted: boolean; membership_id: string }> {
  return apiFetch<{ notifications_muted: boolean; membership_id: string }>(
    `/api/chat/channels/${channelId}/members/toggle_notification_mute/`,
    { method: "POST" },
  );
}

export async function fetchBlocks(): Promise<BlockRecord[]> {
  return apiFetch<BlockRecord[]>("/api/chat/blocks/");
}

export async function blockUser(userId: string): Promise<BlockRecord> {
  return apiFetch<BlockRecord>("/api/chat/blocks/", {
    method: "POST",
    body: { blocked: userId },
  });
}

export async function unblockUser(blockId: string): Promise<void> {
  return apiFetch<void>(`/api/chat/blocks/${blockId}/`, {
    method: "DELETE",
  });
}

// ── Friends ─────────────────────────────────────────────────────────────────

export interface FriendshipRecord {
  id: string;
  other_user_id: string;
  other_username: string;
  other_display_name: string;
  other_avatar: string;
  status: "pending" | "accepted";
  direction: "sent" | "received";
  created_at: string;
}

export async function fetchFriendships(): Promise<FriendshipRecord[]> {
  return apiFetch<FriendshipRecord[]>("/api/chat/friendships/");
}

export async function sendFriendRequest(userId: string): Promise<FriendshipRecord> {
  return apiFetch<FriendshipRecord>("/api/chat/friendships/", {
    method: "POST",
    body: { to_user: userId },
  });
}

export async function acceptFriendRequest(friendshipId: string): Promise<FriendshipRecord> {
  return apiFetch<FriendshipRecord>(`/api/chat/friendships/${friendshipId}/accept/`, {
    method: "POST",
  });
}

export async function rejectFriendRequest(friendshipId: string): Promise<void> {
  return apiFetch<void>(`/api/chat/friendships/${friendshipId}/reject/`, {
    method: "POST",
  });
}

export async function removeFriend(friendshipId: string): Promise<void> {
  return apiFetch<void>(`/api/chat/friendships/${friendshipId}/`, {
    method: "DELETE",
  });
}
