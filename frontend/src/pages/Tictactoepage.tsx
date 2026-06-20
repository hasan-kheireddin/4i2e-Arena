import { useState, useEffect, useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../lib/utils';
import { useGameSocket } from '../hooks/useGameSocket';
import { createLocalMatch } from '../services/games';
import { getOrCreateDM } from '../services/chat';
import FloatingChatWidget from '../components/Chat/FloatingChatWidget';

type CellValue = 'X' | 'O' | null;
type GameResult = 'X' | 'O' | 'draw' | null;
type Mode = 'local' | 'online';
type OnlinePhase = 'idle' | 'searching' | 'waiting' | 'playing' | 'game_over';
type SocketMessage = Record<string, unknown>;

interface OnlineGameState {
  board: CellValue[];
  current_turn: 'X' | 'O';
}

interface LocalScores {
  X: number;
  O: number;
  draw: number;
}

interface LocalPlayerNames {
  p1: string;
  p2: string;
}

interface GameInfoPlayer {
  username: string;
  user_id?: string;
}

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

const POSITION_NAMES = [
  'top_left', 'top_center', 'top_right',
  'mid_left', 'center', 'mid_right',
  'bot_left', 'bot_center', 'bot_right',
] as const;

function createEmptyBoard(): CellValue[] {
  return Array(9).fill(null);
}

function canPlayLocalMove(
  localNamesReady: boolean,
  board: CellValue[],
  index: number,
  winner: GameResult,
): boolean {
  if (!localNamesReady) return false;
  if (board[index]) return false;
  return winner === null;
}

function shouldStartLocalTimer(gameStartTime: number | null): boolean {
  return gameStartTime === null;
}

function resolveMode(rawMode: string, hasGameId: boolean): Mode {
  if (hasGameId) return 'online';
  return rawMode === 'online' ? 'online' : 'local';
}

function getOpponentSymbol(mySymbol: 'X' | 'O' | null): 'X' | 'O' | '?' {
  if (mySymbol === 'X') return 'O';
  if (mySymbol === 'O') return 'X';
  return '?';
}

function getOpponentSlot(slot: number | null): '1' | '2' | null {
  if (slot === 1) return '2';
  if (slot === 2) return '1';
  return null;
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

function incrementLocalScore(
  nextWinner: GameResult,
  setScores: Dispatch<SetStateAction<LocalScores>>,
) {
  if (nextWinner === 'X') {
    setScores((prev) => ({ ...prev, X: prev.X + 1 }));
    return;
  }
  if (nextWinner === 'O') {
    setScores((prev) => ({ ...prev, O: prev.O + 1 }));
    return;
  }
  if (nextWinner === 'draw') {
    setScores((prev) => ({ ...prev, draw: prev.draw + 1 }));
  }
}

function hasMatchingWinner(
  board: CellValue[],
  a: number,
  b: number,
  c: number,
): board is ('X' | 'O' | null)[] {
  const firstCell = board[a];
  if (!firstCell) return false;
  return firstCell === board[b] && firstCell === board[c];
}

async function persistFinishedLocalMatch({
  winner,
  board,
  gameStartTime,
  localPlayerNames,
}: {
  winner: GameResult;
  board: CellValue[];
  gameStartTime: number | null;
  localPlayerNames: LocalPlayerNames;
}) {
  if (winner === null || !gameStartTime) return;

  const durationSeconds = Math.round((Date.now() - gameStartTime) / 1000);
  try {
    await createLocalMatch({
      game_type: 'tictactoe',
      game_mode: 'pvp',
      winner: winner === 'draw' ? null : winner,
      duration_seconds: durationSeconds,
      player1_score: winner === 'X' ? 1 : 0,
      player2_score: winner === 'O' ? 1 : 0,
      metadata: {
        board,
        local_players: {
          player1_name: localPlayerNames.p1.trim(),
          player2_name: localPlayerNames.p2.trim(),
        },
      },
    });
  } catch {}
}

async function playLocalMove({
  index,
  board,
  winner,
  isXTurn,
  localNamesReady,
  gameStartTime,
  localPlayerNames,
  setGameStartTime,
  setBoard,
  setIsXTurn,
  setMoves,
  setScores,
  t,
}: {
  index: number;
  board: CellValue[];
  winner: GameResult;
  isXTurn: boolean;
  localNamesReady: boolean;
  gameStartTime: number | null;
  localPlayerNames: LocalPlayerNames;
  setGameStartTime: Dispatch<SetStateAction<number | null>>;
  setBoard: Dispatch<SetStateAction<CellValue[]>>;
  setIsXTurn: Dispatch<SetStateAction<boolean>>;
  setMoves: Dispatch<SetStateAction<string[]>>;
  setScores: Dispatch<SetStateAction<LocalScores>>;
  t: TFunction;
}) {
  if (!canPlayLocalMove(localNamesReady, board, index, winner)) return;

  const startTime = gameStartTime ?? Date.now();
  if (shouldStartLocalTimer(gameStartTime)) {
    setGameStartTime(startTime);
  }

  const nextBoard = [...board];
  const mark = isXTurn ? 'X' : 'O';
  nextBoard[index] = mark;

  setBoard(nextBoard);
  setIsXTurn((prev) => !prev);
  setMoves((prev) => [
    ...prev,
    t('ttt.move_entry', {
      mark,
      position: t(`ttt.position_${POSITION_NAMES[index]}`),
    }),
  ]);

  const result = checkWinner(nextBoard);
  incrementLocalScore(result.winner, setScores);

  await persistFinishedLocalMatch({
    winner: result.winner,
    board: nextBoard,
    gameStartTime: startTime,
    localPlayerNames,
  });
}

function playOnlineMove({
  index,
  onlineGameState,
  mySymbol,
  gameSend,
}: {
  index: number;
  onlineGameState: OnlineGameState | null;
  mySymbol: 'X' | 'O' | null;
  gameSend: (payload: SocketMessage) => void;
}) {
  if (!onlineGameState || onlineGameState.board[index]) return;
  if (onlineGameState.current_turn !== mySymbol) return;
  gameSend({ type: 'move', cell: index });
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

function handleMatchmakingMessage(data: SocketMessage, ctx: MatchmakingMessageContext) {
  switch (data.type) {
    case 'match_found': {
      const gid = data.game_id as string;
      const opponent = data.opponent as { username?: string } | undefined;
      if (opponent?.username) {
        ctx.setOpponentName(opponent.username);
      }
      ctx.setGameId(gid);
      ctx.setMmPath(null);
      ctx.setGamePath(`/ws/game/tictactoe/${gid}/`);
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
    board: data.board as CellValue[],
    current_turn: data.current_turn as 'X' | 'O',
  });
}

function handleOnlineGameMessage(data: SocketMessage, ctx: OnlineGameMessageContext) {
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

function getStatusLabel({
  t,
  mode,
  displayWinner,
  gameSocketStatus,
  gamePaused,
  onlinePhase,
}: {
  t: TFunction;
  mode: Mode;
  displayWinner: GameResult;
  gameSocketStatus: string;
  gamePaused: boolean;
  onlinePhase: OnlinePhase;
}) {
  if (mode === 'local') {
    return displayWinner ? t('ttt.game_over') : t('ttt.live');
  }

  if (gameSocketStatus === 'reconnecting' || gameSocketStatus === 'connecting') {
    return t('ttt.reconnecting');
  }
  if (gamePaused) return t('ttt.paused');
  if (onlinePhase === 'playing') return t('ttt.live');
  if (onlinePhase === 'waiting') return t('ttt.waiting_opponent');
  if (onlinePhase === 'searching') return t('ttt.searching');
  if (onlinePhase === 'game_over') return t('ttt.game_over');

  return t('ttt.mode_online');
}

function canJoinOnlineGame(
  gamePath: string | null,
  gameSocketStatus: string,
  gameId: string | null,
): boolean {
  return Boolean(gamePath) && gameSocketStatus === 'open' && Boolean(gameId);
}

function shouldAutoFindMatch(mode: Mode, onlinePhase: OnlinePhase): boolean {
  return mode === 'online' && onlinePhase === 'idle';
}

function getDisplayBoard(
  mode: Mode,
  onlineGameState: OnlineGameState | null,
  board: CellValue[],
): CellValue[] {
  if (mode === 'online') {
    return onlineGameState?.board ?? createEmptyBoard();
  }
  return board;
}

function isOnlineTurnPlayable(
  currentTurn: 'X' | 'O' | undefined,
  mySymbol: 'X' | 'O' | null,
  onlinePhase: OnlinePhase,
  gamePaused: boolean,
): boolean {
  if (onlinePhase !== 'playing') return false;
  if (gamePaused) return false;
  return currentTurn === mySymbol;
}

function isRecoveringSocketStatus(gameSocketStatus: string): boolean {
  return gameSocketStatus === 'reconnecting' || gameSocketStatus === 'connecting';
}

function shouldShowRealtimeRecoveryOverlay(
  mode: Mode,
  onlinePhase: OnlinePhase,
  gamePaused: boolean,
  gameSocketStatus: string,
): boolean {
  if (mode !== 'online') return false;
  if (onlinePhase !== 'playing') return false;
  return gamePaused || isRecoveringSocketStatus(gameSocketStatus);
}

function checkWinner(board: CellValue[]): { winner: GameResult; line: number[] | null } {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];
  for (const [a,b,c] of lines) {
    if (hasMatchingWinner(board, a, b, c)) {
      return { winner: board[a], line: [a,b,c] };
    }
  }
  if (board.every(Boolean)) return { winner: 'draw', line: null };
  return { winner: null, line: null };
}

export default function TicTacToePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawMode = searchParams.get('mode') ?? 'local';
  const hasGameId = searchParams.has('game_id');
  const mode = resolveMode(rawMode, hasGameId);

  // ── Local mode state ──────────────────────────────────────────────────────
  const [board, setBoard] = useState<CellValue[]>(createEmptyBoard);
  const [isXTurn, setIsXTurn] = useState(true);
  const [scores, setScores] = useState({ X: 0, O: 0, draw: 0 });
  const [moves, setMoves] = useState<string[]>([]);
  const [gameStartTime, setGameStartTime] = useState<number | null>(null);
  const [localPlayerNames, setLocalPlayerNames] = useState({ p1: '', p2: '' });
  const [localNamesReady, setLocalNamesReady] = useState(mode !== 'local');

  const { winner, line } = checkWinner(board);
  const localP1Label = localPlayerNames.p1.trim() || t('ttt.player1');
  const localP2Label = localPlayerNames.p2.trim() || t('ttt.player2');

  // ── Online mode state ─────────────────────────────────────────────────────
  const [onlinePhase, setOnlinePhase] = useState<OnlinePhase>('idle');
  const [gameId, setGameId] = useState<string | null>(null);
  const [mySymbol, setMySymbol] = useState<'X' | 'O' | null>(null);
  const [onlineGameState, setOnlineGameState] = useState<OnlineGameState | null>(null);
  const defaultOpponentName = t('ttt.opponent');
  const [opponentName, setOpponentName] = useState(defaultOpponentName);
  const [onlineWinner, setOnlineWinner] = useState<'X' | 'O' | 'draw' | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [iReady, setIReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [gamePaused, setGamePaused] = useState(false);
  const mySlotRef = useRef<number | null>(null);
  const [opponentLeftMsg, setOpponentLeftMsg] = useState<string | null>(null);

  const [mmPath, setMmPath] = useState<string | null>(null);
  const [gamePath, setGamePath] = useState<string | null>(null);

  useEffect(() => {
    const gid = searchParams.get('game_id');
    if (gid) {
      setGameId(gid);
      setGamePath(`/ws/game/tictactoe/${gid}/`);
      setOnlinePhase('waiting');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleFindMatch = useCallback(() => {
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
    setMmPath('/ws/matchmaking/');
  }, [defaultOpponentName]);

  // ── Local game handlers ───────────────────────────────────────────────────
  const handleClick = (index: number) => {
    if (mode === 'local') {
      void playLocalMove({
        index,
        board,
        winner,
        isXTurn,
        localNamesReady,
        gameStartTime,
        localPlayerNames,
        setGameStartTime,
        setBoard,
        setIsXTurn,
        setMoves,
        setScores,
        t,
      });
      return;
    }

    playOnlineMove({
      index,
      onlineGameState,
      mySymbol,
      gameSend,
    });
  };

  const resetGame = () => {
    setBoard(createEmptyBoard());
    setIsXTurn(true);
    setMoves([]);
    setGameStartTime(null);
    if (mode === 'local') {
      setScores({ X: 0, O: 0, draw: 0 });
      setLocalPlayerNames({ p1: '', p2: '' });
      setLocalNamesReady(false);
    }
  };

  const startLocalGame = () => {
    if (!localPlayerNames.p1.trim() || !localPlayerNames.p2.trim()) return;
    setLocalNamesReady(true);
    setBoard(createEmptyBoard());
    setIsXTurn(true);
    setScores({ X: 0, O: 0, draw: 0 });
    setMoves([]);
    setGameStartTime(null);
  };

  // ── Online matchmaking socket ─────────────────────────────────────────────
  const { send: mmSend, status: mmSocketStatus } = useGameSocket(mmPath, {
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
      mmSend({ type: 'find_match', game_type: 'tictactoe' });
    }
  }, [mmPath, mmSocketStatus, mmSend]);

  // ── Online game socket ────────────────────────────────────────────────────
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

  // ── Online helpers ────────────────────────────────────────────────────────
  useEffect(() => {
    if (canJoinOnlineGame(gamePath, gameSocketStatus, gameId)) {
      gameSend({ type: 'join', game_id: gameId });
    }
  }, [gamePath, gameSocketStatus, gameId, gameSend]);

  const handleReady = () => {
    if (iReady) return;
    setIReady(true);
    gameSend({ type: 'ready' });
  };

  const handleCancelOnline = () => {
    setMmPath(null);
    setGamePath(null);
    setOnlinePhase('idle');
    navigate('/games/playpage');
  };

  // Auto-start matchmaking for online mode
  useEffect(() => {
    if (shouldAutoFindMatch(mode, onlinePhase)) {
      handleFindMatch();
    }
  }, [mode, onlinePhase, handleFindMatch]);

  // ── Render helpers ────────────────────────────────────────────────────────
  const displayBoard = getDisplayBoard(mode, onlineGameState, board);
  const displayWinner = mode === 'online' ? onlineWinner : winner;
  const displayLine = mode === 'online' ? checkWinner(displayBoard).line : line;

  const isMyTurn = isOnlineTurnPlayable(
    onlineGameState?.current_turn,
    mySymbol,
    onlinePhase,
    gamePaused,
  );
  const showRealtimeRecoveryOverlay = shouldShowRealtimeRecoveryOverlay(
    mode,
    onlinePhase,
    gamePaused,
    gameSocketStatus,
  );

  const modeLabel = mode === 'online' ? t('ttt.mode_online') : t('ttt.mode_local');
  const statusLabel = getStatusLabel({
    t,
    mode,
    displayWinner,
    gameSocketStatus,
    gamePaused,
    onlinePhase,
  });

  return (
    <>
    {/* Opponent left popup */}
    {opponentLeftMsg && (
      <div className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
        <div className="rounded-xl p-8 max-w-sm w-full text-center space-y-4 mx-4"
          style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <p className="text-2xl">🚪</p>
          <p className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {t('ttt.opponent_left', { name: opponentLeftMsg })}
          </p>
          <button
            onClick={() => { setOpponentLeftMsg(null); navigate('/games/playpage'); }}
            className="px-6 py-2 rounded-lg font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)' }}>
            {t('ttt.back_to_games')}
          </button>
        </div>
      </div>
    )}
    <div className="min-h-screen flex flex-col items-center justify-start p-6"
      style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="max-w-4xl w-full space-y-5">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--color-text-primary)' }}>
            {t('ttt.title')}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {mode === 'online' ? t('ttt.subtitle_online') : t('ttt.subtitle_local')}
          </p>
        </div>

        {/* Score banner (local mode only) */}
        {mode === 'local' && (
          <div className="flex items-center justify-center gap-6">
            {[
              { label: `${localP1Label} (X)`, val: scores.X, color: '#3B82F6' },
              { label: t('ttt.draws'), val: scores.draw, color: '#f59e0b' },
              { label: `${localP2Label} (O)`, val: scores.O, color: '#EF4444' },
            ].map(({ label, val, color }) => (
              <div key={label} className="text-center px-5 py-3 rounded-xl"
                style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div className="text-2xl font-extrabold" style={{ color }}>{val}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* HUD */}
        <div className="flex items-center justify-between rounded-xl px-4 py-3"
          style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <Avatar name={mode === 'online' ? t('ttt.you') : localP1Label} size="sm" />
            <div>
              <span className="text-sm font-semibold" style={{ color: '#3B82F6' }}>
                {mode === 'online' ? t('ttt.you') : localP1Label}
              </span>
              <span className="text-xs font-bold" style={{ color: '#3B82F6', marginInlineStart: '0.5rem' }}>
                ({mode === 'online' ? mySymbol ?? '?' : 'X'})
              </span>
            </div>
            {mode === 'local' && isXTurn && !winner && (
              <span className="flex items-center gap-1 text-xs" style={{ color: '#3B82F6' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#3B82F6' }} />
                {t('ttt.your_turn')}
              </span>
            )}
            {mode === 'online' && isMyTurn && (
              <span className="flex items-center gap-1 text-xs" style={{ color: '#3B82F6' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#3B82F6' }} />
                {t('ttt.your_turn')}
              </span>
            )}
          </div>

          <div className="flex flex-col items-center gap-0.5">
            <span className="px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1.5" 
              style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: 'var(--color-success)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-success)' }} />
              {statusLabel}
            </span>
            <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>{modeLabel}</span>
            {mode === 'online' && (
              <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                {t('ttt.latency')} {gameLatency.rttMs === null ? '--' : `${Math.round(gameLatency.rttMs)}ms`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {mode === 'local' && !isXTurn && !winner && (
              <span className="flex items-center gap-1 text-xs" style={{ color: '#EF4444' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#EF4444' }} />
                {t('ttt.your_turn')}
              </span>
            )}
            {mode === 'online' && !isMyTurn && onlinePhase === 'playing' && (
              <span className="flex items-center gap-1 text-xs" style={{ color: '#EF4444' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#EF4444' }} />
                {t('ttt.opponent_turn')}
              </span>
            )}
            <div>
              <span className="text-sm font-semibold" style={{ color: '#EF4444' }}>
                {mode === 'online' ? opponentName : localP2Label}
              </span>
              <span className="text-xs font-bold" style={{ color: '#EF4444', marginInlineStart: '0.5rem' }}>
                ({mode === 'online' ? (mySymbol === 'X' ? 'O' : mySymbol === 'O' ? 'X' : '?') : 'O'})
              </span>
            </div>
            <Avatar name={mode === 'online' ? opponentName : localP2Label} size="sm" />
          </div>
        </div>

        {/* Main area */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">

          {/* Game Grid */}
          <div className="flex flex-col items-center gap-6 relative">
            {mode === 'local' && !localNamesReady && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 rounded-xl px-6"
                style={{ backgroundColor: 'rgba(10,14,26,0.95)', backdropFilter: 'blur(8px)' }}
              >
                <p className="text-xl font-bold text-center" style={{ color: 'var(--color-text-primary)' }}>
                  {t('ttt.local_name_setup_title')}
                </p>
                <div className="w-full max-w-sm space-y-3">
                  <input
                    value={localPlayerNames.p1}
                    onChange={(e) => setLocalPlayerNames((prev) => ({ ...prev, p1: e.target.value }))}
                    placeholder={t('ttt.local_player1_name')}
                    className="w-full rounded-lg px-4 py-2 text-sm outline-none"
                    style={{ backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                  />
                  <input
                    value={localPlayerNames.p2}
                    onChange={(e) => setLocalPlayerNames((prev) => ({ ...prev, p2: e.target.value }))}
                    placeholder={t('ttt.local_player2_name')}
                    className="w-full rounded-lg px-4 py-2 text-sm outline-none"
                    style={{ backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                  />
                </div>
                <button
                  onClick={startLocalGame}
                  disabled={!localPlayerNames.p1.trim() || !localPlayerNames.p2.trim()}
                  className="px-8 py-3 rounded-lg font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)' }}
                >
                  {t('ttt.start_local_match')}
                </button>
              </div>
            )}
            
            {/* Ready lobby overlay */}
            {mode === 'online' && onlinePhase === 'waiting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-10 rounded-xl"
                style={{ backgroundColor: 'rgba(10,14,26,0.95)', backdropFilter: 'blur(8px)' }}>
                <p className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                  {t('ttt.vs_opponent', { name: opponentName })}
                </p>

                <div className="flex gap-8 text-sm">
                  <span style={{ color: iReady ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                    {iReady ? t('ttt.you_ready') : t('ttt.you_not_ready')}
                  </span>
                  <span style={{ color: opponentReady ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                    {opponentReady ? t('ttt.opponent_ready_status', { name: opponentName }) : t('ttt.opponent_not_ready', { name: opponentName })}
                  </span>
                </div>

                {!iReady ? (
                  <button
                    onClick={handleReady}
                    className="px-10 py-3 rounded-lg font-bold text-white text-lg"
                    style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}
                  >
                    {t('ttt.ready')}
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 rounded-full border-4 animate-spin"
                      style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                      {opponentReady ? t('ttt.starting') : t('ttt.waiting_opponent')}
                    </p>
                  </div>
                )}

                <button onClick={handleCancelOnline}
                  className="text-sm px-5 py-2 rounded-lg"
                  style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  {t('ttt.exit')}
                </button>
              </div>
            )}

            {/* Searching overlay */}
            {mode === 'online' && onlinePhase === 'searching' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-10 rounded-xl"
                style={{ backgroundColor: 'rgba(10,14,26,0.95)', backdropFilter: 'blur(8px)' }}>
                <div className="w-12 h-12 rounded-full border-4 animate-spin" 
                  style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
                <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {t('ttt.searching')}
                </p>
                {queuePosition !== null && (
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('ttt.queue_position', { pos: queuePosition })}
                  </p>
                )}
                <button onClick={handleCancelOnline}
                  className="text-sm px-5 py-2 rounded-lg"
                  style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  {t('ttt.cancel')}
                </button>
              </div>
            )}

            {showRealtimeRecoveryOverlay && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 rounded-xl"
                style={{ backgroundColor: 'rgba(10,14,26,0.82)', backdropFilter: 'blur(8px)' }}>
                <div className="w-10 h-10 rounded-full border-4 animate-spin"
                  style={{ borderColor: '#f97316', borderTopColor: 'transparent' }} />
                <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {t('ttt.reconnecting_players')}
                </p>
                <p className="text-sm text-center max-w-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('ttt.reconnecting_resume')}
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 w-full max-w-xs aspect-square">
              {displayBoard.map((cell, i) => {
                const isWinCell = displayLine?.includes(i);
                const isDisabled = mode === 'online' 
                  ? (!!cell || !isMyTurn || onlinePhase !== 'playing')
                  : (!!cell || !!displayWinner);
                
                return (
                  <button
                    key={i}
                    onClick={() => handleClick(i)}
                    disabled={isDisabled}
                    className={cn(
                      'aspect-square rounded-xl transition-all duration-200 flex items-center justify-center text-4xl font-bold outline-none',
                      !isDisabled && 'cursor-pointer',
                      isDisabled && 'cursor-default'
                    )}
                    style={{
                      backgroundColor: 'var(--color-bg-card)',
                      border: isWinCell ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      boxShadow: isWinCell ? '0 0 20px rgba(249,115,22,0.35)' : 'none',
                      transform: isWinCell ? 'scale(1.05)' : 'scale(1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isDisabled) {
                        e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                        e.currentTarget.style.borderColor = 'var(--color-primary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isDisabled) {
                        e.currentTarget.style.backgroundColor = 'var(--color-bg-card)';
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                      }
                    }}
                  >
                    {cell === 'X' && (
                      <span className="text-4xl font-bold" style={{ color: mode === 'online' ? (mySymbol === 'X' ? '#3B82F6' : '#EF4444') : '#3B82F6' }}>X</span>
                    )}
                    {cell === 'O' && (
                      <span className="text-4xl font-bold leading-none" style={{ color: mode === 'online' ? (mySymbol === 'O' ? '#3B82F6' : '#EF4444') : '#EF4444' }}>○</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Local game over */}
            {mode === 'local' && displayWinner && (
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-extrabold"
                  style={{ color: displayWinner === 'X' ? '#3B82F6' : displayWinner === 'O' ? '#EF4444' : '#fbbf24' }}>
                  {displayWinner === 'draw'
                    ? t('ttt.draw_result')
                    : t('ttt.local_player_wins', { name: displayWinner === 'X' ? localP1Label : localP2Label })}
                </h2>
                <div className="flex gap-3 justify-center">
                  <button onClick={resetGame}
                    className="px-6 py-2 rounded-lg font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)' }}>
                    {t('ttt.play_again')}
                  </button>
                  <button
                    onClick={() => navigate('/games/playpage')}
                    className="px-6 py-2 rounded-lg font-medium"
                    style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
                    {t('ttt.back_to_games')}
                  </button>
                </div>
              </div>
            )}

            {/* Online game over */}
            {mode === 'online' && onlinePhase === 'game_over' && (
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-extrabold"
                  style={{ 
                    color: onlineWinner === 'draw' ? '#fbbf24' :
                           onlineWinner === mySymbol ? '#3B82F6' : '#EF4444'
                  }}>
                  {onlineWinner === 'draw' ? t('ttt.draw_result') :
                   onlineWinner === mySymbol ? t('ttt.you_win') : t('ttt.you_lose')}
                </h2>
                <div className="flex gap-3 justify-center">
                  <button onClick={handleFindMatch}
                    className="px-6 py-2 rounded-lg font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)' }}>
                    {t('ttt.play_again')}
                  </button>
                  <button
                    onClick={() => navigate('/games/playpage')}
                    className="px-6 py-2 rounded-lg font-medium"
                    style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
                    {t('ttt.back_to_games')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel */}
          <div className="space-y-4">
            {/* Player cards */}
            <div className="flex items-center gap-3 p-4 rounded-lg transition-all duration-200"
              style={{
                backgroundColor: 'var(--color-bg-card)',
                border: (mode === 'local' ? isXTurn : isMyTurn) && !displayWinner ? '2px solid #3B82F6' : '1px solid var(--color-border)',
                boxShadow: (mode === 'local' ? isXTurn : isMyTurn) && !displayWinner ? '0 0 20px rgba(59,130,246,0.25)' : 'none',
                opacity: (mode === 'local' ? isXTurn : isMyTurn) && !displayWinner ? 1 : 0.65,
              }}>
              <Avatar name={mode === 'online' ? t('ttt.you') : localP1Label} size="md" />
              <div>
                <p className="text-sm font-bold" style={{ color: '#3B82F6' }}>
                  {mode === 'online' ? t('ttt.you') : localP1Label} ({mode === 'online' ? mySymbol ?? '?' : 'X'})
                </p>
                {mode === 'local' && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{t('ttt.wins_count', { count: scores.X })}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-lg transition-all duration-200"
              style={{
                backgroundColor: 'var(--color-bg-card)',
                border: (mode === 'local' ? !isXTurn : (!isMyTurn && onlinePhase === 'playing')) && !displayWinner ? '2px solid #EF4444' : '1px solid var(--color-border)',
                boxShadow: (mode === 'local' ? !isXTurn : (!isMyTurn && onlinePhase === 'playing')) && !displayWinner ? '0 0 20px rgba(239,68,68,0.25)' : 'none',
                opacity: (mode === 'local' ? !isXTurn : (!isMyTurn && onlinePhase === 'playing')) && !displayWinner ? 1 : 0.65,
              }}>
              <Avatar name={mode === 'online' ? opponentName : localP2Label} size="md" />
              <div>
                <p className="text-sm font-bold" style={{ color: '#EF4444' }}>
                  {mode === 'online' ? opponentName : localP2Label} ({mode === 'online' ? (mySymbol === 'X' ? 'O' : mySymbol === 'O' ? 'X' : '?') : 'O'})
                </p>
                {mode === 'local' && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{t('ttt.wins_count', { count: scores.O })}</p>
                )}
              </div>
            </div>

            {/* Move history (local only) */}
            {mode === 'local' && (
              <>
                <div className="p-4 rounded-lg max-h-52 overflow-y-auto"
                  style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                  <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>{t('ttt.move_history')}</h3>
                  {moves.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{t('ttt.no_moves')}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {moves.map((move, i) => (
                        <div key={i} className="text-xs px-2 py-1.5 rounded-lg"
                          style={{
                            backgroundColor: i === moves.length - 1 ? 'rgba(249,115,22,0.12)' : 'transparent',
                            color: i === moves.length - 1 ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                          }}>
                          <span style={{ color: 'var(--color-text-muted)' }}>#{i + 1}</span> {move}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button onClick={resetGame}
                  className="w-full py-2 rounded-lg text-sm font-medium transition-all duration-150"
                  style={{ backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}>
                  {t('ttt.reset_game')}
                </button>
              </>
            )}

            {/* Online status */}
            {mode === 'online' && onlinePhase === 'playing' && (
              <div className="p-4 rounded-lg"
                style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>{t('ttt.game_status')}</h3>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {isMyTurn ? t('ttt.your_turn_status') : t('ttt.waiting_for', { name: opponentName })}
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
      <FloatingChatWidget />
    </>
  );
}
