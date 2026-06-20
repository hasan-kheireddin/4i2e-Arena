import type { Dispatch, SetStateAction } from 'react';
import { getOrCreateDM } from '../services/chat';

type SocketMessage = Record<string, unknown>;
type OnlinePhase = 'idle' | 'matchmaking' | 'waiting' | 'playing' | 'over';

interface SnapshotPlayer {
  score: number;
  paddle: { y: number };
}

interface GameInfoPlayer {
  username: string;
  user_id?: string;
}

export interface PongSocketContext {
  getMySlot: () => number | null;
  setMySlot: (slot: number) => void;
  resetRenderState: () => void;
  pushSnapshot: (
    ball: { x: number; y: number; vx: number; vy: number },
    player1: SnapshotPlayer,
    player2: SnapshotPlayer,
    serverTsMs: number | null,
  ) => void;
  setOpponentName: Dispatch<SetStateAction<string>>;
  setOnlinePhase: Dispatch<SetStateAction<OnlinePhase>>;
  setGamePaused: Dispatch<SetStateAction<boolean>>;
  setOpponentLeft: Dispatch<SetStateAction<boolean>>;
  setOnlineReason: Dispatch<SetStateAction<string | null>>;
  setOnlineWinnerSlot: Dispatch<SetStateAction<number | null>>;
  setOnlineScore: Dispatch<SetStateAction<{ p1: number; p2: number }>>;
  setIReady: Dispatch<SetStateAction<boolean>>;
  setOpponentReady: Dispatch<SetStateAction<boolean>>;
  setSpectatorCount: Dispatch<SetStateAction<{ total: number; side1: number; side2: number }>>;
  addEmote: (emoteId: string, slot: number, username?: string) => void;
  addSpectatorEmote: (emoteId: string, side: number) => void;
}

export interface MatchmakingContext {
  setOpponentName: Dispatch<SetStateAction<string>>;
  setGameId: Dispatch<SetStateAction<string | null>>;
  setMmPath: Dispatch<SetStateAction<string | null>>;
  setGamePath: Dispatch<SetStateAction<string | null>>;
  setOnlinePhase: Dispatch<SetStateAction<OnlinePhase>>;
}

export function handlePongMatchmakingMessage(
  data: SocketMessage,
  context: MatchmakingContext,
) {
  if (data.type !== 'match_found') return;

  const gameId = data.game_id as string;
  const opponent = data.opponent as { username?: string } | undefined;
  if (opponent?.username) {
    context.setOpponentName(opponent.username);
  }
  context.setGameId(gameId);
  context.setMmPath(null);
  context.setGamePath(`/ws/game/pong/${gameId}/`);
  context.setOnlinePhase('waiting');
}

export function handlePongGameMessage(
  data: SocketMessage,
  context: PongSocketContext,
) {
  switch (data.type) {
    case 'game_joined':
      handleGameJoined(data, context);
      return;
    case 'game_start':
      context.resetRenderState();
      context.setGamePaused(false);
      context.setOpponentLeft(false);
      context.setOnlinePhase('playing');
      return;
    case 'game_state':
      pushStateMessage(data, context);
      context.setOnlinePhase((previous) => (
        previous === 'waiting' ? 'playing' : previous
      ));
      return;
    case 'game_resumed':
      pushStateMessage(data, context);
      context.setGamePaused(false);
      context.setOpponentLeft(false);
      context.setOnlinePhase('playing');
      return;
    case 'game_over':
      handleGameOver(data, context);
      return;
    case 'both_connected':
      updateOpponentFromGameInfo(data, context, true);
      return;
    case 'player_ready':
      handlePlayerReady(data, context);
      return;
    case 'player_presence':
      handlePlayerPresence(data, context);
      return;
    case 'game_paused':
      context.setGamePaused(true);
      return;
    case 'player_left':
      context.setOpponentLeft(true);
      return;
    case 'emote':
      context.addEmote(
        data.emote_id as string,
        data.slot as number,
        data.sender_username as string | undefined,
      );
      return;
    case 'spectator_count':
      context.setSpectatorCount({
        total: data.total as number,
        side1: data.side1 as number,
        side2: data.side2 as number,
      });
      return;
    case 'spectator_emote':
      context.addSpectatorEmote(data.emote_id as string, (data.side as number) || 0);
      return;
    default:
      return;
  }
}

function handleGameJoined(data: SocketMessage, context: PongSocketContext) {
  const slot = data.slot as number;
  context.setMySlot(slot);
  updateOpponentFromGameInfo(data, context);
}

function pushStateMessage(data: SocketMessage, context: PongSocketContext) {
  const ball = data.ball as { x: number; y: number; vx: number; vy: number };
  const player1 = data.player1 as SnapshotPlayer | undefined;
  const player2 = data.player2 as SnapshotPlayer | undefined;
  if (!ball || !player1 || !player2) return;

  const serverTsMs = Number(data.server_ts_ms);
  context.pushSnapshot(
    ball,
    player1,
    player2,
    Number.isFinite(serverTsMs) ? serverTsMs : null,
  );
}

function handleGameOver(data: SocketMessage, context: PongSocketContext) {
  const finalState = data.final_state as {
    player1?: { score: number };
    player2?: { score: number };
  } | undefined;

  context.resetRenderState();
  context.setOnlineReason(data.reason as string);
  context.setOnlineWinnerSlot((data.winner as number | null) ?? null);
  context.setGamePaused(false);
  if (finalState?.player1 && finalState.player2) {
    context.setOnlineScore({
      p1: finalState.player1.score,
      p2: finalState.player2.score,
    });
  }
  context.setOnlinePhase('over');
}

function handlePlayerReady(data: SocketMessage, context: PongSocketContext) {
  if ((data.slot as number) === context.getMySlot()) {
    context.setIReady(true);
    return;
  }
  context.setOpponentReady(true);
}

function handlePlayerPresence(data: SocketMessage, context: PongSocketContext) {
  if ((data.slot as number) !== context.getMySlot()) {
    context.setOpponentLeft(!(data.connected as boolean));
  }
  updateOpponentFromGameInfo(data, context);
}

function updateOpponentFromGameInfo(
  data: SocketMessage,
  context: PongSocketContext,
  createDirectMessage = false,
) {
  const opponent = getOpponent(data.game_info, context.getMySlot());
  if (!opponent) return;

  context.setOpponentName(opponent.username);
  if (createDirectMessage && opponent.user_id) {
    void getOrCreateDM(opponent.user_id).catch(() => {});
  }
}

function getOpponent(
  rawGameInfo: unknown,
  mySlot: number | null,
): GameInfoPlayer | null {
  if (mySlot !== 1 && mySlot !== 2) return null;
  const gameInfo = rawGameInfo as SocketMessage | undefined;
  const players = gameInfo?.players as Record<string, GameInfoPlayer> | undefined;
  if (!players) return null;

  const opponentSlot = mySlot === 1 ? '2' : '1';
  return players[opponentSlot] ?? null;
}
