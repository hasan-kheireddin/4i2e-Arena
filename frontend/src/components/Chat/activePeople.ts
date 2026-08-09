import type { Channel, FriendshipRecord } from "../../services/chat";

export interface ActivePerson {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

/**
 * Online users worth surfacing in the "Currently Active" strip: accepted
 * friends first, then anyone the user already has a conversation with.
 */
export function buildActivePeople(
  channels: Channel[],
  friendships: FriendshipRecord[],
  onlineUserIds: Set<string>,
  excludedUserIds: Set<string>,
): ActivePerson[] {
  const byId = new Map<string, ActivePerson>();

  for (const f of friendships) {
    if (f.status !== "accepted") continue;
    if (!onlineUserIds.has(f.other_user_id) || excludedUserIds.has(f.other_user_id)) continue;
    byId.set(f.other_user_id, {
      id: f.other_user_id,
      username: f.other_username,
      display_name: f.other_display_name,
      avatar_url: f.other_avatar,
    });
  }

  for (const ch of channels) {
    const p = ch.dm_partner;
    if (!p) continue;
    if (!onlineUserIds.has(p.id) || excludedUserIds.has(p.id) || byId.has(p.id)) continue;
    byId.set(p.id, {
      id: p.id,
      username: p.username,
      display_name: p.display_name,
      avatar_url: p.avatar_url,
    });
  }

  return [...byId.values()];
}
