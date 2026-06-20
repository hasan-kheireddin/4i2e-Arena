import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getOrCreateDM } from '../services/chat';
import { useGameSocket } from '../hooks/useGameSocket';
import {
  canJoinOnlineGame,
  createEmptyBoard,
  getOpponentSlot,
  shouldAutoFindMatch,
  type GameInfoPlayer,
  type Mode,
  type OnlineGameState,
  type OnlinePhase,
  type SocketMessage,
} from './TicTacToeGameShared';

interface MatchmakingMessageContext {
  setOpponentName: Dispatch<SetStateAction<string>>;
  setGameId: Dispatch<SetStateAction<string | null>>;
  setMmPath: Dispatch<SetStateAction<string | null>>;
  setGamePath: Dispatch<SetStateAction<string | null>>;
  setOnlinePhase: Dispatch<SetStateAction<OnlinePhase>>;
  setQueuePosition: Dispatch<SetStateAction<number | null>>;
}

interface OnlineGameMessageContext {
  defaultOpponentName: string;
  mySlot: number | null;
  setMySlot: (slot: number | null) => void;
  setOpponentName: Dispatch<SetStateAction<string>>;
  setGamePath: Dispatch<SetStateAction<string | null>>;
  setOnlinePhase: Dispatch<SetStateAction<OnlinePhase>>;
  setMySymbol: Dispatch<SetStateAction<'X' | 'O' | null>>;
  setOnlineGameState: Dispatch<SetStateAction<OnlineGameState | null>>;
  setIReady: Dispatch<SetStateAction<boolean>>;
  setOpponentReady: Dispatch<SetStateAction<boolean>>;
  setGamePaused: Dispatch<SetStateAction<boolean>>;
  setOnlineWinner: Dispatch<SetStateAction<'X' | 'O' | 'draw' | null>>;
  setOpponentLeftMsg: Dispatch<SetStateAction<string | null>>;
}

interface OnlineGameOptions {
  mode: Mode;
  initialGameId: string | null;
  defaultOpponentName: string;
  onExit: () => void;
}

function getOpponentFromGameInfo(
  info: SocketMessage | undefined,
  mySlot: number | null,
): GameInfoPlayer | null {
  const opponentSlot = getOpponentSlot(mySlot);
  if (!opponentSlot) return null;

  const players = info?.players as Record<string, GameInfoPlayer> | undefined;
  if (!players) return null;

  return players[opponentSlot] ?? null;
}

function syncOpponentFromGameInfo({
  info,
  mySlot,
  setOpponentName,
  shouldCreateDm = false,
}: {
  info: SocketMessage | undefined;
  mySlot: number | null;
  setOpponentName: Dispatch<SetStateAction<string>>;
  shouldCreateDm?: boolean;
}) {
  const opponent = getOpponentFromGameInfo(info, mySlot);
  if (!opponent) return;

  setOpponentName(opponent.username);
  if (shouldCreateDm && opponent.user_id) {
    void getOrCreateDM(opponent.user_id).catch(() => {});
  }
}

function handleMatchmakingMessage(
  data: SocketMessage,
  ctx: MatchmakingMessageContext,
) {
  switch (data.type) {
    case 'match_found': {
      const gameId = data.game_id as string;
      const opponent = data.opponent as { username?: string } | undefined;
      if (opponent?.username) {
        ctx.setOpponentName(opponent.username);
      }
      ctx.setGameId(gameId);
      ctx.setMmPath(null);
      ctx.setGamePath(`/ws/game/tictactoe/${gameId}/`);
      ctx.setOnlinePhase('waiting');
      return;
    }
    case 'queue_update':
      ctx.setQueuePosition(data.position as number);
      return;
    default:
      return;
  }
}

function setOnlineBoardState(
  data: SocketMessage,
  setOnlineGameState: Dispatch<SetStateAction<OnlineGameState | null>>,
) {
  setOnlineGameState({
    board: data.board as OnlineGameState['board'],
    current_turn: data.current_turn as 'X' | 'O',
  });
}

function handleOnlineGameMessage(
  data: SocketMessage,
  ctx: OnlineGameMessageContext,
) {
  switch (data.type) {
    case 'game_joined': {
      const slot = data.slot as number;
      ctx.setMySlot(slot);
      ctx.setMySymbol(slot === 1 ? 'X' : 'O');
      syncOpponentFromGameInfo({
        info: data.game_info as SocketMessage | undefined,
        mySlot: slot,
        setOpponentName: ctx.setOpponentName,
      });
      return;
    }
    case 'game_start':
      ctx.setOnlinePhase('playing');
      ctx.setGamePaused(false);
      ctx.setOnlineGameState({
        board: createEmptyBoard(),
        current_turn: 'X',
      });
      return;
    case 'game_state':
      setOnlineBoardState(data, ctx.setOnlineGameState);
      return;
    case 'game_resumed':
      setOnlineBoardState(data, ctx.setOnlineGameState);
      ctx.setGamePaused(false);
      ctx.setOnlinePhase('playing');
      return;
    case 'both_connected':
      syncOpponentFromGameInfo({
        info: data.game_info as SocketMessage | undefined,
        mySlot: ctx.mySlot,
        setOpponentName: ctx.setOpponentName,
        shouldCreateDm: true,
      });
      return;
    case 'player_ready':
      if ((data.slot as number) === ctx.mySlot) {
        ctx.setIReady(true);
        return;
      }
      ctx.setOpponentReady(true);
      return;
    case 'player_presence':
      if ((data.slot as number) !== ctx.mySlot && (data.connected as boolean)) {
        ctx.setOpponentLeftMsg(null);
      }
      syncOpponentFromGameInfo({
        info: data.game_info as SocketMessage | undefined,
        mySlot: ctx.mySlot,
        setOpponentName: ctx.setOpponentName,
      });
      return;
    case 'opponent_left_lobby':
      ctx.setOpponentLeftMsg((data.username as string) || ctx.defaultOpponentName);
      ctx.setGamePath(null);
      ctx.setOnlinePhase('idle');
      return;
    case 'game_paused':
      ctx.setGamePaused(true);
      return;
    case 'game_over':
      ctx.setOnlineWinner(data.winner as 'X' | 'O' | 'draw' | null);
      ctx.setGamePaused(false);
      ctx.setOnlinePhase('game_over');
      return;
    default:
      return;
  }
}

export function useTicTacToeOnlineGame({
  mode,
  initialGameId,
  defaultOpponentName,
  onExit,
}: OnlineGameOptions) {
  const [onlinePhase, setOnlinePhase] = useState<OnlinePhase>(
    initialGameId ? 'waiting' : 'idle',
  );
  const [gameId, setGameId] = useState<string | null>(initialGameId);
  const [mySymbol, setMySymbol] = useState<'X' | 'O' | null>(null);
  const [onlineGameState, setOnlineGameState] = useState<OnlineGameState | null>(null);
  const [opponentName, setOpponentName] = useState(defaultOpponentName);
  const [onlineWinner, setOnlineWinner] = useState<'X' | 'O' | 'draw' | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [iReady, setIReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [gamePaused, setGamePaused] = useState(false);
  const [opponentLeftMsg, setOpponentLeftMsg] = useState<string | null>(null);
  const [mmPath, setMmPath] = useState<string | null>(null);
  const [gamePath, setGamePath] = useState<string | null>(
    initialGameId ? `/ws/game/tictactoe/${initialGameId}/` : null,
  );
  const mySlotRef = useRef<number | null>(null);

  useEffect(() => {
    if (!initialGameId) return;
    setGameId(initialGameId);
    setGamePath(`/ws/game/tictactoe/${initialGameId}/`);
    setOnlinePhase('waiting');
  }, [initialGameId]);

  const findMatch = useCallback(() => {
    setOnlinePhase('searching');
    setOnlineGameState(null);
    setOnlineWinner(null);
    mySlotRef.current = null;
    setMySymbol(null);
    setOpponentName(defaultOpponentName);
    setGameId(null);
    setGamePath(null);
    setQueuePosition(null);
    setIReady(false);
    setOpponentReady(false);
    setGamePaused(false);
    setOpponentLeftMsg(null);
    setMmPath('/ws/matchmaking/');
  }, [defaultOpponentName]);

  const { send: matchmakingSend, status: mmSocketStatus } = useGameSocket(mmPath, {
    onMessage: useCallback((data: SocketMessage) => {
      handleMatchmakingMessage(data, {
        setOpponentName,
        setGameId,
        setMmPath,
        setGamePath,
        setOnlinePhase,
        setQueuePosition,
      });
    }, []),
  });

  useEffect(() => {
    if (mmPath && mmSocketStatus === 'open') {
      matchmakingSend({ type: 'find_match', game_type: 'tictactoe' });
    }
  }, [mmPath, mmSocketStatus, matchmakingSend]);

  const {
    send: gameSend,
    status: gameSocketStatus,
    latency: gameLatency,
  } = useGameSocket(gamePath, {
    enableLatencyProbe: true,
    onMessage: useCallback((data: SocketMessage) => {
      handleOnlineGameMessage(data, {
        defaultOpponentName,
        mySlot: mySlotRef.current,
        setMySlot: (slot) => {
          mySlotRef.current = slot;
        },
        setOpponentName,
        setGamePath,
        setOnlinePhase,
        setMySymbol,
        setOnlineGameState,
        setIReady,
        setOpponentReady,
        setGamePaused,
        setOnlineWinner,
        setOpponentLeftMsg,
      });
    }, [defaultOpponentName]),
  });

  useEffect(() => {
    if (canJoinOnlineGame(gamePath, gameSocketStatus, gameId)) {
      gameSend({ type: 'join', game_id: gameId });
    }
  }, [gamePath, gameSocketStatus, gameId, gameSend]);

  useEffect(() => {
    if (shouldAutoFindMatch(mode, onlinePhase)) {
      findMatch();
    }
  }, [mode, onlinePhase, findMatch]);

  const ready = () => {
    if (iReady) return;
    setIReady(true);
    gameSend({ type: 'ready' });
  };

  const cancelOnline = () => {
    setMmPath(null);
    setGamePath(null);
    setOnlinePhase('idle');
    setOpponentLeftMsg(null);
    onExit();
  };

  const playMove = (index: number) => {
    if (!onlineGameState || onlineGameState.board[index]) return;
    if (onlineGameState.current_turn !== mySymbol) return;
    gameSend({ type: 'move', cell: index });
  };

  return {
    onlinePhase,
    mySymbol,
    onlineGameState,
    opponentName,
    onlineWinner,
    queuePosition,
    iReady,
    opponentReady,
    gamePaused,
    opponentLeftMsg,
    gameLatency,
    gameSocketStatus,
    findMatch,
    ready,
    cancelOnline,
    playMove,
    dismissOpponentLeft: () => setOpponentLeftMsg(null),
  };
}
