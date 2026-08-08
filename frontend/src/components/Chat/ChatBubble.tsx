import { useState, useEffect } from "react";
import { EMOTES } from "../../assets/emotes/emotes";
import { playEmoteSound } from "../../assets/emotes/sound";
import { IconCheck, IconCheckDouble, IconGamepad } from "./ChatIcons";
import type { ChatMessage } from "./useChatSocket";

interface ChatBubbleProps {
  msg: ChatMessage;
  isOwn: boolean;
  onProfileClick?: (userId: string) => void;
  readUntilTimestamp?: string | null;
  dmPartnerReadUntil?: string | null;
  sendGameInviteResponse?: (channelId: string, gameType: string, gameId: string, accept: boolean) => void;
}

/** Own bubbles ride the brand gradient; incoming ones use a theme-aware tint. */
const OWN_BUBBLE: React.CSSProperties = {
  backgroundImage: "var(--gradient-brand)",
  color: "#ffffff",
};

const PEER_BUBBLE: React.CSSProperties = {
  backgroundColor: "rgb(var(--color-text-rgb) / 0.06)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text-primary)",
};

function ReadReceipt({ createdAt, readUntil }: { createdAt: string; readUntil?: string | null }) {
  const seen = !!readUntil && new Date(createdAt) <= new Date(readUntil);
  return (
    <span
      className="mt-0.5 mr-1 flex items-center"
      style={{ color: seen ? "var(--color-success)" : "var(--color-text-muted)" }}
      title={seen ? "Seen" : "Sent"}
    >
      {seen ? <IconCheckDouble size={13} /> : <IconCheck size={13} />}
    </span>
  );
}

export default function ChatBubble({ msg, isOwn, onProfileClick, dmPartnerReadUntil, sendGameInviteResponse }: ChatBubbleProps) {
  const [played, setPlayed] = useState(false);
  const [inviteResponded, setInviteResponded] = useState(false);

  const emoteDef = msg.message_type === "emote" ? EMOTES.find((e) => e.id === msg.emote_id) : null;

  const handleEmoteClick = () => {
    if (played) return;
    setPlayed(true);
    if (emoteDef) {
      playEmoteSound(emoteDef.soundFreq, emoteDef.soundDuration);
    }
    setTimeout(() => setPlayed(false), 1000);
  };

  const isGameInvite = (msg.message_type === "system" || msg.message_type === "game_invite") && !!msg.game_id;
  const [expired, setExpired] = useState(false);
  const [countdown, setCountdown] = useState(30);
  useEffect(() => {
    if (!isGameInvite) return;
    const createdAt = new Date(msg.created_at).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((30000 - (Date.now() - createdAt)) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) setExpired(true);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isGameInvite, msg.created_at]);

  if (isGameInvite) {
    const handleAccept = () => {
      if (inviteResponded || !sendGameInviteResponse || !msg.game_id || !msg.game_type) return;
      setInviteResponded(true);
      sendGameInviteResponse(msg.channel_id, msg.game_type, msg.game_id, true);
    };
    const handleDecline = () => {
      if (inviteResponded || !sendGameInviteResponse || !msg.game_id || !msg.game_type) return;
      setInviteResponded(true);
      sendGameInviteResponse(msg.channel_id, msg.game_type, msg.game_id, false);
    };
    return (
      <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"} mb-2`}>
        <div
          className="max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed break-words flex flex-wrap items-center gap-x-2 gap-y-1"
          style={{
            ...(isOwn ? OWN_BUBBLE : PEER_BUBBLE),
            borderTopLeftRadius: isOwn ? "1rem" : "0.25rem",
            borderTopRightRadius: isOwn ? "0.25rem" : "1rem",
          }}
        >
          <span className="flex items-center gap-1.5" style={{ fontWeight: 500, whiteSpace: "normal" }}>
            <IconGamepad size={15} />
            {msg.content}
          </span>
          {!isOwn && !inviteResponded && !expired && sendGameInviteResponse && (
            <>
              <button onClick={handleAccept}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white hover:opacity-90"
                style={{ backgroundColor: "var(--color-success)" }}>Accept</button>
              <button onClick={handleDecline}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white hover:opacity-90"
                style={{ backgroundColor: "var(--color-danger)" }}>Decline</button>
            </>
          )}
          {!isOwn && inviteResponded && (
            <span className="text-xs opacity-70">Response sent</span>
          )}
          {!isOwn && expired && !inviteResponded && (
            <span className="text-xs font-semibold" style={{ color: isOwn ? "#ffffff" : "var(--color-danger)" }}>Expired</span>
          )}
          {!inviteResponded && !expired && (
            <span className="text-xs opacity-70">Expires in {countdown}s</span>
          )}
          {isOwn && expired && <span className="text-xs opacity-80">Expired</span>}
        </div>
        {isOwn && <ReadReceipt createdAt={msg.created_at} readUntil={dmPartnerReadUntil} />}
      </div>
    );
  }

  if (msg.message_type === "emote" && emoteDef) {
    return (
      <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"} mb-2`}>
        <div
          onClick={handleEmoteClick}
          className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl cursor-pointer transition-transform hover:scale-110 active:scale-95"
          style={{
            backgroundColor: isOwn ? "rgb(var(--color-primary-rgb) / 0.16)" : "rgb(var(--color-text-rgb) / 0.06)",
            border: `1px solid ${emoteDef.color}55`,
          }}
        >
          {emoteDef.webp ? (
            <img src={emoteDef.webp} alt={emoteDef.label} className="w-10 h-10 object-contain animate-bounce" />
          ) : (
            <span className="text-3xl animate-bounce">{emoteDef.emoji}</span>
          )}
          {!isOwn && msg.sender_username && msg.sender && (
            <span
              className="text-[10px] font-medium cursor-pointer hover:underline"
              style={{ color: "var(--color-text-muted)" }}
              onClick={(e) => { e.stopPropagation(); onProfileClick?.(msg.sender!); }}
            >
              {msg.sender_username}
            </span>
          )}
        </div>
        {isOwn && <ReadReceipt createdAt={msg.created_at} readUntil={dmPartnerReadUntil} />}
      </div>
    );
  }

  if (msg.message_type === "system") {
    return (
      <div className="flex justify-center mb-2">
        <span
          className="text-[11px] italic px-3 py-1 rounded-full"
          style={{ color: "var(--color-text-muted)", backgroundColor: "var(--color-bg-input)" }}
        >
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"} mb-2`}>
      <div
        className="max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed break-words"
        style={{
          ...(isOwn ? OWN_BUBBLE : PEER_BUBBLE),
          borderTopLeftRadius: isOwn ? "1rem" : "0.25rem",
          borderTopRightRadius: isOwn ? "0.25rem" : "1rem",
          overflowWrap: "break-word",
          wordBreak: "break-word",
        }}
      >
        {!isOwn && msg.sender_username && msg.sender && (
          <p
            className="text-[11px] font-semibold mb-0.5 cursor-pointer hover:underline"
            style={{ color: "var(--color-text-muted)" }}
            onClick={() => onProfileClick?.(msg.sender!)}
          >
            {msg.sender_username}
          </p>
        )}
        <p style={{ overflowWrap: "break-word", wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{msg.content}</p>
      </div>
      {isOwn && <ReadReceipt createdAt={msg.created_at} readUntil={dmPartnerReadUntil} />}
    </div>
  );
}
