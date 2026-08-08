/**
 * Lets anything in the app open a conversation in the floating chat bubble
 * instead of routing to the full messages page.
 *
 * The widget registers itself while mounted; callers fall back to navigation
 * when it isn't (the game pages and /chat render no bubble).
 */

type Opener = (channelId: string) => void;

let opener: Opener | null = null;

export function registerChatOpener(fn: Opener): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

/** Returns false when no bubble is mounted, so the caller can navigate instead. */
export function openChatBubble(channelId: string): boolean {
  if (!opener) return false;
  opener(channelId);
  return true;
}
