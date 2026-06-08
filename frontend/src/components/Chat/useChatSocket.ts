import { useCallback, useState } from "react";
import { useGameSocket, WsStatus } from "../../hooks/useGameSocket";

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender: string | null;
  sender_username: string | null;
  sender_avatar: string;
  message_type: "text" | "emote" | "system";
  content: string;
  emote_id: string;
  created_at: string;
}

interface UseChatSocketReturn {
  status: WsStatus;
  messages: Record<string, ChatMessage[]>;
  connectedChannels: string[];
  sendMessage: (channelId: string, content: string) => void;
  sendEmote: (channelId: string, emoteId: string) => void;
  sendEmoteToUser: (userId: string, emoteId: string) => void;
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  requestHistory: (channelId: string) => void;
}

export function useChatSocket(): UseChatSocketReturn {
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [connectedChannels, setConnectedChannels] = useState<string[]>([]);

  const onMessage = useCallback((data: Record<string, unknown>) => {
    const type = data.type as string;

    if (type === "connected") {
      const channels = (data.channels as string[]) || [];
      setConnectedChannels(channels);
    } else if (type === "chat.message" || type === "message") {
      const msg = data as unknown as ChatMessage;
      const cid = msg.channel_id;
      setMessages((prev) => {
        const existing = prev[cid] || [];
        if (existing.some((m) => m.id === msg.id)) return prev;
        return { ...prev, [cid]: [...existing, msg] };
      });
    } else if (type === "history") {
      const cid = data.channel_id as string;
      const msgs = (data.messages as ChatMessage[]) || [];
      setMessages((prev) => ({ ...prev, [cid]: msgs }));
    } else if (type === "joined") {
      const cid = data.channel_id as string;
      setConnectedChannels((prev) => (prev.includes(cid) ? prev : [...prev, cid]));
    } else if (type === "left") {
      const cid = data.channel_id as string;
      setConnectedChannels((prev) => prev.filter((c) => c !== cid));
      setMessages((prev) => {
        const next = { ...prev };
        delete next[cid];
        return next;
      });
    }
  }, []);

  const { send, status } = useGameSocket("/ws/chat/", { onMessage });

  const sendMessage = useCallback(
    (channelId: string, content: string) => {
      send({ type: "send_message", channel_id: channelId, content });
    },
    [send],
  );

  const sendEmote = useCallback(
    (channelId: string, emoteId: string) => {
      send({ type: "send_emote", channel_id: channelId, emote_id: emoteId });
    },
    [send],
  );

  const sendEmoteToUser = useCallback(
    (userId: string, emoteId: string) => {
      send({ type: "send_emote", target_user_id: userId, emote_id: emoteId });
    },
    [send],
  );

  const joinChannel = useCallback(
    (channelId: string) => {
      send({ type: "join_channel", channel_id: channelId });
    },
    [send],
  );

  const leaveChannel = useCallback(
    (channelId: string) => {
      send({ type: "leave_channel", channel_id: channelId });
    },
    [send],
  );

  const requestHistory = useCallback(
    (channelId: string) => {
      send({ type: "get_history", channel_id: channelId });
    },
    [send],
  );

  return {
    status,
    messages,
    connectedChannels,
    sendMessage,
    sendEmote,
    sendEmoteToUser,
    joinChannel,
    leaveChannel,
    requestHistory,
  };
}
