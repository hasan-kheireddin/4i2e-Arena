/**
 * "Delete chat" removes a conversation from *this* user's list only.
 *
 * The API has no per-member delete for DMs (deleting the channel would wipe the
 * other person's history too), so the hidden set lives client-side, keyed by
 * user id, and a channel un-hides itself as soon as new activity arrives.
 */

const PREFIX = "firearena.chat.hidden.";

function key(userId: string) {
  return `${PREFIX}${userId}`;
}

export function loadHiddenChannels(userId: string | null | undefined): Set<string> {
  if (!userId) return new Set();
  try {
    const raw = window.localStorage.getItem(key(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveHiddenChannels(userId: string | null | undefined, ids: Set<string>) {
  if (!userId) return;
  try {
    if (ids.size === 0) window.localStorage.removeItem(key(userId));
    else window.localStorage.setItem(key(userId), JSON.stringify([...ids]));
  } catch {
    /* storage unavailable (private mode, quota) — hiding stays session-only */
  }
}
