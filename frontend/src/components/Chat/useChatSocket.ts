import { useCallback, useRef, useState } from "react";
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

export interface TypingUser {
  userId: string;
  username: string;
}

export interface GameInvite {
  from_user_id: string;
  from_username: string;
  game_type: string;
  channel_id: string;
  game_id: string;
}

export interface GameInviteAccepted {
  game_id: string;
  game_type: string;
  opponent_id: string;
  opponent_username: string;
  accepted_by: string;
  accepted_by_username: string;
}

export interface FriendRequestEvent {
  friendship_id: string;
  from_user_id: string;
  from_username: string;
  from_display_name: string;
  from_avatar: string;
}

interface ReadReceiptEvent {
  channel_id: string;
  read_until: string;
}

interface UseChatSocketReturn {
  status: WsStatus;
  messages: Record<string, ChatMessage[]>;
  connectedChannels: string[];
  typingUsers: Record<string, TypingUser[]>;
  gameInvite: GameInvite | null;
  clearGameInvite: () => void;
  gameInviteAccepted: GameInviteAccepted | null;
  clearGameInviteAccepted: () => void;
  onlineUserIds: Set<string>;
  friendRequest: FriendRequestEvent | null;
  clearFriendRequest: () => void;
  readReceipt: ReadReceiptEvent | null;
  clearReadReceipt: () => void;
  reconnectCount: number;
  sendMessage: (channelId: string, content: string) => void;
  sendEmote: (channelId: string, emoteId: string) => void;
  sendEmoteToUser: (userId: string, emoteId: string) => void;
  sendTyping: (channelId: string) => void;
  sendGameInvite: (targetUserId: string, gameType: string) => void;
  sendGameInviteResponse: (channelId: string, gameType: string, gameId: string, accept: boolean) => void;
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  requestHistory: (channelId: string) => void;
}

const TYPING_TIMEOUT = 3000;
const TYPING_THROTTLE = 2000;

export function useChatSocket(): UseChatSocketReturn {
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [connectedChannels, setConnectedChannels] = useState<string[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, TypingUser[]>>({});
  const [gameInvite, setGameInvite] = useState<GameInvite | null>(null);
  const [gameInviteAccepted, setGameInviteAccepted] = useState<GameInviteAccepted | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [friendRequest, setFriendRequest] = useState<FriendRequestEvent | null>(null);
  const [readReceipt, setReadReceipt] = useState<ReadReceiptEvent | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const typingTimers = useRef<Record<string, Record<string, ReturnType<typeof setTimeout>>>>({});
  const lastTypingSent = useRef<Record<string, number>>({});

  const onMessage = useCallback((data: Record<string, unknown>) => {
    const type = data.type as string;

    if (type === "connected") {
      const channels = (data.channels as string[]) || [];
      setConnectedChannels(channels);
      const onlineIds = (data.online_user_ids as string[]) || [];
      setOnlineUserIds(new Set(onlineIds));
      setReconnectCount((c) => c + 1);
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
    } else if (type === "game_invite") {
      setGameInvite({
        from_user_id: data.from_user_id as string,
        from_username: data.from_username as string,
        game_type: data.game_type as string,
        channel_id: data.channel_id as string,
        game_id: data.game_id as string,
      });
    } else if (type === "game_invite_accepted") {
      setGameInviteAccepted({
        game_id: data.game_id as string,
        game_type: data.game_type as string,
        opponent_id: data.opponent_id as string,
        opponent_username: data.opponent_username as string,
        accepted_by: data.accepted_by as string,
        accepted_by_username: data.accepted_by_username as string,
      });
    } else if (type === "kicked") {
      const cid = data.channel_id as string;
      setConnectedChannels((prev) => prev.filter((c) => c !== cid));
      setMessages((prev) => {
        const next = { ...prev };
        delete next[cid];
        return next;
      });
    } else if (type === "chat.typing") {
      const cid = data.channel_id as string;
      const userId = data.user_id as string;
      const username = data.username as string;

      setTypingUsers((prev) => {
        const list = prev[cid] || [];
        if (list.some((u) => u.userId === userId)) return prev;
        return { ...prev, [cid]: [...list, { userId, username }] };
      });

      if (!typingTimers.current[cid]) typingTimers.current[cid] = {};
      if (typingTimers.current[cid][userId]) clearTimeout(typingTimers.current[cid][userId]);
      typingTimers.current[cid][userId] = setTimeout(() => {
        setTypingUsers((prev) => {
          const list = (prev[cid] || []).filter((u) => u.userId !== userId);
          if (list.length === 0) {
            const next = { ...prev };
            delete next[cid];
            return next;
          }
          return { ...prev, [cid]: list };
        });
      }, TYPING_TIMEOUT);
    } else if (type === "user_online") {
      const uid = data.user_id as string;
      setOnlineUserIds((prev) => new Set(prev).add(uid));
    } else if (type === "user_offline") {
      const uid = data.user_id as string;
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        next.delete(uid);
        return next;
      });
    } else if (type === "presence_list") {
      const ids = (data.online_user_ids as string[]) || [];
      setOnlineUserIds(new Set(ids));
    } else if (type === "friend_request_received") {
      setFriendRequest({
        friendship_id: data.friendship_id as string,
        from_user_id: data.from_user_id as string,
        from_username: data.from_username as string,
        from_display_name: data.from_display_name as string,
        from_avatar: data.from_avatar as string,
      });
    } else if (type === "friend_request_accepted") {
      // Could show a toast/notification here
    } else if (type === "read_receipt") {
      setReadReceipt({
        channel_id: data.channel_id as string,
        read_until: data.read_until as string,
      });
    }
  }, []);

  const { send, status } = useGameSocket("/ws/chat/", {
    onMessage,
    enableLatencyProbe: true,
  });

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

  const sendGameInvite = useCallback(
    (targetUserId: string, gameType: string) => {
      send({ type: "game_invite", target_user_id: targetUserId, game_type: gameType });
    },
    [send],
  );

  const clearGameInvite = useCallback(() => {
    setGameInvite(null);
  }, []);

  const clearGameInviteAccepted = useCallback(() => {
    setGameInviteAccepted(null);
  }, []);

  const sendGameInviteResponse = useCallback(
    (channelId: string, gameType: string, gameId: string, accept: boolean) => {
      send({ type: "game_invite_response", channel_id: channelId, game_type: gameType, game_id: gameId, accept });
    },
    [send],
  );

  const clearFriendRequest = useCallback(() => {
    setFriendRequest(null);
  }, []);

  const clearReadReceipt = useCallback(() => {
    setReadReceipt(null);
  }, []);

  const sendTyping = useCallback(
    (channelId: string) => {
      const now = Date.now();
      if (lastTypingSent.current[channelId] && now - lastTypingSent.current[channelId] < TYPING_THROTTLE) return;
      lastTypingSent.current[channelId] = now;
      send({ type: "typing", channel_id: channelId });
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
    typingUsers,
    gameInvite,
    clearGameInvite,
    gameInviteAccepted,
    clearGameInviteAccepted,
    onlineUserIds,
    friendRequest,
    clearFriendRequest,
    readReceipt,
    clearReadReceipt,
    reconnectCount,
    sendMessage,
    sendEmote,
    sendEmoteToUser,
    sendTyping,
    sendGameInvite,
    sendGameInviteResponse,
    joinChannel,
    leaveChannel,
    requestHistory,
  };
}
