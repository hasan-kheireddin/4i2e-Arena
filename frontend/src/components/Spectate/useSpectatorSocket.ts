import { useCallback } from "react";
import { useGameSocket } from "../../hooks/useGameSocket";

interface UseSpectatorSocketOptions {
  gameId: string;
  side: number | null;
  onGameState: (data: Record<string, unknown>) => void;
  onGameOver: (data: Record<string, unknown>) => void;
  onSpectatorCount: (counts: { total: number; side1: number; side2: number }) => void;
  onEmote: (data: Record<string, unknown>) => void;
  onJoined: (data: Record<string, unknown>) => void;
}

export function useSpectatorSocket(opts: UseSpectatorSocketOptions) {
  const onMessage = useCallback(
    (data: Record<string, unknown>) => {
      const type = data.type as string;
      if (type === "joined") {
        opts.onJoined(data);
      } else if (type === "game_state") {
        opts.onGameState(data);
      } else if (type === "game_over") {
        opts.onGameOver(data);
      } else if (type === "spectator_count") {
        opts.onSpectatorCount({
          total: data.total as number,
          side1: data.side1 as number,
          side2: data.side2 as number,
        });
      } else if (type === "emote" || type === "spectator_emote") {
        opts.onEmote(data);
      }
    },
    [opts],
  );

  const path = `/ws/spectate/${opts.gameId}/`;

  const { send, status } = useGameSocket(path, { onMessage });

  const join = useCallback(() => {
    send({ type: "join", game_id: opts.gameId, side: opts.side });
  }, [send, opts.gameId, opts.side]);

  const sendEmote = useCallback(
    (emoteId: string) => {
      send({ type: "emote", emote_id: emoteId });
    },
    [send],
  );

  return { status, join, sendEmote };
}
