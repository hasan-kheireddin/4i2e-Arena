import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { WsStatus } from "../../hooks/useGameSocket";
import { searchUsers, type Channel, type SearchUser } from "../../services/chat";
import type { ActivePerson } from "./activePeople";
import ChatAvatar from "./ChatAvatar";
import SwipeableRow from "./SwipeableRow";
import {
  IconBellOff,
  IconBlock,
  IconChat,
  IconCheck,
  IconCheckDouble,
  IconClose,
  IconSearch,
  IconTrash,
  IconUnblock,
} from "./ChatIcons";

interface ConfirmState {
  title: string;
  body: string;
  action: string;
  onConfirm: () => void;
}

interface ConversationListProps {
  channels: Channel[];
  activeChannelId: string | null;
  activePeople: ActivePerson[];
  onlineUserIds: Set<string>;
  blockedUserIds: Set<string>;
  blockedByUserIds?: Set<string>;
  currentUserId?: string | null;
  status: WsStatus;
  onSelectChannel: (channelId: string) => void;
  onOpenDM: (userId: string) => void;
  onOpenProfile: (userId: string) => void;
  onToggleMute: (channelId: string) => void;
  onToggleBlock: (userId: string, currentlyBlocked: boolean) => void;
  onDeleteChat: (channelId: string) => void;
  /** Slot for a trailing header control (the widget's close button). */
  headerAction?: React.ReactNode;
  title?: string;
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const stamp = d.getTime();

  if (stamp >= startOfToday) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (stamp >= startOfToday - 86_400_000) return "Yesterday";
  if (stamp >= startOfToday - 6 * 86_400_000) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

function previewOf(ch: Channel, currentUserId?: string | null): string {
  const last = ch.last_message;
  if (!last) return "No messages yet";
  const mine = !!currentUserId && last.sender === currentUserId;
  const prefix = mine ? "You: " : "";
  if (last.message_type === "emote") return `${prefix}Sent a reaction`;
  if (last.message_type === "game_invite") return `${prefix}Game invite`;
  if (last.message_type === "system") return last.content;
  return `${prefix}${last.content}`;
}

/** Most recent conversation first; channels without traffic keep creation order. */
function sortChannels(channels: Channel[]): Channel[] {
  return [...channels].sort((a, b) => {
    const at = new Date(a.last_message?.created_at || a.created_at).getTime() || 0;
    const bt = new Date(b.last_message?.created_at || b.created_at).getTime() || 0;
    return bt - at;
  });
}

export default function ConversationList({
  channels,
  activeChannelId,
  activePeople,
  onlineUserIds,
  blockedUserIds,
  blockedByUserIds,
  currentUserId,
  status,
  onSelectChannel,
  onOpenDM,
  onOpenProfile,
  onToggleMute,
  onToggleBlock,
  onDeleteChat,
  headerAction,
  title = "Messages",
}: ConversationListProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isSearching = query.trim().length >= 2;

  useEffect(() => {
    if (!isSearching) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchUsers(query.trim());
        if (!cancelled) setResults(found || []);
      } catch {
        if (!cancelled) setResults([]);
      }
      if (!cancelled) setSearching(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isSearching]);

  // A swiped-open row should close as soon as attention moves elsewhere.
  useEffect(() => {
    if (!openRow) return;
    const close = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-swipe-row]")) return;
      setOpenRow(null);
    };
    document.addEventListener("pointerdown", close);
    const scroller = listRef.current;
    scroller?.addEventListener("scroll", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      scroller?.removeEventListener("scroll", close);
    };
  }, [openRow]);

  const ordered = useMemo(() => sortChannels(channels), [channels]);
  const unreadTotal = channels.reduce(
    (sum, ch) => sum + (ch.notifications_muted ? 0 : ch.unread_count),
    0,
  );
  const offline = status !== "open";

  return (
    <div className="relative flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
        <h2 className="text-[15px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
          {title}
        </h2>
        <div className="flex items-center gap-1.5">
          {offline && (
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "rgb(var(--color-warning-rgb) / 0.14)", color: "var(--color-warning)" }}
              title={`Connection: ${status}`}
            >
              {status === "connecting" || status === "reconnecting" ? "Reconnecting" : "Offline"}
            </span>
          )}
          {headerAction}
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────────── */}
      <div className="px-3 pb-2">
        <div className="relative">
          <span
            className="absolute inset-y-0 left-3 flex items-center pointer-events-none"
            style={{ color: "var(--color-text-muted)" }}
          >
            <IconSearch size={15} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people to message…"
            aria-label="Search people to message"
            className="w-full rounded-xl py-2.5 pl-9 pr-9 text-[13px] outline-none transition-shadow focus:shadow-[0_0_0_2px_rgb(var(--color-primary-rgb)/0.35)]"
            style={{
              backgroundColor: "var(--color-bg-input)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute inset-y-0 right-2.5 flex items-center transition-opacity hover:opacity-70"
              style={{ color: "var(--color-text-muted)" }}
            >
              <IconClose size={15} />
            </button>
          )}
        </div>
      </div>

      {/* ── Currently active ───────────────────────────────────── */}
      {!isSearching && activePeople.length > 0 && (
        <div className="pb-1">
          <div className="flex items-center gap-1.5 px-4 pb-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: "var(--color-success)" }}
            />
            <span
              className="text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ color: "var(--color-text-muted)" }}
            >
              Currently Active
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto px-4 pb-2">
            {activePeople.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenDM(p.id)}
                title={`Message ${p.display_name || p.username}`}
                className="flex flex-col items-center gap-1 flex-shrink-0 w-[52px] transition-transform active:scale-95"
              >
                <ChatAvatar src={p.avatar_url} name={p.display_name || p.username} size={46} halo online />
                <span
                  className="text-[10px] font-medium truncate w-full text-center"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {(p.display_name || p.username).split(" ")[0]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-4 pt-1 pb-1.5">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-text-muted)" }}
        >
          {isSearching ? "People" : "Direct Messages"}
        </span>
        {!isSearching && unreadTotal > 0 && (
          <span className="text-[10px] font-semibold" style={{ color: "var(--color-primary)" }}>
            {unreadTotal} unread
          </span>
        )}
      </div>

      {/* ── List ───────────────────────────────────────────────── */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto pb-2">
        {isSearching ? (
          <>
            {searching && (
              <div className="flex justify-center py-6">
                <div
                  className="w-5 h-5 rounded-full border-2 animate-spin"
                  style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }}
                />
              </div>
            )}
            {!searching && results.length === 0 && (
              <EmptyState label="No players found" hint={`Nothing matches “${query.trim()}”`} />
            )}
            {results.map((u) => {
              const blocked = blockedUserIds.has(u.id);
              return (
                <div key={u.id} className="px-2">
                  <div className="flex items-center gap-3 px-2.5 py-2 rounded-xl transition-colors hover:bg-surface-hover">
                    <ChatAvatar
                      src={u.avatar_url}
                      name={u.display_name || u.username}
                      size={40}
                      online={onlineUserIds.has(u.id)}
                      onClick={() => onOpenProfile(u.id)}
                      title="View profile"
                    />
                    <button
                      type="button"
                      onClick={() => onOpenProfile(u.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p
                        className="text-[13px] font-semibold truncate"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {u.display_name || u.username}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: "var(--color-text-muted)" }}>
                        @{u.username}
                      </p>
                    </button>
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => {
                        setQuery("");
                        onOpenDM(u.id);
                      }}
                      title={blocked ? "You blocked this player" : "Start a conversation"}
                      aria-label={blocked ? "Blocked" : "Start a conversation"}
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ backgroundImage: "var(--gradient-brand)" }}
                    >
                      <IconChat size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        ) : ordered.length === 0 ? (
          <EmptyState
            label="No conversations yet"
            hint="Search for a player above to start chatting."
          />
        ) : (
          ordered.map((ch) => {
            const partner = ch.dm_partner;
            const blocked = partner ? blockedUserIds.has(partner.id) : false;
            const blockedBy = partner ? !!blockedByUserIds?.has(partner.id) : false;
            const online = !!partner && onlineUserIds.has(partner.id) && !blocked && !blockedBy;
            const isActive = activeChannelId === ch.id;
            const name = partner?.display_name || partner?.username || "Unknown";
            const stamp = ch.last_message?.created_at || ch.created_at;
            const mineLast = !!ch.last_message && ch.last_message.sender === currentUserId;
            const seen =
              mineLast &&
              !!partner?.read_until &&
              new Date(ch.last_message!.created_at) <= new Date(partner.read_until);

            return (
              <SwipeableRow
                key={ch.id}
                open={openRow === ch.id}
                onOpenChange={(next) => setOpenRow(next ? ch.id : null)}
                actions={[
                  {
                    key: "mute",
                    label: ch.notifications_muted ? "Unmute" : "Mute",
                    icon: <IconBellOff size={16} />,
                    background: "#F59E0B",
                    onClick: () => onToggleMute(ch.id),
                  },
                  {
                    key: "block",
                    label: blocked ? "Unblock" : "Block",
                    icon: blocked ? <IconUnblock size={16} /> : <IconBlock size={16} />,
                    background: "#64748B",
                    onClick: () => {
                      if (!partner) return;
                      if (blocked) {
                        onToggleBlock(partner.id, true);
                        return;
                      }
                      setConfirm({
                        title: `Block ${name}?`,
                        body: "They will not be able to message you or invite you to games, and any friendship between you is removed.",
                        action: "Block",
                        onConfirm: () => onToggleBlock(partner.id, false),
                      });
                    },
                  },
                  {
                    key: "delete",
                    label: "Delete",
                    icon: <IconTrash size={16} />,
                    background: "#EF4444",
                    onClick: () =>
                      setConfirm({
                        title: `Delete chat with ${name}?`,
                        body: "The conversation leaves your list. It comes back if either of you sends a new message.",
                        action: "Delete",
                        onConfirm: () => onDeleteChat(ch.id),
                      }),
                  },
                ]}
              >
                <div
                  onClick={() => onSelectChannel(ch.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectChannel(ch.id);
                    }
                  }}
                  className="px-2 py-0.5 cursor-pointer select-none"
                  style={{ backgroundColor: "var(--color-bg-card)" }}
                >
                  <div
                    className={cn(
                      "relative flex items-center gap-3 px-2.5 py-2 rounded-xl transition-colors",
                      isActive ? "bg-surface-hover" : "hover:bg-surface-hover",
                    )}
                  >
                    {isActive && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-full"
                        style={{ backgroundImage: "var(--gradient-brand)" }}
                      />
                    )}
                    <ChatAvatar
                      src={partner?.avatar_url}
                      name={name}
                      size={44}
                      online={online}
                      ringColor={isActive ? "var(--color-bg-hover)" : "var(--color-bg-card)"}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[13px] font-semibold truncate"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          {name}
                        </span>
                        {ch.notifications_muted && (
                          <span style={{ color: "var(--color-text-muted)" }} title="Notifications muted">
                            <IconBellOff size={12} />
                          </span>
                        )}
                        {blocked && (
                          <span style={{ color: "var(--color-text-muted)" }} title="You blocked this player">
                            <IconBlock size={12} />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 min-w-0">
                        {mineLast && (
                          <span
                            className="flex-shrink-0"
                            style={{ color: seen ? "var(--color-success)" : "var(--color-text-muted)" }}
                          >
                            {seen ? <IconCheckDouble size={12} /> : <IconCheck size={12} />}
                          </span>
                        )}
                        <p
                          className="text-[11.5px] truncate"
                          style={{
                            color:
                              ch.unread_count > 0 && !ch.notifications_muted
                                ? "var(--color-text-secondary)"
                                : "var(--color-text-muted)",
                            fontWeight: ch.unread_count > 0 && !ch.notifications_muted ? 600 : 400,
                          }}
                        >
                          {previewOf(ch, currentUserId)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-[10px] whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                        {formatStamp(stamp)}
                      </span>
                      {ch.unread_count > 0 && (
                        <span
                          className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{
                            backgroundImage: ch.notifications_muted ? "none" : "var(--gradient-brand)",
                            backgroundColor: ch.notifications_muted ? "var(--color-text-muted)" : undefined,
                          }}
                        >
                          {ch.unread_count > 99 ? "99+" : ch.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </SwipeableRow>
            );
          })
        )}
      </div>

      {confirm && (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center p-3"
          style={{ backgroundColor: "rgb(2 6 23 / 0.45)" }}
          onClick={() => setConfirm(null)}
        >
          <div
            className="w-full rounded-2xl p-4 shadow-2xl"
            style={{ backgroundColor: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-label={confirm.title}
          >
            <p className="text-[13px] font-bold" style={{ color: "var(--color-text-primary)" }}>
              {confirm.title}
            </p>
            <p className="text-[11.5px] leading-relaxed mt-1" style={{ color: "var(--color-text-muted)" }}>
              {confirm.body}
            </p>
            <div className="flex gap-2 mt-3.5">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="flex-1 py-2 rounded-xl text-[12px] font-semibold transition-colors hover:bg-surface-hover"
                style={{ border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const run = confirm.onConfirm;
                  setConfirm(null);
                  run();
                }}
                className="flex-1 py-2 rounded-xl text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--color-danger)" }}
              >
                {confirm.action}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-8 py-10 gap-2">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center"
        style={{ backgroundColor: "var(--color-bg-input)", color: "var(--color-text-muted)" }}
      >
        <IconChat size={22} />
      </div>
      <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
        {label}
      </p>
      <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
        {hint}
      </p>
    </div>
  );
}
