import { useState } from "react";
import { EMOTES } from "../../assets/emotes/emotes";
import { playEmoteSound } from "../../assets/emotes/sound";
import type { ChatMessage } from "./useChatSocket";

interface ChatBubbleProps {
  msg: ChatMessage;
  isOwn: boolean;
}

export default function ChatBubble({ msg, isOwn }: ChatBubbleProps) {
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
      <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-2`}>
        <div
          onClick={handleEmoteClick}
          className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl cursor-pointer transition-transform hover:scale-110 active:scale-95"
          style={{
            backgroundColor: isOwn ? "var(--color-primary)" : "var(--color-bg-card)",
            border: `1px solid ${emoteDef.color}40`,
          }}
        >
          <span className="text-3xl animate-bounce">{emoteDef.emoji}</span>
          {!isOwn && msg.sender_username && (
            <span className="text-[10px] font-medium" style={{ color: "var(--color-text-muted)" }}>
              {msg.sender_username}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (msg.message_type === "system") {
    return (
      <div className="flex justify-center mb-2">
        <span className="text-xs italic px-3 py-1 rounded-full" style={{ color: "var(--color-text-muted)", backgroundColor: "var(--color-bg-input)" }}>
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-2`}>
      <div
        className="max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed"
        style={{
          backgroundColor: isOwn ? "var(--color-primary)" : "var(--color-bg-card)",
          borderTopLeftRadius: isOwn ? "1rem" : "0.25rem",
          borderTopRightRadius: isOwn ? "0.25rem" : "1rem",
        }}
      >
        {!isOwn && msg.sender_username && (
          <p className="text-[11px] font-semibold mb-0.5" style={{ color: "var(--color-text-muted)" }}>
            {msg.sender_username}
          </p>
        )}
        <p style={{ color: "var(--color-text-primary)" }}>{msg.content}</p>
      </div>
    </div>
  );
}
