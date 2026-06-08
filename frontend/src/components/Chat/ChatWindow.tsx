import { useEffect, useRef, useState } from "react";
import ChatBubble from "./ChatBubble";
import EmotePalette from "./EmotePalette";
import type { EmoteDef } from "../../assets/emotes/emotes";
import type { ChatMessage } from "./useChatSocket";

interface ChatWindowProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  onSendEmote: (emoteId: string) => void;
  currentUserId: string | null;
  title: string;
  loading?: boolean;
}

export default function ChatWindow({
  messages,
  onSendMessage,
  onSendEmote,
  currentUserId,
  title,
  loading,
}: ChatWindowProps) {
  const [input, setInput] = useState("");
  const [showEmotes, setShowEmotes] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput("");
  };

  const handleEmote = (emote: EmoteDef) => {
    onSendEmote(emote.id);
    setShowEmotes(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full rounded-xl" style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
        <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{title}</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1" style={{ minHeight: "200px", maxHeight: "400px" }}>
        {loading && (
          <div className="flex justify-center py-4">
            <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: "var(--color-text-muted)" }}>No messages yet</p>
        )}
        {messages.map((msg) => (
          <ChatBubble key={msg.id} msg={msg} isOwn={msg.sender === currentUserId} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="relative px-4 py-3 border-t" style={{ borderColor: "var(--color-border)" }}>
        {showEmotes && <EmotePalette onEmote={handleEmote} />}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEmotes(!showEmotes)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-lg flex-shrink-0 transition-colors"
            style={{ backgroundColor: showEmotes ? "var(--color-primary)" : "var(--color-bg-input)" }}
            title="Emotes"
          >
            😂
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: "var(--color-bg-input)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
