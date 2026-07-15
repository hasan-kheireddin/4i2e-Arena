import { useState } from "react";
import { EMOTES } from "../../assets/emotes/emotes";
import { playEmoteSound } from "../../assets/emotes/sound";
import type { ChatMessage } from "./useChatSocket";

interface ChatBubbleProps {
  msg: ChatMessage;
  isOwn: boolean;
  onProfileClick?: (userId: string) => void;
  readUntilTimestamp?: string | null;
  dmPartnerReadUntil?: string | null;
  sendGameInviteResponse?: (channelId: string, gameType: string, gameId: string, accept: boolean) => void;
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
  const gameTypeLabel = msg.game_type === "pong" ? "Pong" : msg.game_type === "pong3d" ? "3D Pong" : msg.game_type === "tictactoe" ? "Tic Tac Toe" : msg.game_type || "Game";

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
            backgroundColor: isOwn ? "var(--color-primary)" : "#2B2D31",
            borderTopLeftRadius: isOwn ? "1rem" : "0.25rem",
            borderTopRightRadius: isOwn ? "0.25rem" : "1rem",
          }}
        >
          <span style={{ color: "var(--color-text-primary)", fontWeight: 500, whiteSpace: "normal" }}>
            🎮 {msg.content}
          </span>
          {!isOwn && !inviteResponded && sendGameInviteResponse && (
            <>
              <button onClick={handleAccept}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white hover:opacity-90"
                style={{ backgroundColor: "#22C55E" }}>Accept</button>
              <button onClick={handleDecline}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold hover:opacity-90"
                style={{ backgroundColor: "#EF4444", color: "#ffffff" }}>Decline</button>
            </>
          )}
          {!isOwn && inviteResponded && (
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Response sent</span>
          )}
          {isOwn && (
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Waiting for response...</span>
          )}
        </div>
        {isOwn && (
          <span className="text-[10px] mt-0.5 mr-1" style={{ color: dmPartnerReadUntil && new Date(msg.created_at) <= new Date(dmPartnerReadUntil) ? "#22C55E" : "#6B7280" }}>
            {dmPartnerReadUntil && new Date(msg.created_at) <= new Date(dmPartnerReadUntil) ? "✓✓" : "✓"}
          </span>
        )}
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
            backgroundColor: isOwn ? "var(--color-primary)" : "var(--color-bg-card)",
            border: `1px solid ${emoteDef.color}40`,
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
        {isOwn && (
          <span className="text-[10px] mt-0.5 mr-1" style={{ color: dmPartnerReadUntil && new Date(msg.created_at) <= new Date(dmPartnerReadUntil) ? "#22C55E" : "#6B7280" }}>
            {dmPartnerReadUntil && new Date(msg.created_at) <= new Date(dmPartnerReadUntil) ? "✓✓" : "✓"}
          </span>
        )}
      </div>
    );
  }

  if (msg.message_type === "system") {
    return (
      <div className="flex justify-center mb-2">
        <span className="text-xs italic px-3 py-1 rounded-full" style={{ color: "#EF4444", backgroundColor: "var(--color-bg-input)" }}>
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
          backgroundColor: isOwn ? "var(--color-primary)" : "#2B2D31",
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
        <p style={{ color: "var(--color-text-primary)", overflowWrap: "break-word", wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{msg.content}</p>
      </div>
      {isOwn && (
        <span className="text-[10px] mt-0.5 mr-1" style={{ color: dmPartnerReadUntil && new Date(msg.created_at) <= new Date(dmPartnerReadUntil) ? "#22C55E" : "#6B7280" }}>
          {dmPartnerReadUntil && new Date(msg.created_at) <= new Date(dmPartnerReadUntil) ? "✓✓" : "✓"}
        </span>
      )}
    </div>
  );
}
