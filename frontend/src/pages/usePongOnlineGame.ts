import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useFloatingEmotes } from '../components/Chat/FloatingEmote';
import { useGameSocket } from '../hooks/useGameSocket';
import type { PongMode, PongOnlinePhase } from './PongGameView';
import {
  drawPerspectiveOnlineFrame,
  getOnlineInputMessageDirection,
  resolveOnlineFrameState,
  smoothOnlineState,
  type OnlineGameState,
  type OnlineSnapshot,
} from './PongRenderer';
import {
  handlePongGameMessage,
  handlePongMatchmakingMessage,
} from './PongSocketMessages';

interface OnlineGameOptions {
  canvasRef: RefObject<HTMLCanvasElement>;
  keysRef: RefObject<Record<string, boolean>>;
  mode: PongMode;
  initialGameId: string | null;
  onExit: () => void;
}

export function usePongOnlineGame({
  canvasRef,
  keysRef,
  mode,
  initialGameId,
  onExit,
}: OnlineGameOptions) {
  const [onlinePhase, setOnlinePhase] = useState<PongOnlinePhase>(
    initialGameId ? 'waiting' : 'idle',
  );
  const [gameId, setGameId] = useState<string | null>(initialGameId);
  const [mySlot, setMySlot] = useState<number | null>(null);
  const [onlineScore, setOnlineScore] = useState({ p1: 0, p2: 0 });
  const [opponentName, setOpponentName] = useState('');
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [onlineReason, setOnlineReason] = useState<string | null>(null);
  const [onlineWinnerSlot, setOnlineWinnerSlot] = useState<number | null>(null);
  const [iReady, setIReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [gamePaused, setGamePaused] = useState(false);
  const [showEmotePalette, setShowEmotePalette] = useState(false);
  const [spectatorCount, setSpectatorCount] = useState({
    total: 0,
    side1: 0,
    side2: 0,
  });
  const [mmPath, setMmPath] = useState<string | null>(null);
  const [gamePath, setGamePath] = useState<string | null>(
    initialGameId ? `/ws/game/pong/${initialGameId}/` : null,
  );

  const latestOnlineStateRef = useRef<OnlineGameState | null>(null);
  const snapshotBufferRef = useRef<OnlineSnapshot[]>([]);
  const mySlotRef = useRef<number | null>(null);
  const latencyRef = useRef({ rttMs: 0, clockOffsetMs: 0 });
  const renderedOnlineStateRef = useRef<OnlineGameState | null>(null);
  const onlineLastRenderTsRef = useRef<number | null>(null);
  const previousDirectionRef = useRef<'up' | 'down' | 'stop'>('stop');
  const gameSendRef = useRef<(data: Record<string, unknown>) => void>(() => {});
  const {
    emotes: floatingEmotes,
    addEmote,
    addSpectatorEmote,
  } = useFloatingEmotes();

  useEffect(() => {
    if (!initialGameId) return;
    setGameId(initialGameId);
    setGamePath(`/ws/game/pong/${initialGameId}/`);
    setOnlinePhase('waiting');
  }, [initialGameId]);

  useEffect(() => {
    if (mode !== 'online' || onlinePhase !== 'playing') return;

    let animationId = 0;
    const pushInputFrame = () => {
      const direction = getOnlineInputMessageDirection(keysRef.current ?? {});
      if (direction !== previousDirectionRef.current) {
        previousDirectionRef.current = direction;
        gameSendRef.current({ type: 'input', direction });
      }
      animationId = requestAnimationFrame(pushInputFrame);
    };
    animationId = requestAnimationFrame(pushInputFrame);
    return () => {
      cancelAnimationFrame(animationId);
      stopOnlineInput(previousDirectionRef, gameSendRef);
    };
  }, [mode, onlinePhase, keysRef]);

  const pushOnlineSnapshot = useCallback((
    ball: { x: number; y: number; vx: number; vy: number },
    player1: { score: number; paddle: { y: number } },
    player2: { score: number; paddle: { y: number } },
    serverTsMs: number | null,
  ) => {
    const authoritative: OnlineGameState = {
      ball,
      paddles: {
        1: { y: player1.paddle.y },
        2: { y: player2.paddle.y },
      },
    };
    snapshotBufferRef.current.push({
      serverTsMs: Number.isFinite(serverTsMs) ? Number(serverTsMs) : Date.now(),
      state: authoritative,
    });
    trimSnapshots(snapshotBufferRef.current);
    latestOnlineStateRef.current = authoritative;
    setOnlineScore((previous) => (
      previous.p1 === player1.score && previous.p2 === player2.score
        ? previous
        : { p1: player1.score, p2: player2.score }
    ));
  }, []);

  const resetOnlineRenderState = useCallback(() => {
    snapshotBufferRef.current = [];
    renderedOnlineStateRef.current = null;
    onlineLastRenderTsRef.current = null;
  }, []);

  const { send: matchmakingSend } = useGameSocket(mmPath, {
    onOpen: useCallback(() => {
      matchmakingSend({ type: 'find_match', game_type: 'pong' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
    onMessage: useCallback((data: Record<string, unknown>) => {
      handlePongMatchmakingMessage(data, {
        setOpponentName,
        setGameId,
        setMmPath,
        setGamePath,
        setOnlinePhase,
      });
    }, []),
  });

  const {
    send: gameSend,
    status: gameSocketStatus,
    latency: gameLatency,
  } = useGameSocket(gamePath, {
    enableLatencyProbe: true,
    onOpen: useCallback(() => {
      if (gameId) {
        gameSend({ type: 'join', game_id: gameId });
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameId]),
    onMessage: useCallback((data: Record<string, unknown>) => {
      handlePongGameMessage(data, {
        getMySlot: () => mySlotRef.current,
        setMySlot: (slot) => {
          setMySlot(slot);
          mySlotRef.current = slot;
        },
        resetRenderState: resetOnlineRenderState,
        pushSnapshot: pushOnlineSnapshot,
        setOpponentName,
        setOnlinePhase,
        setGamePaused,
        setOpponentLeft,
        setOnlineReason,
        setOnlineWinnerSlot,
        setOnlineScore,
        setIReady,
        setOpponentReady,
        setSpectatorCount,
        addEmote,
        addSpectatorEmote,
      });
    }, [
      pushOnlineSnapshot,
      resetOnlineRenderState,
      addEmote,
      addSpectatorEmote,
    ]),
  });

  useEffect(() => {
    gameSendRef.current = gameSend;
  }, [gameSend]);

  useEffect(() => {
    latencyRef.current = {
      rttMs: gameLatency.rttMs ?? 0,
      clockOffsetMs: gameLatency.clockOffsetMs ?? 0,
    };
  }, [gameLatency.rttMs, gameLatency.clockOffsetMs]);

  useEffect(() => {
    if (mode !== 'online') return;

    let animationId = 0;
    const renderFrame = (nowMs: number) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (canvas && context) {
        renderOnlineFrame({
          nowMs,
          canvas,
          context,
          keys: keysRef.current ?? {},
          mySlot,
          snapshots: snapshotBufferRef.current,
          latestState: latestOnlineStateRef.current,
          latency: latencyRef.current,
          previousRendered: renderedOnlineStateRef.current,
          lastRenderTs: onlineLastRenderTsRef.current,
          setRenderedState: (state, renderTs) => {
            renderedOnlineStateRef.current = state;
            onlineLastRenderTsRef.current = renderTs;
          },
        });
      }
      animationId = requestAnimationFrame(renderFrame);
    };

    animationId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animationId);
  }, [mode, mySlot, canvasRef, keysRef]);

  const findMatch = () => {
    resetOnlineRenderState();
    setOnlinePhase('matchmaking');
    setOnlineScore({ p1: 0, p2: 0 });
    setOpponentLeft(false);
    setOnlineReason(null);
    setOnlineWinnerSlot(null);
    setMySlot(null);
    mySlotRef.current = null;
    setOpponentName('');
    setGameId(null);
    setGamePath(null);
    setIReady(false);
    setOpponentReady(false);
    setGamePaused(false);
    previousDirectionRef.current = 'stop';
    setMmPath('/ws/matchmaking/');
  };

  const ready = () => {
    if (iReady) return;
    setIReady(true);
    gameSend({ type: 'ready' });
  };

  const cancelOnline = () => {
    resetOnlineRenderState();
    setMmPath(null);
    setGamePath(null);
    setOnlinePhase('idle');
    onExit();
  };

  const sendEmote = (emoteId: string) => {
    gameSend({ type: 'emote', emote_id: emoteId });
    setShowEmotePalette(false);
  };

  return {
    onlinePhase,
    onlineScore,
    mySlot,
    opponentName,
    opponentLeft,
    onlineReason,
    onlineWinnerSlot,
    iReady,
    opponentReady,
    gamePaused,
    gameSocketStatus,
    spectatorCount,
    showEmotePalette,
    floatingEmotes,
    findMatch,
    cancelOnline,
    ready,
    forfeit: () => gameSend({ type: 'forfeit' }),
    sendEmote,
  };
}

function stopOnlineInput(
  previousDirectionRef: { current: 'up' | 'down' | 'stop' },
  gameSendRef: { current: (data: Record<string, unknown>) => void },
) {
  if (previousDirectionRef.current === 'stop') return;
  gameSendRef.current({ type: 'input', direction: 'stop' });
  previousDirectionRef.current = 'stop';
}

function trimSnapshots(snapshots: OnlineSnapshot[]) {
  if (snapshots.length > 30) {
    snapshots.splice(0, snapshots.length - 30);
  }
}

function renderOnlineFrame({
  nowMs,
  canvas,
  context,
  keys,
  mySlot,
  snapshots,
  latestState,
  latency,
  previousRendered,
  lastRenderTs,
  setRenderedState,
}: {
  nowMs: number;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  keys: Record<string, boolean>;
  mySlot: number | null;
  snapshots: OnlineSnapshot[];
  latestState: OnlineGameState | null;
  latency: { rttMs: number; clockOffsetMs: number };
  previousRendered: OnlineGameState | null;
  lastRenderTs: number | null;
  setRenderedState: (state: OnlineGameState, renderTs: number) => void;
}) {
  const frameState = resolveOnlineFrameState({
    snapshots,
    latestState,
    latency,
    mySlot,
    keys,
  });
  if (!frameState) {
    if (previousRendered) {
      drawPerspectiveOnlineFrame(context, canvas, previousRendered, mySlot);
    }
    return;
  }

  const smoothedFrame = smoothOnlineState({
    previousRendered,
    targetState: frameState,
    nowMs,
    lastRenderTs,
    mySlot,
  });
  setRenderedState(smoothedFrame.state, smoothedFrame.lastRenderTs);
  drawPerspectiveOnlineFrame(context, canvas, smoothedFrame.state, mySlot);
}
