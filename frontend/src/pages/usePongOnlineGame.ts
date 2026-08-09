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
  const [spectateLinkCopied, setSpectateLinkCopied] = useState(false);
  const [spectatorCount, setSpectatorCount] = useState(0);
  const [mmPath, setMmPath] = useState<string | null>(null);
  const [gamePath, setGamePath] = useState<string | null>(
    initialGameId ? `/ws/game/pong/${initialGameId}/` : null,
  );

  const latestOnlineStateRef = useRef<OnlineGameState | null>(null);
  const onlineScoreRef = useRef({ p1: 0, p2: 0 });
  const snapshotBufferRef = useRef<OnlineSnapshot[]>([]);
  const mySlotRef = useRef<number | null>(null);
  const latencyRef = useRef({ rttMs: 0, clockOffsetMs: 0 });
  const renderedOnlineStateRef = useRef<OnlineGameState | null>(null);
  const onlineLastRenderTsRef = useRef<number | null>(null);
  const previousDirectionRef = useRef<'up' | 'down' | 'stop'>('stop');
  const inputChangedAtRef = useRef(0);
  const latestLocalInputSequenceRef = useRef(0);
  const lastProcessedInputSequenceRef = useRef(0);
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
    const keys = keysRef.current ?? {};

    const updateDirection = () => {
      const direction = getOnlineInputMessageDirection(keys);
      if (direction !== previousDirectionRef.current) {
        previousDirectionRef.current = direction;
        inputChangedAtRef.current = performance.now();
        const sequence = ++latestLocalInputSequenceRef.current;
        gameSendRef.current({ type: 'input', direction, sequence });
      }
    };

    const setKey = (event: KeyboardEvent, pressed: boolean) => {
      const key = normalizePongKey(event.key);
      if (key === null) return;
      event.preventDefault();
      keys[key] = pressed;
      if (key === 'w') keys.W = false;
      if (key === 's') keys.S = false;
      updateDirection();
    };
    const onKeyDown = (event: KeyboardEvent) => setKey(event, true);
    const onKeyUp = (event: KeyboardEvent) => setKey(event, false);
    const onBlur = () => {
      clearPongKeys(keys);
      updateDirection();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // The local-game keyboard listener is shared with this hook. Read its
    // current state once in case a key was already held when play began.
    updateDirection();
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      clearPongKeys(keys);
      stopOnlineInput(
        previousDirectionRef,
        gameSendRef,
        latestLocalInputSequenceRef,
      );
    };
  }, [mode, onlinePhase, keysRef]);

  const pushOnlineSnapshot = useCallback((
    ball: { x: number; y: number; vx: number; vy: number },
    player1: { score: number; paddle: { y: number } },
    player2: { score: number; paddle: { y: number } },
  ) => {
    const authoritative: OnlineGameState = {
      ball,
      paddles: {
        1: { y: player1.paddle.y },
        2: { y: player2.paddle.y },
      },
    };
    console.log("received", performance.now(), authoritative.ball);
    const snapshot: OnlineSnapshot = {
      receivedAt: performance.now(),
      state: authoritative,
    };
    const scoreChanged = onlineScoreRef.current.p1 !== player1.score
      || onlineScoreRef.current.p2 !== player2.score;
    if (scoreChanged) {
      snapshotBufferRef.current = [snapshot];
    } else {
      snapshotBufferRef.current.push(snapshot);
      trimSnapshots(snapshotBufferRef.current);
    }
    latestOnlineStateRef.current = authoritative;
    onlineScoreRef.current = { p1: player1.score, p2: player2.score };
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
        setLastProcessedInputSequence: (sequence) => {
          lastProcessedInputSequenceRef.current = Math.max(
            lastProcessedInputSequenceRef.current,
            sequence,
          );
          latestLocalInputSequenceRef.current = Math.max(
            latestLocalInputSequenceRef.current,
            sequence,
          );
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
          inputChangedAt: inputChangedAtRef.current,
          latestLocalInputSequence: latestLocalInputSequenceRef.current,
          lastProcessedInputSequence: lastProcessedInputSequenceRef.current,
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
    onlineScoreRef.current = { p1: 0, p2: 0 };
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
    latestLocalInputSequenceRef.current = 0;
    lastProcessedInputSequenceRef.current = 0;
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

  /** Copies the neutral /spectate link for this game. */
  const shareSpectateLink = useCallback(() => {
    if (!gameId || !mySlot) return;
    const url = `${window.location.origin}/spectate/${gameId}`;
    navigator.clipboard.writeText(url).then(() => {
      setSpectateLinkCopied(true);
      setTimeout(() => setSpectateLinkCopied(false), 2000);
    }).catch(() => {});
  }, [gameId, mySlot]);

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
    toggleEmotePalette: () => setShowEmotePalette((prev) => !prev),
    spectateLinkCopied,
    shareSpectateLink,
  };
}

function stopOnlineInput(
  previousDirectionRef: { current: 'up' | 'down' | 'stop' },
  gameSendRef: { current: (data: Record<string, unknown>) => void },
  latestLocalInputSequenceRef: { current: number },
) {
  if (previousDirectionRef.current === 'stop') return;
  const sequence = ++latestLocalInputSequenceRef.current;
  gameSendRef.current({ type: 'input', direction: 'stop', sequence });
  previousDirectionRef.current = 'stop';
}

function normalizePongKey(key: string): 'w' | 's' | 'ArrowUp' | 'ArrowDown' | null {
  if (key === 'w' || key === 'W') return 'w';
  if (key === 's' || key === 'S') return 's';
  if (key === 'ArrowUp' || key === 'ArrowDown') return key;
  return null;
}

function clearPongKeys(keys: Record<string, boolean>) {
  keys.w = false;
  keys.W = false;
  keys.s = false;
  keys.S = false;
  keys.ArrowUp = false;
  keys.ArrowDown = false;
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
  inputChangedAt,
  latestLocalInputSequence,
  lastProcessedInputSequence,
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
  inputChangedAt: number;
  latestLocalInputSequence: number;
  lastProcessedInputSequence: number;
  setRenderedState: (state: OnlineGameState, renderTs: number) => void;
}) {
  console.log("buffer", snapshots.length);
  const frameState = resolveOnlineFrameState({
    snapshots,
    latestState,
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
    latestState,
    nowMs,
    lastRenderTs,
    mySlot,
    keys,
    reconcileLocalPaddle: (
      nowMs - inputChangedAt > Math.max(50, latency.rttMs + 1000 / 30)
    ),
    latestLocalInputSequence,
    lastProcessedInputSequence,
  });
  console.log("rendered", performance.now(), smoothedFrame.state.ball);
  setRenderedState(smoothedFrame.state, smoothedFrame.lastRenderTs);
  drawPerspectiveOnlineFrame(context, canvas, smoothedFrame.state, mySlot);
}
