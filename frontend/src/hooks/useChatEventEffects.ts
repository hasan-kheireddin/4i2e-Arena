import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Channel } from "../services/chat";
import type { GameInvite, FriendRequestEvent, ChatMessage } from "../components/Chat/useChatSocket";
import { useNotificationCenter } from "../context/NotificationCenterContext";

interface ChatEventEffectsProps {
  gameInvite: GameInvite | null;
  gameInviteAccepted: { game_id: string; game_type: string } | null;
  clearGameInviteAccepted: () => void;
  friendAccepted: { friendship_id: string } | null;
  clearFriendAccepted: () => void;
  friendRemoved: { friendship_id: string } | null;
  clearFriendRemoved: () => void;
  wsFriendRequest: FriendRequestEvent | null;
  clearFriendRequest: () => void;
  readReceipt: { channel_id: string; read_until: string } | null;
  clearReadReceipt: () => void;
  onNewMessageRef?: { current: ((msg: ChatMessage) => void) | null };

  setChannels: (updater: (prev: Channel[]) => Channel[]) => void;
  setFriendships: (updater: (prev: any[]) => any[]) => void;
  showToast: (item: { message: string; icon?: "game" | "friend" | "xp" | "achievement" | "success"; tone?: "success" | "achievement" | "message"; avatar?: string; onClick?: () => void }) => void;
  setActiveView?: (view: "chat" | "friends") => void;
  navigateToChat?: (channelId: string) => void;
  navigateToProfile?: (userId: string) => void;

  // For DM message notifications
  currentUserId?: string | null;
  channels?: Channel[];
  activeChannel?: string | null;
}

export function useChatEventEffects(props: ChatEventEffectsProps) {
  const navigate = useNavigate();
  const { addNotification } = useNotificationCenter();
  const [friendNotif, setFriendNotif] = useState<FriendRequestEvent | null>(null);

  useEffect(() => {
    if (!props.wsFriendRequest) return;
    setFriendNotif(props.wsFriendRequest);
    props.clearFriendRequest();
    props.setActiveView?.("friends");
    const name = props.wsFriendRequest.from_display_name || props.wsFriendRequest.from_username;
    const onClick = props.navigateToProfile ? () => props.navigateToProfile!(props.wsFriendRequest!.from_user_id) : undefined;
    props.showToast({ message: `${name} sent you a friend request`, icon: "friend", onClick });
    addNotification({ kind: "friend", title: `${name} sent you a friend request`, avatar: props.wsFriendRequest.from_avatar, onClick });
    props.setFriendships((prev: any[]) => {
      if (prev.some((f: any) => f.other_user_id === props.wsFriendRequest!.from_user_id)) return prev;
      return [...prev, {
        id: props.wsFriendRequest!.friendship_id,
        other_user_id: props.wsFriendRequest!.from_user_id,
        other_username: props.wsFriendRequest!.from_username,
        other_display_name: props.wsFriendRequest!.from_display_name,
        other_avatar: props.wsFriendRequest!.from_avatar,
        status: "pending" as const,
        direction: "received" as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }];
    });
  }, [props.wsFriendRequest, props.clearFriendRequest, props.setFriendships, props.showToast, props.setActiveView]);

  useEffect(() => {
    const invite = props.gameInvite;
    if (!invite) return;
    const muteCh = props.channels?.find((c) => c.id === invite.channel_id);
    if (muteCh?.notifications_muted) return;
    const label = invite.game_type === "pong" ? "Pong" : invite.game_type === "pong3d" ? "3D Pong" : invite.game_type === "tictactoe" ? "Tic Tac Toe" : invite.game_type;
    const onClick = props.navigateToChat && invite.channel_id ? () => props.navigateToChat!(invite.channel_id) : undefined;
    const message = `${invite.from_username} invited you to play ${label}!`;
    props.showToast({ message, icon: "game", onClick });
    addNotification({ kind: "invite", title: message, onClick });
  }, [props.gameInvite?.game_id, props.showToast]);

  useEffect(() => {
    if (!props.friendAccepted) return;
    props.setFriendships((prev: any[]) =>
      prev.map((f: any) =>
        f.id === props.friendAccepted!.friendship_id ? { ...f, status: "accepted" as const } : f
      )
    );
    props.clearFriendAccepted();
  }, [props.friendAccepted, props.clearFriendAccepted, props.setFriendships]);

  useEffect(() => {
    if (!props.friendRemoved) return;
    props.setFriendships((prev: any[]) =>
      prev.filter((f: any) => f.id !== props.friendRemoved!.friendship_id)
    );
    props.clearFriendRemoved();
  }, [props.friendRemoved, props.clearFriendRemoved, props.setFriendships]);

  useEffect(() => {
    if (!props.gameInviteAccepted) return;
    const gtype = props.gameInviteAccepted.game_type === "pong3d" ? "pong3d" : props.gameInviteAccepted.game_type;
    navigate(`/games/${gtype}?game_id=${props.gameInviteAccepted.game_id}`);
    props.clearGameInviteAccepted();
  }, [props.gameInviteAccepted, navigate, props.clearGameInviteAccepted]);

  useEffect(() => {
    if (!props.readReceipt) return;
    props.setChannels((prev: Channel[]) =>
      prev.map((ch: Channel) => {
        if (ch.id === props.readReceipt!.channel_id && ch.dm_partner) {
          return { ...ch, dm_partner: { ...ch.dm_partner, read_until: props.readReceipt!.read_until } };
        }
        return ch;
      })
    );
    props.clearReadReceipt();
  }, [props.readReceipt, props.clearReadReceipt, props.setChannels]);

  // DM message notification via ref callback
  if (props.onNewMessageRef) {
    const showToast = props.showToast;
    const navigateToChat = props.navigateToChat;
    props.onNewMessageRef.current = (msg: ChatMessage) => {
      if (!msg.sender || !props.currentUserId) return;
      if (msg.sender === props.currentUserId) return;
      if (msg.channel_id === props.activeChannel) return;
      const ch = props.channels?.find((c) => c.id === msg.channel_id);
      if (ch?.notifications_muted) return;
      const preview = msg.message_type === "emote"
        ? "sent an emote"
        : msg.content.length > 60 ? msg.content.slice(0, 60) + "…" : msg.content;
      const title = `${msg.sender_username || "Someone"}: ${preview}`;
      const onClick = navigateToChat ? () => navigateToChat(msg.channel_id) : undefined;
      showToast({
        message: title,
        tone: "message",
        avatar: msg.sender_avatar || undefined,
        onClick,
      });
      addNotification({ kind: "message", title, avatar: msg.sender_avatar || undefined, onClick });
    };
  }

  return friendNotif;
}
