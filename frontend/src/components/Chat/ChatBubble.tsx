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
}

export default function ChatBubble({ msg, isOwn, onProfileClick, dmPartnerReadUntil }: ChatBubbleProps) {
  const [played, setPlayed] = useState(false);

  const emoteDef = msg.message_type === "emote" ? EMOTES.find((e) => e.id === msg.emote_id) : null;

  const handleEmoteClick = () => {
    if (played) return;
    setPlayed(true);
    if (emoteDef) {
      playEmoteSound(emoteDef.soundFreq, emoteDef.soundDuration);
    }
    setTimeout(() => setPlayed(false), 1000);
  };

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
