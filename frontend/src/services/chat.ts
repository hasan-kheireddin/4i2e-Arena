import { apiFetch } from "./api";

export interface Channel {
  id: string;
  name: string;
  channel_type: "public" | "private" | "protected" | "dm" | "game";
  owner: string | null;
  created_at: string;
  member_count: number;
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

export async function fetchChannels(): Promise<Channel[]> {
  return apiFetch<Channel[]>("/api/chat/channels/");
}

export async function fetchMessages(channelId: string): Promise<Message[]> {
  return apiFetch<Message[]>(`/api/chat/channels/${channelId}/messages/`);
}

export async function createChannel(data: {
  name: string;
  channel_type: string;
  password?: string;
}): Promise<Channel> {
  return apiFetch<Channel>("/api/chat/channels/", {
    method: "POST",
    body: data,
  });
}
