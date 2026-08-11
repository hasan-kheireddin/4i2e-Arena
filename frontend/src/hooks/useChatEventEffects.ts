import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Channel, FriendshipRecord } from "../services/chat";
import type { GameInvite, FriendRequestEvent, ChatMessage, ChatErrorEvent } from "../components/Chat/useChatSocket";
import { useNotificationCenter } from "../context/NotificationCenterContext";
import type { ToastData } from "../context/ToastContext";

interface ChatEventEffectsProps {
  gameInvite: GameInvite | null;
  gameInviteAccepted: { game_id: string; game_type: string; accepted_by?: string; accepted_by_username?: string } | null;
  clearGameInviteAccepted: () => void;
  friendAccepted: { friendship_id: string; by_user_id?: string; by_username?: string } | null;
  clearFriendAccepted: () => void;
  friendRemoved: { friendship_id: string } | null;
  clearFriendRemoved: () => void;
  wsFriendRequest: FriendRequestEvent | null;
  clearFriendRequest: () => void;
  readReceipt: { channel_id: string; read_until: string } | null;
  clearReadReceipt: () => void;
  chatError?: ChatErrorEvent | null;
  clearChatError?: () => void;
  onNewMessageRef?: { current: ((msg: ChatMessage) => void) | null };

  setChannels: (updater: (prev: Channel[]) => Channel[]) => void;
  setFriendships: (updater: (prev: FriendshipRecord[]) => FriendshipRecord[]) => void;
  showToast: (item: ToastData) => void;
  navigateToChat?: (channelId: string) => void;
  navigateToProfile?: (userId: string) => void;

  // For DM message notifications
  currentUserId?: string | null;
  channels?: Channel[];
  activeChannel?: string | null;
}

function gameLabel(gameType: string): string {
  return gameType === "pong" ? "Pong"
    : gameType === "pong3d" ? "3D Pong"
    : gameType === "tictactoe" ? "Tic Tac Toe"
    : gameType;
}

export function useChatEventEffects(props: ChatEventEffectsProps) {
  const navigate = useNavigate();
  const { addNotification } = useNotificationCenter();
  const [friendNotif, setFriendNotif] = useState<FriendRequestEvent | null>(null);

  // Socket callbacks fire outside React's render cycle, so anything they read
  // has to come from a ref. Reading `props.channels` through a closure meant the
  // mute flag was whatever it was when that closure was built — a message
  // arriving between the toggle request and its re-render used the old value,
  // which is why muting appeared to work only some of the time.
  const liveRef = useRef(props);
  liveRef.current = props;

  // Incoming friend request — the bell reads pending requests off the friendship
  // list, so this only needs the live toast plus the optimistic list insert.
  useEffect(() => {
    if (!props.wsFriendRequest) return;
    const req = props.wsFriendRequest;
    setFriendNotif(req);
    props.clearFriendRequest();
    const name = req.from_display_name || req.from_username;
    props.showToast({
      title: `${name} sent you a friend request`,
      description: "Open notifications to confirm",
      variant: "friend",
      avatar: req.from_avatar,
      onClick: props.navigateToProfile ? () => props.navigateToProfile!(req.from_user_id) : undefined,
    });
    props.setFriendships((prev) => {
      if (prev.some((f) => f.other_user_id === req.from_user_id)) return prev;
      return [...prev, {
        id: req.friendship_id,
        other_user_id: req.from_user_id,
        other_username: req.from_username,
        other_display_name: req.from_display_name,
        other_avatar: req.from_avatar,
        status: "pending" as const,
        direction: "received" as const,
        created_at: new Date().toISOString(),
      }];
    });
  }, [props.wsFriendRequest, props.clearFriendRequest, props.setFriendships, props.showToast]);

  useEffect(() => {
    const invite = props.gameInvite;
    if (!invite) return;
    const muteCh = liveRef.current.channels?.find((c) => c.id === invite.channel_id);
    if (muteCh?.notifications_muted) return;
    const label = gameLabel(invite.game_type);
    props.showToast({
      title: `${invite.from_username} invited you to play ${label}`,
      description: "Tap to answer before it expires",
      variant: "invite",
      onClick: props.navigateToChat && invite.channel_id ? () => props.navigateToChat!(invite.channel_id) : undefined,
    });
    addNotification({
      kind: "invite",
      actor: invite.from_username,
      title: `invited you to play ${label}.`,
      channelId: invite.channel_id || undefined,
      link: invite.channel_id ? `/chat?channel=${invite.channel_id}` : "/chat",
      dedupeKey: `invite-${invite.game_id}`,
    });
  }, [props.gameInvite?.game_id, props.showToast]);

  // Someone accepted the request this account sent.
  useEffect(() => {
    if (!props.friendAccepted) return;
    const accepted = props.friendAccepted;
    props.setFriendships((prev) =>
      prev.map((f) => (f.id === accepted.friendship_id ? { ...f, status: "accepted" } : f)),
    );
    const name = accepted.by_username;
    if (name) {
      props.showToast({
        title: `${name} accepted your friend request`,
        description: "You are now friends",
        variant: "friend_accepted",
        onClick: accepted.by_user_id ? () => navigate(`/profile/${accepted.by_user_id}`) : undefined,
      });
      addNotification({
        kind: "friend_accepted",
        actor: name,
        title: "accepted your friend request.",
        link: accepted.by_user_id ? `/profile/${accepted.by_user_id}` : undefined,
        dedupeKey: `friend-accepted-${accepted.friendship_id}`,
      });
    }
    props.clearFriendAccepted();
  }, [props.friendAccepted, props.clearFriendAccepted, props.setFriendships]);

  useEffect(() => {
    if (!props.friendRemoved) return;
    props.setFriendships((prev) => prev.filter((f) => f.id !== props.friendRemoved!.friendship_id));
    props.clearFriendRemoved();
  }, [props.friendRemoved, props.clearFriendRemoved, props.setFriendships]);

  useEffect(() => {
    if (!props.gameInviteAccepted) return;
    const accepted = props.gameInviteAccepted;
    const gtype = accepted.game_type === "pong3d" ? "pong3d" : accepted.game_type;
    // Only the player who sent the invite needs telling that it was accepted —
    // the one who clicked Accept just watched themselves do it.
    const acceptedBySomeoneElse = !!accepted.accepted_by
      && !!props.currentUserId
      && accepted.accepted_by !== props.currentUserId;
    if (acceptedBySomeoneElse && accepted.accepted_by_username) {
      props.showToast({
        title: `${accepted.accepted_by_username} accepted your invite`,
        description: `Starting ${gameLabel(accepted.game_type)}`,
        variant: "invite",
        duration: 3000,
      });
    }
    navigate(`/games/${gtype}?game_id=${accepted.game_id}`);
    props.clearGameInviteAccepted();
  }, [props.gameInviteAccepted, navigate, props.clearGameInviteAccepted]);

  // Invites carry no visible timer, so a refusal from the server — a dead or
  // already-used invite — is the only signal the player gets.
  useEffect(() => {
    if (!props.chatError) return;
    props.showToast({
      title: props.chatError.message,
      variant: "info",
      duration: 4000,
    });
    props.clearChatError?.();
  }, [props.chatError, props.clearChatError, props.showToast]);

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

  // Direct messages surface as a toast only — they stay out of the bell, where
  // the unread badges in the chat list already track them.
  //
  // Installed in an effect rather than during render: a render can be thrown
  // away before it commits, and installing from one would leave a handler
  // holding state the app never actually adopted.
  const onNewMessageRef = props.onNewMessageRef;
  useEffect(() => {
    if (!onNewMessageRef) return;
    onNewMessageRef.current = (msg: ChatMessage) => {
      const live = liveRef.current;
      if (!msg.sender || !live.currentUserId) return;
      if (msg.sender === live.currentUserId) return;
      if (msg.channel_id === live.activeChannel) return;
      const ch = live.channels?.find((c) => c.id === msg.channel_id);
      if (ch?.notifications_muted) return;
      const preview = msg.message_type === "emote"
        ? "Sent a reaction"
        : msg.content.length > 70 ? `${msg.content.slice(0, 70)}…` : msg.content;
      live.showToast({
        title: msg.sender_username || "New message",
        description: preview,
        variant: "message",
        avatar: msg.sender_avatar || undefined,
        onClick: live.navigateToChat ? () => live.navigateToChat!(msg.channel_id) : undefined,
      });
    };
    return () => { onNewMessageRef.current = null; };
  }, [onNewMessageRef]);

  return friendNotif;
}
