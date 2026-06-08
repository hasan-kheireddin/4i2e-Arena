import { useEffect, useState } from "react";
import { useChatSocket } from "../components/Chat/useChatSocket";
import ChatWindow from "../components/Chat/ChatWindow";
import { fetchChannels, createChannel, type Channel } from "../services/chat";

export default function ChatPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"public" | "private">("public");
  const [userId] = useState<string | null>(null);

  const {
    status,
    messages,
    sendMessage,
    sendEmote,
    joinChannel,
    requestHistory,
  } = useChatSocket();

  useEffect(() => {
    fetchChannels()
      .then(setChannels)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeChannel) {
      requestHistory(activeChannel);
    }
  }, [activeChannel, requestHistory]);

  const activeMessages = activeChannel ? messages[activeChannel] || [] : [];

  const handleCreateChannel = async () => {
    if (!newName.trim()) return;
    try {
      const ch = await createChannel({ name: newName.trim(), channel_type: newType });
      setChannels((prev) => [...prev, ch]);
      setActiveChannel(ch.id);
      joinChannel(ch.id);
      setShowCreate(false);
      setNewName("");
    } catch {
      // ignore
    }
  };

  const activeTitle = activeChannel
    ? channels.find((c) => c.id === activeChannel)?.name || "Chat"
    : "Chat";

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "var(--color-bg)" }}>
      <div className="max-w-4xl w-full h-[600px] flex gap-4">
        <div className="w-64 flex flex-col rounded-xl flex-shrink-0" style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--color-border)" }}>
            <h2 className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>Channels</h2>
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-sm font-bold"
              style={{ backgroundColor: "var(--color-primary)", color: "white" }}
            >
              +
            </button>
          </div>

          {showCreate && (
            <div className="p-3 border-b space-y-2" style={{ borderColor: "var(--color-border)" }}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Channel name"
                className="w-full rounded-lg px-3 py-1.5 text-xs outline-none"
                style={{ backgroundColor: "var(--color-bg-input)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as "public" | "private")}
                className="w-full rounded-lg px-3 py-1.5 text-xs outline-none"
                style={{ backgroundColor: "var(--color-bg-input)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
              <button
                onClick={handleCreateChannel}
                disabled={!newName.trim()}
                className="w-full py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                Create
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => {
                  setActiveChannel(ch.id);
                  joinChannel(ch.id);
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                style={{
                  backgroundColor: activeChannel === ch.id ? "var(--color-primary)" : "transparent",
                  color: activeChannel === ch.id ? "white" : "var(--color-text-primary)",
                }}
              >
                <span className="font-medium"># {ch.name || ch.channel_type}</span>
                <span className="text-[10px] ml-2 opacity-60">{ch.member_count}</span>
              </button>
            ))}
          </div>

          <div className="px-4 py-2 border-t text-xs" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
            WS: {status}
          </div>
        </div>

        <div className="flex-1">
          {activeChannel ? (
            <ChatWindow
              messages={activeMessages}
              onSendMessage={(content) => sendMessage(activeChannel, content)}
              onSendEmote={(emoteId) => sendEmote(activeChannel, emoteId)}
              currentUserId={userId}
              title={activeTitle}
            />
          ) : (
            <div className="h-full flex items-center justify-center rounded-xl" style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Select a channel to start chatting</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
