import { useEffect, useRef, useState } from "react";
import ChatBubble from "./ChatBubble";
import EmotePalette from "./EmotePalette";
import type { EmoteDef } from "../../assets/emotes/emotes";
import type { ChatMessage, TypingUser } from "./useChatSocket";


interface ChatWindowProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  onSendEmote: (emoteId: string) => void;
  currentUserId: string | null;
  title: string;
  loading?: boolean;
  noBorder?: boolean;
  typingUsers?: TypingUser[];
  onTyping?: () => void;
  onSettingsClick?: () => void;
  onTitleClick?: () => void;
  blockedUserIds?: Set<string>;
  onBlockUser?: (userId: string) => void;
  onProfileClick?: (userId: string) => void;
  onInviteGame?: (userId: string) => void;
  friendUserIds?: Set<string>;
  pendingSentIds?: Set<string>;
  pendingReceivedIds?: Set<string>;
  onFriendAction?: (userId: string) => void;
  dmPartnerReadUntil?: string | null;
  sendGameInviteResponse?: (channelId: string, gameType: string, gameId: string, accept: boolean) => void;
}

export default function ChatWindow({
  messages,
  onSendMessage,
  onSendEmote,
  currentUserId,
  title,
  loading,
  noBorder,
  typingUsers,
  onTyping,
  onSettingsClick,
  onTitleClick,
  blockedUserIds,
  onBlockUser,
  onProfileClick,
  onInviteGame,
  friendUserIds,
  pendingSentIds,
  pendingReceivedIds,
  onFriendAction,
  dmPartnerReadUntil,
  sendGameInviteResponse,
}: ChatWindowProps) {
  const [input, setInput] = useState("");
  const [showEmotes, setShowEmotes] = useState(false);
  const [contextMsg, setContextMsg] = useState<{ id: string; sender: string; x: number; y: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef(onTyping);
  typingRef.current = onTyping;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const close = () => setContextMsg(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    typingRef.current?.();
  };

  const handleContextMenu = (e: React.MouseEvent, msg: ChatMessage) => {
    if (msg.sender && msg.sender !== currentUserId) {
      e.preventDefault();
      setContextMsg({ id: msg.id, sender: msg.sender, x: e.clientX, y: e.clientY });
    }
  };

  const otherTyping = (typingUsers || []).filter((u) => u.userId !== currentUserId);

  const containerClass = noBorder
    ? "flex flex-col h-full"
    : "flex flex-col h-full rounded-xl";
  const containerStyle: React.CSSProperties = noBorder
    ? {}
    : { backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" };

  return (
    <div className={containerClass} style={containerStyle}>
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--color-border)" }}>
        <h3 className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)", cursor: onTitleClick ? "pointer" : undefined }}
          onClick={onTitleClick}>{title}</h3>
        <div className="flex items-center gap-1">
          {onSettingsClick && (
            <button
              onClick={onSettingsClick}
              className="w-7 h-7 flex items-center justify-center rounded text-xs"
              style={{ backgroundColor: "var(--color-bg-input)" }}
              title="Settings"
            >⚙️</button>
          )}
        </div>
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
        {messages
          .filter((msg) => !msg.sender || !blockedUserIds?.has(msg.sender))
          .map((msg) => (
            <div key={msg.id} onContextMenu={(e) => handleContextMenu(e, msg)}>
              <ChatBubble key={msg.id} msg={msg} isOwn={msg.sender === currentUserId} onProfileClick={onProfileClick} dmPartnerReadUntil={dmPartnerReadUntil} sendGameInviteResponse={sendGameInviteResponse} />
            </div>
          ))}
        {otherTyping.length > 0 && (
          <div className="text-xs italic py-1" style={{ color: "var(--color-text-muted)" }}>
            {otherTyping.map((u) => u.username).join(", ")} {otherTyping.length === 1 ? "is" : "are"} typing...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {contextMsg && (
        <div
          className="fixed z-50 rounded-lg shadow-xl py-1"
          style={{ left: contextMsg.x, top: contextMsg.y, backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
          onClick={() => setContextMsg(null)}
        >
          {onProfileClick && (
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80"
              style={{ color: "var(--color-text-primary)" }}
              onClick={() => { onProfileClick?.(contextMsg.sender); setContextMsg(null); }}
            >
              View Profile
            </button>
          )}
          {onInviteGame && (
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80"
              style={{ color: "var(--color-text-primary)" }}
              onClick={() => { onInviteGame?.(contextMsg.sender); setContextMsg(null); }}
            >
              Invite to game
            </button>
          )}
          {onFriendAction && (
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80"
              style={{ color: "var(--color-text-primary)" }}
              onClick={() => { onFriendAction(contextMsg.sender); setContextMsg(null); }}
            >
              {friendUserIds?.has(contextMsg.sender) ? "Remove Friend" :
               pendingReceivedIds?.has(contextMsg.sender) ? "Accept Request" :
               pendingSentIds?.has(contextMsg.sender) ? "Cancel Request" :
               "Add Friend"}
            </button>
          )}
          {onBlockUser && (
            <button
              className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80"
              style={{ color: "#EF4444" }}
              onClick={() => { onBlockUser(contextMsg.sender); setContextMsg(null); }}
            >
              Block user
            </button>
          )}
        </div>
      )}

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
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: "var(--color-bg-input)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex-shrink-0"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }}>
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
