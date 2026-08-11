import type { Channel } from "../../services/chat";
import type { ChatMessage } from "./useChatSocket";

/**
 * Folds live socket messages into each channel's `last_message`.
 *
 * The conversation list draws its preview line — and its ordering — from that
 * field, which otherwise only ever arrives from `fetchChannels()`. Without this
 * the outer list keeps showing a stale preview until something refetches it,
 * which is why previews only moved when the chat bubble was closed and
 * reopened.
 *
 * Returns the original array when nothing changed, so callers can hand it
 * straight to `setChannels` without forcing a render.
 */
export function withLatestMessages(
  channels: Channel[],
  messages: Record<string, ChatMessage[]>,
): Channel[] {
  let changed = false;

  const next = channels.map((ch) => {
    const list = messages[ch.id];
    if (!list || list.length === 0) return ch;

    const latest = list[list.length - 1];
    if (!latest) return ch;
    if (ch.last_message?.id === latest.id) return ch;

    // History replays land older messages than the row already shows; only move
    // the preview forward in time.
    const shownAt = ch.last_message ? new Date(ch.last_message.created_at).getTime() : 0;
    const latestAt = new Date(latest.created_at).getTime() || 0;
    if (latestAt < shownAt) return ch;

    changed = true;
    return {
      ...ch,
      last_message: {
        id: latest.id,
        sender: latest.sender,
        sender_username: latest.sender_username,
        message_type: latest.message_type,
        content: latest.content,
        emote_id: latest.emote_id,
        created_at: latest.created_at,
      },
    };
  });

  return changed ? next : channels;
}
