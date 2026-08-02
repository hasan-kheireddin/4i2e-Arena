import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../components/ui/Avatar';
import { useGameSocket } from '../hooks/useGameSocket';
import { createLocalMatch } from '../services/games';
import { getOrCreateDM } from '../services/chat';
import Renderer3D from '../components/Renderer3D/Renderer';
import EmotePalette from '../components/Chat/EmotePalette';
import FloatingEmoteOverlay, { useFloatingEmotes } from '../components/Chat/FloatingEmote';
import FloatingChatWidget from '../components/Chat/FloatingChatWidget';

const DEBUG = false;
function debugLog(...args: unknown[]) {
  if (DEBUG) console.debug('[PONG3D]', ...args);
}

interface PaddleState { y: number }
interface BallState { x: number; y: number; vx: number; vy: number }

type Mode = 'local' | 'online' | 'ai';
type Difficulty = 'easy' | 'medium' | 'hard';
type OnlinePhase = 'idle' | 'matchmaking' | 'waiting' | 'playing' | 'over';

interface OnlineGameState {
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: { [slot: number]: { y: number } };
}

interface OnlineSnapshot {
  receivedAt: number;
  state: OnlineGameState;
}

const WIN_SCORE = 7;
const PADDLE_SPEED = 6;
const AI_SPEED: Record<Difficulty, number> = { easy: 0.06, medium: 0.10, hard: 0.18 };
const BALL_SPEED: Record<Difficulty, number> = { easy: 0.7, medium: 1.0, hard: 1.4 };
const BASE_BALL_VX = 4;
const BASE_BALL_VY = 3;
const SERVER_TICK_RATE = 60;
const SERVER_PADDLE_SPEED = 8;
const LOCAL_SIM_HZ = 60;
const LOCAL_STEP_MS = 1000 / LOCAL_SIM_HZ;
const LOCAL_MAX_CATCHUP_STEPS = 6;
const ONLINE_FIELD_WIDTH = 800;
const ONLINE_FIELD_HEIGHT = 600;
const ONLINE_PADDLE_OFFSET = 20;
const ONLINE_PADDLE_HALF_HEIGHT = 40;
const ONLINE_SMOOTHING_GAIN = 26;
const LOCAL_RECONCILIATION_THRESHOLD = 6;
const FIELD_W = 800;
const FIELD_H = 387;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}

function readInputSequence(value: unknown): number {
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : 0;
}

function getOnlineInputDirection(keys: Record<string, boolean>): -1 | 0 | 1 {
  if (keys['w'] || keys['W'] || keys['ArrowUp']) return -1;
  if (keys['s'] || keys['S'] || keys['ArrowDown']) return 1;
  return 0;
}

function projectOnlinePaddleY(y: number, velocityPerTick: number, dtMs: number): number {
  const dtTicks = (dtMs / 1000) * SERVER_TICK_RATE;
  return clamp(
    y + velocityPerTick * dtTicks,
    ONLINE_PADDLE_HALF_HEIGHT,
    ONLINE_FIELD_HEIGHT - ONLINE_PADDLE_HALF_HEIGHT,
  );
}

export default function Pong3DPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawMode = searchParams.get('mode') ?? 'local';
  const hasGameId = searchParams.has('game_id');
  const mode: Mode = hasGameId ? 'online' : rawMode === 'online' ? 'online' : rawMode === 'ai' ? 'ai' : 'local';
  const rawDiff = searchParams.get('difficulty') ?? 'medium';
  const difficulty: Difficulty = (['easy', 'medium', 'hard'] as Difficulty[]).includes(rawDiff as Difficulty)
    ? rawDiff as Difficulty : 'medium';

  const getBallSpeed = useCallback((vx: number, vy: number) => {
    const multiplier = mode === 'ai' ? BALL_SPEED[difficulty] : 1.0;
    return { vx: vx * multiplier, vy: vy * multiplier };
  }, [mode, difficulty]);

  const [score, setScore] = useState({ p1: 0, p2: 0 });
  const [gameOver, setGameOver] = useState(false);
  const [gameStartTime, setGameStartTime] = useState<number | null>(null);
  const gameOverRef = useRef(false);
  const matchSavedRef = useRef(false);
  const [localPlayerNames, setLocalPlayerNames] = useState({ p1: '', p2: '' });
  const [localNamesReady, setLocalNamesReady] = useState(mode !== 'local');
  const localLastFrameTsRef = useRef<number | null>(null);
  const localAccumulatorMsRef = useRef(0);

  const initialBall = getBallSpeed(BASE_BALL_VX, BASE_BALL_VY);
  const gameState = useRef({
    p1: { y: FIELD_H / 2 } as PaddleState,
    p2: { y: FIELD_H / 2 } as PaddleState,
    ball: { x: FIELD_W / 2, y: FIELD_H / 2, vx: initialBall.vx, vy: initialBall.vy } as BallState,
  });

  const keysRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    gameOverRef.current = gameOver;
  }, [gameOver]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      keysRef.current[e.key] = true;
      if (['ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => { keysRef.current[e.key] = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  const [onlinePhase, setOnlinePhase] = useState<OnlinePhase>('idle');
  const [gameId, setGameId] = useState<string | null>(null);
  const [mySlot, setMySlot] = useState<number | null>(null);
  const [onlineScore, setOnlineScore] = useState({ p1: 0, p2: 0 });
  const onlineScoreRef = useRef({ p1: 0, p2: 0 });
  const latestOnlineStateRef = useRef<OnlineGameState | null>(null);
  const snapshotBufferRef = useRef<OnlineSnapshot[]>([]);
  const [opponentName, setOpponentName] = useState('');
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [onlineReason, setOnlineReason] = useState<string | null>(null);
  const [onlineWinnerSlot, setOnlineWinnerSlot] = useState<number | null>(null);
  const [iReady, setIReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [gamePaused, setGamePaused] = useState(false);
  const [localPaused, setLocalPaused] = useState(false);
  const localPausedRef = useRef(false);
  const mySlotRef = useRef<number | null>(null);
  const renderedOnlineStateRef = useRef<OnlineGameState | null>(null);
  const onlineLastRenderTsRef = useRef<number | null>(null);
  const latestLocalInputSequenceRef = useRef(0);
  const lastProcessedInputSequenceRef = useRef(0);

  const [mmPath, setMmPath] = useState<string | null>(null);
  const [gamePath, setGamePath] = useState<string | null>(null);

  useEffect(() => {
    const gid = searchParams.get('game_id');
    if (gid) {
      setGameId(gid);
      setGamePath(`/ws/game/pong/${gid}/`);
      setOnlinePhase('waiting');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevDirectionRef = useRef<'up' | 'down' | 'stop'>('stop');

  const [showEmotePalette, setShowEmotePalette] = useState(false);
  const { emotes: floatingEmotes, addEmote, addSpectatorEmote } = useFloatingEmotes();
  const [spectatorCount, setSpectatorCount] = useState({ total: 0, side1: 0, side2: 0 });
  const [copied, setCopied] = useState(false);
  const handleShare = useCallback(() => {
    if (!gameId || !mySlot) return;
    const url = `${window.location.origin}/spectate/${gameId}?side=${mySlot}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [gameId, mySlot]);

  const simulateLocalStep = useCallback((
    gs: { p1: PaddleState; p2: PaddleState; ball: BallState },
    keys: Record<string, boolean>,
  ) => {
    if (keys['w'] || keys['W'] || (mode === 'ai' && keys['ArrowUp'])) gs.p1.y = Math.max(40, gs.p1.y - PADDLE_SPEED);
    if (keys['s'] || keys['S'] || (mode === 'ai' && keys['ArrowDown'])) gs.p1.y = Math.min(FIELD_H - 40, gs.p1.y + PADDLE_SPEED);

    if (mode === 'ai') {
      gs.p2.y += (gs.ball.y - gs.p2.y) * AI_SPEED[difficulty];
    } else {
      if (keys['ArrowUp']) gs.p2.y = Math.max(40, gs.p2.y - PADDLE_SPEED);
      if (keys['ArrowDown']) gs.p2.y = Math.min(FIELD_H - 40, gs.p2.y + PADDLE_SPEED);
    }

    gs.ball.x += gs.ball.vx;
    gs.ball.y += gs.ball.vy;

    if (gs.ball.y <= 8 || gs.ball.y >= FIELD_H - 8) gs.ball.vy *= -1;

    if (gs.ball.x <= 22 && gs.ball.x >= 10 && gs.ball.y >= gs.p1.y - 40 && gs.ball.y <= gs.p1.y + 40) {
      gs.ball.vx = Math.abs(gs.ball.vx) * 1.02;
      gs.ball.vy += (gs.ball.y - gs.p1.y) * 0.04;
    }
    if (gs.ball.x >= FIELD_W - 22 && gs.ball.x <= FIELD_W - 10 && gs.ball.y >= gs.p2.y - 40 && gs.ball.y <= gs.p2.y + 40) {
      gs.ball.vx = -Math.abs(gs.ball.vx) * 1.02;
      gs.ball.vy += (gs.ball.y - gs.p2.y) * 0.04;
    }

    if (gs.ball.x < 0) {
      let didEndGame = false;
      setScore((prev) => {
        if (gameOverRef.current) return prev;
        const nextScore = Math.min(prev.p2 + 1, WIN_SCORE);
        const next = { ...prev, p2: nextScore };
        if (nextScore >= WIN_SCORE) {
          didEndGame = true;
          gameOverRef.current = true;
          setGameOver(true);
        }
        return next;
      });
      if (!didEndGame) {
        const resetSpeed = getBallSpeed(-BASE_BALL_VX, BASE_BALL_VY);
        gs.ball = { x: FIELD_W / 2, y: FIELD_H / 2, vx: resetSpeed.vx, vy: resetSpeed.vy };
      }
    } else if (gs.ball.x > FIELD_W) {
      let didEndGame = false;
      setScore((prev) => {
        if (gameOverRef.current) return prev;
        const nextScore = Math.min(prev.p1 + 1, WIN_SCORE);
        const next = { ...prev, p1: nextScore };
        if (nextScore >= WIN_SCORE) {
          didEndGame = true;
          gameOverRef.current = true;
          setGameOver(true);
        }
        return next;
      });
      if (!didEndGame) {
        const resetSpeed = getBallSpeed(BASE_BALL_VX, -BASE_BALL_VY);
        gs.ball = { x: FIELD_W / 2, y: FIELD_H / 2, vx: resetSpeed.vx, vy: resetSpeed.vy };
      }
    }
  }, [mode, difficulty, getBallSpeed]);

  useEffect(() => {
    if (mode === 'online' || gameOver || (mode === 'local' && !localNamesReady)) return;
    if (!gameStartTime && (mode === 'ai' || (mode === 'local' && localNamesReady))) {
      setGameStartTime(Date.now());
    }
    localLastFrameTsRef.current = null;
    localAccumulatorMsRef.current = 0;

    let rafId: number;
    const animate = (nowMs: number) => {
      const gs = gameState.current;
      const keys = keysRef.current;

      if (localLastFrameTsRef.current === null) {
        localLastFrameTsRef.current = nowMs;
      }
      let deltaMs = nowMs - localLastFrameTsRef.current;
      localLastFrameTsRef.current = nowMs;
      if (!Number.isFinite(deltaMs) || deltaMs < 0) deltaMs = 0;
      deltaMs = Math.min(deltaMs, 250);
      localAccumulatorMsRef.current += deltaMs;

      if (localPausedRef.current) {
        localAccumulatorMsRef.current = 0;
        rafId = requestAnimationFrame(animate);
        return;
      }

      let steps = 0;
      while (
        !gameOverRef.current
        && localAccumulatorMsRef.current >= LOCAL_STEP_MS
        && steps < LOCAL_MAX_CATCHUP_STEPS
      ) {
        simulateLocalStep(gs, keys);
        localAccumulatorMsRef.current -= LOCAL_STEP_MS;
        steps += 1;
      }
      if (steps >= LOCAL_MAX_CATCHUP_STEPS) {
        localAccumulatorMsRef.current = 0;
      }

      if (!gameOverRef.current) {
        rafId = requestAnimationFrame(animate);
      }
    };
    localPausedRef.current = localPaused;
    rafId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(rafId);
      localLastFrameTsRef.current = null;
      localAccumulatorMsRef.current = 0;
    };
  }, [mode, gameOver, gameStartTime, localNamesReady, simulateLocalStep, localPaused]);

  useEffect(() => {
    if (!gameOver || mode === 'online' || !gameStartTime || matchSavedRef.current) return;
    matchSavedRef.current = true;

    const saveMatch = async () => {
      const durationSeconds = Math.round((Date.now() - gameStartTime) / 1000);
      const winner = score.p1 >= WIN_SCORE ? 'X' : 'O';
      try {
        await createLocalMatch({
          game_type: 'pong',
          game_mode: mode === 'ai' ? 'pve' : 'pvp',
          winner,
          duration_seconds: durationSeconds,
          player1_score: score.p1,
          player2_score: score.p2,
          ai_difficulty: mode === 'ai' ? difficulty : undefined,
          metadata: {
            mode,
            final_score: score,
            is_3d: true,
            local_players: mode === 'local'
              ? {
                  player1_name: localPlayerNames.p1.trim(),
                  player2_name: localPlayerNames.p2.trim(),
                }
              : undefined,
          },
        });
      } catch { /* ignore */ }
    };
    saveMatch();
  }, [gameOver, mode, gameStartTime, score, difficulty, localPlayerNames]);

  const gameSendRef = useRef<(data: Record<string, unknown>) => void>(() => {});

  useEffect(() => {
    if (mode !== 'online' || onlinePhase !== 'playing') return;
    let rafId = 0;
    const pushInputFrame = () => {
      const keys = keysRef.current;
      let dir: 'up' | 'down' | 'stop' = 'stop';
      if (keys['w'] || keys['W'] || keys['ArrowUp']) dir = 'up';
      else if (keys['s'] || keys['S'] || keys['ArrowDown']) dir = 'down';
      if (dir !== prevDirectionRef.current) {
        prevDirectionRef.current = dir;
        const sequence = ++latestLocalInputSequenceRef.current;
        gameSendRef.current({ type: 'input', direction: dir, sequence });
      }
      rafId = requestAnimationFrame(pushInputFrame);
    };
    rafId = requestAnimationFrame(pushInputFrame);
    return () => {
      cancelAnimationFrame(rafId);
      if (prevDirectionRef.current !== 'stop') {
        const sequence = ++latestLocalInputSequenceRef.current;
        gameSendRef.current({ type: 'input', direction: 'stop', sequence });
        prevDirectionRef.current = 'stop';
      }
    };
  }, [mode, onlinePhase]);

  const pushOnlineSnapshot = useCallback((
    ball: { x: number; y: number; vx: number; vy: number },
    p1: { score: number; paddle: { y: number } },
    p2: { score: number; paddle: { y: number } },
  ) => {
    debugLog(
      `SNAPSHOT ball=({x:${ball.x.toFixed(1)},y:${ball.y.toFixed(1)},vx:${ball.vx.toFixed(2)},vy:${ball.vy.toFixed(2)}})`,
      `p1=${p1.paddle.y.toFixed(1)} p2=${p2.paddle.y.toFixed(1)} score=${p1.score}-${p2.score}`,
    );
    const authoritative: OnlineGameState = {
      ball,
      paddles: { 1: { y: p1.paddle.y }, 2: { y: p2.paddle.y } },
    };
    const nextSnapshot: OnlineSnapshot = {
      receivedAt: performance.now(),
      state: authoritative,
    };
    const scoreChanged = onlineScoreRef.current.p1 !== p1.score
      || onlineScoreRef.current.p2 !== p2.score;
    if (scoreChanged) {
      snapshotBufferRef.current = [nextSnapshot];
    } else {
      const buffer = snapshotBufferRef.current;
      buffer.push(nextSnapshot);
      if (buffer.length > 30) {
        buffer.splice(0, buffer.length - 30);
      }
    }
    latestOnlineStateRef.current = authoritative;
    onlineScoreRef.current = { p1: p1.score, p2: p2.score };
    setOnlineScore((prev) => {
      if (prev.p1 !== p1.score || prev.p2 !== p2.score) {
        debugLog(`SCORE_CHANGE ${prev.p1}-${prev.p2} -> ${p1.score}-${p2.score}`);
      }
      return prev.p1 === p1.score && prev.p2 === p2.score
        ? prev
        : { p1: p1.score, p2: p2.score };
    });
  }, []);

  const mmSendRef = useRef<(data: Record<string, unknown>) => void>(() => {});
  const mmStatusRef = useRef<string>('closed');

  const { send: mmSend, status: mmStatus } = useGameSocket(mmPath, {
    onMessage: useCallback((data: Record<string, unknown>) => {
      if (data.type === 'match_found') {
        const gid = data.game_id as string;
        const opponent = data.opponent as { username?: string } | undefined;
        if (opponent?.username) setOpponentName(opponent.username);
        setGameId(gid);
        setMmPath(null);
        setGamePath(`/ws/game/pong/${gid}/`);
        setOnlinePhase('waiting');
      }
    }, []),
  });

  useEffect(() => { mmSendRef.current = mmSend; }, [mmSend]);
  useEffect(() => { mmStatusRef.current = mmStatus; }, [mmStatus]);
  useEffect(() => {
    if (mmStatus === 'open') {
      mmSend({ type: 'find_match', game_type: 'pong' });
    }
  }, [mmStatus, mmSend]);

  const gameSendRef2 = useRef<(data: Record<string, unknown>) => void>(() => {});

  const {
    send: gameSend,
    status: gameSocketStatus,
    latency: gameLatency,
  } = useGameSocket(gamePath, {
    enableLatencyProbe: true,
    onOpen: useCallback(() => {
      if (gameId) gameSendRef2.current({ type: 'join', game_id: gameId });
    }, [gameId]),
    onMessage: useCallback((data: Record<string, unknown>) => {
      const type = data.type as string;

      if (type === 'game_joined') {
        const slot = data.slot as number;
        setMySlot(slot);
        mySlotRef.current = slot;
        const sequence = readInputSequence(data.last_processed_input_sequence);
        lastProcessedInputSequenceRef.current = sequence;
        latestLocalInputSequenceRef.current = Math.max(
          latestLocalInputSequenceRef.current,
          sequence,
        );
        const info = data.game_info as Record<string, unknown> | undefined;
        if (info) {
          const players = info.players as Record<string, { username: string }> | undefined;
          if (players) {
            const oppSlot = slot === 1 ? '2' : '1';
            if (players[oppSlot]) setOpponentName(players[oppSlot].username);
          }
        }
      } else if (type === 'game_start') {
        debugLog('GAME_START');
        snapshotBufferRef.current = [];
        renderedOnlineStateRef.current = null;
        onlineLastRenderTsRef.current = null;
        setGamePaused(false);
        setOpponentLeft(false);
        setOnlinePhase('playing');
      } else if (type === 'game_state') {
        const ball = data.ball as { x: number; y: number; vx: number; vy: number };
        const p1 = data.player1 as { score: number; paddle: { y: number } } | undefined;
        const p2 = data.player2 as { score: number; paddle: { y: number } } | undefined;
        if (p1 && p2) {
          const serverTsMs = Number(data.server_ts_ms);
          debugLog(`RECV game_state ts=${serverTsMs} ball=({x:${ball.x},y:${ball.y},vx:${ball.vx},vy:${ball.vy}})`);
          lastProcessedInputSequenceRef.current = Math.max(
            lastProcessedInputSequenceRef.current,
            readInputSequence(data.last_processed_input_sequence),
          );
          pushOnlineSnapshot(ball, p1, p2);
        }
        setOnlinePhase((prev) => prev === 'waiting' ? 'playing' : prev);
      } else if (type === 'game_resumed') {
        const ball = data.ball as { x: number; y: number; vx: number; vy: number };
        const p1 = data.player1 as { score: number; paddle: { y: number } } | undefined;
        const p2 = data.player2 as { score: number; paddle: { y: number } } | undefined;
        debugLog(`RECV game_resumed ball=({x:${ball?.x},y:${ball?.y},vx:${ball?.vx},vy:${ball?.vy}})`);
        if (ball && p1 && p2) {
          lastProcessedInputSequenceRef.current = Math.max(
            lastProcessedInputSequenceRef.current,
            readInputSequence(data.last_processed_input_sequence),
          );
          pushOnlineSnapshot(ball, p1, p2);
        }
        setGamePaused(false);
        setOpponentLeft(false);
        setOnlinePhase('playing');
      } else if (type === 'game_over') {
        const winner = data.winner as number | null;
        const reason = data.reason as string;
        const fs = data.final_state as { player1?: { score: number }; player2?: { score: number } } | undefined;
        snapshotBufferRef.current = [];
        renderedOnlineStateRef.current = null;
        onlineLastRenderTsRef.current = null;
        setOnlineReason(reason);
        setOnlineWinnerSlot(winner ?? null);
        setGamePaused(false);
        if (fs?.player1 && fs?.player2) {
          onlineScoreRef.current = {
            p1: fs.player1.score,
            p2: fs.player2.score,
          };
          setOnlineScore({ p1: fs.player1.score, p2: fs.player2.score });
        }
        setOnlinePhase('over');
      } else if (type === 'both_connected') {
        const info = data.game_info as Record<string, unknown> | undefined;
        if (info) {
          const players = info.players as Record<string, { user_id: string; username: string }> | undefined;
          if (players) {
            const oppSlot = mySlotRef.current === 1 ? '2' : '1';
            const opp = players[oppSlot];
            if (opp) {
              setOpponentName(opp.username);
              getOrCreateDM(opp.user_id).catch(() => {});
            }
          }
        }
      } else if (type === 'player_ready') {
        const slot = data.slot as number;
        if (slot === mySlotRef.current) setIReady(true);
        else setOpponentReady(true);
      } else if (type === 'player_presence') {
        const slot = data.slot as number;
        const connected = data.connected as boolean;
        if (slot !== mySlotRef.current) setOpponentLeft(!connected);
        const info = data.game_info as Record<string, unknown> | undefined;
        if (info) {
          const players = info.players as Record<string, { username: string }> | undefined;
          if (players) {
            const oppSlot = mySlotRef.current === 1 ? '2' : '1';
            if (players[oppSlot]) setOpponentName(players[oppSlot].username);
          }
        }
      } else if (type === 'game_paused') {
        setGamePaused(true);
      } else if (type === 'player_left') {
        setOpponentLeft(true);
      } else if (type === 'emote') {
        const emoteId = data.emote_id as string;
        const slot = data.slot as number;
        const username = data.sender_username as string | undefined;
        addEmote(emoteId, slot, username);
      } else if (type === 'spectator_count') {
        setSpectatorCount({ total: data.total as number, side1: data.side1 as number, side2: data.side2 as number });
      } else if (type === 'spectator_emote') {
        const emoteId = data.emote_id as string;
        const side = data.side as number;
        addSpectatorEmote(emoteId, side || 0);
      }
    }, [pushOnlineSnapshot, addEmote, addSpectatorEmote]),
  });

  useEffect(() => { gameSendRef2.current = gameSend; gameSendRef.current = gameSend; }, [gameSend]);
  useEffect(() => {
    if (gameLatency.rttMs !== null) {
      debugLog(`LATENCY rtt=${gameLatency.rttMs.toFixed(1)}ms offset=${(gameLatency.clockOffsetMs ?? 0).toFixed(1)}ms`);
    }
  }, [gameLatency.rttMs, gameLatency.clockOffsetMs]);

  const [onlineDisplayState, setOnlineDisplayState] = useState<OnlineGameState | null>(null);

  useEffect(() => {
    if (mode !== 'online') return;

    let rafId = 0;
    const renderFrame = (nowMs: number) => {
      const snapshots = snapshotBufferRef.current;
      const frameState = snapshots.length > 0
        ? snapshots[snapshots.length - 1].state
        : latestOnlineStateRef.current;

      const previousRendered = renderedOnlineStateRef.current;
      if (frameState) {
        const dtMs = onlineLastRenderTsRef.current === null
          ? 16.7
          : clamp(nowMs - onlineLastRenderTsRef.current, 1, 100);
        onlineLastRenderTsRef.current = nowMs;
        const blend = clamp(
          1 - Math.exp(-(dtMs / 1000) * ONLINE_SMOOTHING_GAIN),
          0.08,
          1,
        );
        const source = previousRendered ?? frameState;
        const smoothed: OnlineGameState = {
          ball: { ...frameState.ball },
          paddles: {
            1: { y: lerp(source.paddles[1]?.y ?? 300, frameState.paddles[1]?.y ?? 300, blend) },
            2: { y: lerp(source.paddles[2]?.y ?? 300, frameState.paddles[2]?.y ?? 300, blend) },
          },
        };
        if (mySlot === 1 || mySlot === 2) {
          const predictedY = projectOnlinePaddleY(
            source.paddles[mySlot]?.y ?? frameState.paddles[mySlot]?.y ?? 300,
            getOnlineInputDirection(keysRef.current) * SERVER_PADDLE_SPEED,
            dtMs,
          );
          const authoritativeY = latestOnlineStateRef.current
            ?.paddles[mySlot]?.y ?? predictedY;
          const authoritativeBall = latestOnlineStateRef.current?.ball
            ?? frameState.ball;
          const paddleX = mySlot === 1
            ? ONLINE_PADDLE_OFFSET
            : ONLINE_FIELD_WIDTH - ONLINE_PADDLE_OFFSET;
          const nearBall = Math.abs(authoritativeBall.x - paddleX) < 40;
          const difference = authoritativeY - predictedY;
          const mayReconcile = (
            lastProcessedInputSequenceRef.current
              >= latestLocalInputSequenceRef.current
            && Math.abs(difference) >= LOCAL_RECONCILIATION_THRESHOLD
          );
          const correctionBlend = nearBall
            ? 0.6
            : (mayReconcile ? blend * 0.5 : 0);
          smoothed.paddles[mySlot] = {
            y: lerp(predictedY, authoritativeY, correctionBlend),
          };
        }
        renderedOnlineStateRef.current = smoothed;
        setOnlineDisplayState(smoothed);
      } else if (previousRendered) {
        setOnlineDisplayState(previousRendered);
      }

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [mode, mySlot]);

  const resetGame = () => {
    setScore({ p1: 0, p2: 0 });
    setGameOver(false);
    gameOverRef.current = false;
    matchSavedRef.current = false;
    setGameStartTime(null);
    if (mode === 'local') {
      setLocalPlayerNames({ p1: '', p2: '' });
      setLocalNamesReady(false);
    }
    const gs = gameState.current;
    gs.p1.y = FIELD_H / 2; gs.p2.y = FIELD_H / 2;
    const resetSpeed = getBallSpeed(BASE_BALL_VX, BASE_BALL_VY);
    gs.ball = { x: FIELD_W / 2, y: FIELD_H / 2, vx: resetSpeed.vx, vy: resetSpeed.vy };
  };

  const handleFindMatch = () => {
    setOnlinePhase('matchmaking');
    latestOnlineStateRef.current = null;
    renderedOnlineStateRef.current = null;
    onlineLastRenderTsRef.current = null;
    setOnlineScore({ p1: 0, p2: 0 });
    onlineScoreRef.current = { p1: 0, p2: 0 };
    setOpponentLeft(false);
    setOnlineReason(null);
    setOnlineWinnerSlot(null);
    setMySlot(null);
    snapshotBufferRef.current = [];
    mySlotRef.current = null;
    setOpponentName('');
    setGameId(null);
    setGamePath(null);
    setIReady(false);
    setOpponentReady(false);
    setGamePaused(false);
    prevDirectionRef.current = 'stop';
    latestLocalInputSequenceRef.current = 0;
    lastProcessedInputSequenceRef.current = 0;
    setMmPath('/ws/matchmaking/');
  };

  const handleReady = () => {
    if (iReady) return;
    setIReady(true);
    gameSend({ type: 'ready' });
  };

  const handleCancelOnline = () => {
    snapshotBufferRef.current = [];
    renderedOnlineStateRef.current = null;
    onlineLastRenderTsRef.current = null;
    setMmPath(null);
    setGamePath(null);
    setOnlinePhase('idle');
    navigate('/games/playpage');
  };

  const handleForfeit = () => gameSend({ type: 'forfeit' });

  const playerWon = score.p1 >= WIN_SCORE;
  const iWon = onlineWinnerSlot !== null && onlineWinnerSlot === mySlot;
  const myDisplayScore = mode === 'online' ? (mySlot === 2 ? onlineScore.p2 : onlineScore.p1) : score.p1;
  const oppDisplayScore = mode === 'online' ? (mySlot === 2 ? onlineScore.p1 : onlineScore.p2) : score.p2;
  const p1DisplayLabel = mode === 'online'
    ? t('pong.you')
    : mode === 'local'
      ? (localPlayerNames.p1.trim() || t('pong.player1'))
      : t('pong.you');
  const p2Label = opponentName || t('pong.opponent');
  const aiDifficultyLabel = t(`play.diff_${difficulty}`);
  const modeLabel = mode === 'online'
    ? t('pong.mode_online')
    : mode === 'ai'
      ? t('pong.mode_ai', { difficulty: aiDifficultyLabel })
      : t('pong.mode_local');
  const p2DisplayLabel = mode === 'online'
    ? p2Label
    : mode === 'ai'
      ? t('pong.ai_bot')
      : (localPlayerNames.p2.trim() || t('pong.player2'));
  const onlinePhaseLabel = onlinePhase === 'matchmaking'
    ? t('pong.searching')
    : onlinePhase === 'waiting'
      ? t('pong.waiting_opponent')
      : onlinePhase === 'playing'
        ? t('pong.live')
        : onlinePhase === 'over'
          ? t('pong.phase_over')
          : t('pong.phase_idle');
  const hudStatusLabel = mode !== 'online'
    ? t('pong.live')
    : gameSocketStatus === 'reconnecting' || gameSocketStatus === 'connecting'
      ? t('pong.reconnecting')
      : gamePaused
        ? t('pong.paused')
        : onlinePhaseLabel;
  const showRealtimeRecoveryOverlay =
    mode === 'online'
    && onlinePhase === 'playing'
    && (gamePaused || gameSocketStatus === 'reconnecting' || gameSocketStatus === 'connecting');

  const yScale = FIELD_H / ONLINE_FIELD_HEIGHT;
  const currentBall = mode === 'online'
    ? onlineDisplayState?.ball
      ? { ...onlineDisplayState.ball, y: onlineDisplayState.ball.y * yScale }
      : { x: FIELD_W / 2, y: FIELD_H / 2 }
    : gameState.current.ball;
  const currentPaddles = mode === 'online'
    ? onlineDisplayState?.paddles
      ? { 1: { y: onlineDisplayState.paddles[1].y * yScale }, 2: { y: onlineDisplayState.paddles[2].y * yScale } }
      : { 1: { y: FIELD_H / 2 }, 2: { y: FIELD_H / 2 } }
    : { 1: gameState.current.p1, 2: gameState.current.p2 };

  return (
    <>
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="max-w-[54rem] w-full space-y-4">
        <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <Avatar name={p1DisplayLabel} size="sm" />
            <span className="text-sm font-medium hidden sm:block" style={{ color: '#3B82F6' }}>{p1DisplayLabel}</span>
            <span className="text-2xl font-bold font-mono" style={{ color: '#3B82F6' }}>{myDisplayScore}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1.5" style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: 'var(--color-success)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-success)' }} />
              {hudStatusLabel}
            </span>
            <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>3D {modeLabel}</span>
            {mode === 'online' && (
              <span className="text-[10px] font-medium flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                👁️ <span style={{ color: '#3B82F6' }}>{spectatorCount.side1}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>/</span>
                <span style={{ color: '#EF4444' }}>{spectatorCount.side2}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold font-mono" style={{ color: '#EF4444' }}>{oppDisplayScore}</span>
            <span className="text-sm font-medium hidden sm:block" style={{ color: '#EF4444' }}>{p2DisplayLabel}</span>
            <Avatar name={p2DisplayLabel} size="sm" />
          </div>
        </div>

        <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          <div style={{ width: '100%', aspectRatio: `${FIELD_W}/${FIELD_H}` }}>
            {(mode !== 'online' || onlinePhase === 'playing' || onlinePhase === 'waiting') && (
              <Renderer3D
                ball={currentBall}
                paddles={currentPaddles}
                fieldWidth={FIELD_W}
                fieldHeight={FIELD_H}
                flipped={mode === 'online' && mySlot === 2}
                paddleOffset={mode === 'online' ? ONLINE_PADDLE_OFFSET : undefined}
              />
            )}
          </div>

          {mode === 'local' && !localNamesReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6" style={{ backgroundColor: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(8px)' }}>
              <h2 className="text-2xl font-bold text-center" style={{ color: 'var(--color-text-primary)' }}>
                {t('pong.local_name_setup_title')}
              </h2>
              <div className="w-full max-w-sm space-y-3">
                <input
                  value={localPlayerNames.p1}
                  onChange={(e) => setLocalPlayerNames((prev) => ({ ...prev, p1: e.target.value }))}
                  placeholder={t('pong.local_player1_name')}
                  className="w-full rounded-lg px-4 py-2 text-sm outline-none"
                  style={{ backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                />
                <input
                  value={localPlayerNames.p2}
                  onChange={(e) => setLocalPlayerNames((prev) => ({ ...prev, p2: e.target.value }))}
                  placeholder={t('pong.local_player2_name')}
                  className="w-full rounded-lg px-4 py-2 text-sm outline-none"
                  style={{ backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                />
              </div>
              <button
                onClick={() => {
                  if (!localPlayerNames.p1.trim() || !localPlayerNames.p2.trim()) return;
                  setLocalNamesReady(true);
                  setGameStartTime(Date.now());
                }}
                disabled={!localPlayerNames.p1.trim() || !localPlayerNames.p2.trim()}
                className="px-8 py-3 rounded-lg font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)' }}
              >
                {t('pong.start_local_match')}
              </button>
            </div>
          )}

          {mode === 'online' && onlinePhase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ backgroundColor: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(8px)' }}>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>3D {t('pong.title')}</h2>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t('pong.subtitle')}</p>
              <button onClick={handleFindMatch} className="px-8 py-3 rounded-lg font-semibold text-white" style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)' }}>
                {t('pong.find_match')}
              </button>
            </div>
          )}

          {mode === 'online' && onlinePhase === 'matchmaking' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ backgroundColor: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(8px)' }}>
              <div className="w-12 h-12 rounded-full border-4 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>{t('pong.searching')}</p>
              <button onClick={handleCancelOnline} className="text-sm px-5 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>{t('pong.cancel')}</button>
            </div>
          )}

          {mode === 'online' && onlinePhase === 'waiting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ backgroundColor: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(8px)' }}>
              <p className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {t('pong.vs_opponent', { name: opponentName })}
              </p>
              <div className="flex gap-8 text-sm">
                <span style={{ color: iReady ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                  {iReady ? t('pong.you_ready') : t('pong.you_not_ready')}
                </span>
                <span style={{ color: opponentReady ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                  {opponentReady ? t('pong.opponent_ready', { name: opponentName }) : t('pong.opponent_not_ready', { name: opponentName })}
                </span>
              </div>
              {!iReady ? (
                <button onClick={handleReady} className="px-10 py-3 rounded-lg font-bold text-white text-lg" style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}>
                  {t('pong.ready')}
                </button>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 rounded-full border-4 animate-spin" style={{ borderColor: '#f97316', borderTopColor: 'transparent' }} />
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    {opponentReady ? t('pong.starting') : t('pong.waiting_opponent')}
                  </p>
                </div>
              )}
              <button onClick={handleCancelOnline} className="text-sm px-5 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>{t('pong.exit')}</button>
            </div>
          )}

          {mode === 'online' && opponentLeft && onlinePhase !== 'over' && (
            <div className="absolute top-4 inset-x-4 flex items-center justify-center">
              <div className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: 'var(--color-error)', border: '1px solid rgba(239,68,68,0.3)' }}>
                {t('pong.opponent_disconnected')}
              </div>
            </div>
          )}

          {showRealtimeRecoveryOverlay && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ backgroundColor: 'rgba(10,14,26,0.72)', backdropFilter: 'blur(6px)' }}>
              <div className="w-10 h-10 rounded-full border-4 animate-spin" style={{ borderColor: '#f97316', borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>{t('pong.reconnecting_players')}</p>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t('pong.reconnecting_resume')}</p>
            </div>
          )}

          {mode === 'local' && gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'rgba(10,14,26,0.85)', backdropFilter: 'blur(8px)' }}>
              <h2 className="text-5xl font-extrabold" style={{ color: playerWon ? '#3B82F6' : '#EF4444' }}>
                {playerWon ? t('pong.local_player_wins', { name: localPlayerNames.p1.trim() || t('pong.player1') }) : t('pong.local_player_wins', { name: localPlayerNames.p2.trim() || t('pong.player2') })}
              </h2>
              <p className="text-2xl font-mono font-bold" style={{ color: 'var(--color-text-primary)' }}>{score.p1} — {score.p2}</p>
              <div className="flex gap-3 mt-2">
                <button onClick={resetGame} className="px-6 py-2 rounded-lg font-medium text-white" style={{ background: 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)' }}>{t('pong.play_again')}</button>
                <button onClick={() => navigate('/games/playpage')} className="px-6 py-2 rounded-lg font-medium" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>{t('pong.back_to_games')}</button>
              </div>
            </div>
          )}

          {mode === 'ai' && gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'rgba(10,14,26,0.85)', backdropFilter: 'blur(8px)' }}>
              <h2 className="text-5xl font-extrabold" style={{ color: playerWon ? '#3B82F6' : '#EF4444' }}>
                {playerWon ? t('pong.you_win') : t('pong.ai_wins')}
              </h2>
              <p className="text-2xl font-mono font-bold" style={{ color: 'var(--color-text-primary)' }}>{score.p1} — {score.p2}</p>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t('pong.difficulty', { level: difficulty.charAt(0).toUpperCase() + difficulty.slice(1) })}</p>
              <div className="flex gap-3 mt-2">
                <button onClick={resetGame} className="px-6 py-2 rounded-lg font-medium text-white" style={{ background: 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)' }}>{t('pong.play_again')}</button>
                <button onClick={() => navigate('/games/playpage')} className="px-6 py-2 rounded-lg font-medium" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>{t('pong.back_to_games')}</button>
              </div>
            </div>
          )}

          {mode === 'online' && onlinePhase === 'over' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'rgba(10,14,26,0.85)', backdropFilter: 'blur(8px)' }}>
              <h2 className="text-5xl font-extrabold" style={{ color: iWon ? '#3B82F6' : '#EF4444' }}>
                {iWon ? t('pong.you_win') : t('pong.you_lose')}
              </h2>
              <p className="text-2xl font-mono font-bold" style={{ color: 'var(--color-text-primary)' }}>{myDisplayScore} — {oppDisplayScore}</p>
              {(onlineReason === 'disconnect_forfeit' || opponentLeft) && (
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t('pong.opponent_disconnected')}</p>
              )}
              {onlineReason === 'forfeit' && (
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t('pong.opponent_forfeited')}</p>
              )}
              <div className="flex gap-3 mt-2">
                <button onClick={handleFindMatch} className="px-6 py-2 rounded-lg font-medium text-white" style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)' }}>{t('pong.play_again')}</button>
                <button onClick={() => navigate('/games/playpage')} className="px-6 py-2 rounded-lg font-medium" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>{t('pong.back_to_games')}</button>
              </div>
            </div>
          )}

          <FloatingEmoteOverlay emotes={floatingEmotes} flipped={mode === 'online' && mySlot === 2} />

          {mode === 'online' && showEmotePalette && (
            <div className="absolute bottom-0 left-0 right-0 z-50 px-4 pb-4">
              <EmotePalette
                onEmote={(emote) => {
                  gameSend({ type: 'emote', emote_id: emote.id });
                  setShowEmotePalette(false);
                }}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-xl px-4 py-2.5" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {mode === 'local' ? (
              <>
                <span><span className="font-bold" style={{ color: '#3B82F6' }}>{localPlayerNames.p1.trim() || t('pong.player1_short')}</span> {t('pong.controls_p1')}</span>
                <span className="opacity-30">|</span>
                <span><span className="font-bold" style={{ color: '#EF4444' }}>{localPlayerNames.p2.trim() || t('pong.player2_short')}</span> {t('pong.controls_p2')}</span>
              </>
            ) : (
              <span>{t('pong.controls_shared')}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {mode !== 'online' && (
              <>
                <button onClick={() => setLocalPaused((p) => !p)}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
                  {localPaused ? 'Resume' : 'Pause'}
                </button>
                <button onClick={() => navigate('/games/playpage')}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  Exit
                </button>
              </>
            )}
            {mode === 'online' && onlinePhase === 'playing' && (
              <>
                <button
                  onClick={handleShare}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
                  style={{
                    backgroundColor: copied ? 'rgba(34,197,94,0.15)' : 'var(--color-bg-input)',
                    color: copied ? 'var(--color-success)' : 'var(--color-text-secondary)',
                    border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'var(--color-border)'}`,
                  }}
                  title="Share spectate link"
                >
                  {copied ? '✓ Copied!' : '🔗 Share'}
                </button>
                <button
                  onClick={() => setShowEmotePalette(!showEmotePalette)}
                  className="px-3 py-1.5 rounded-lg text-lg transition-all duration-200"
                  style={{
                    backgroundColor: showEmotePalette ? 'var(--color-primary)' : 'var(--color-bg-input)',
                    border: '1px solid var(--color-border)',
                  }}
                  title="Emotes"
                >
                  😂
                </button>
                <button onClick={handleForfeit} className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200" style={{ backgroundColor: 'var(--color-bg-input)', color: 'var(--color-error)', border: '1px solid rgba(239,68,68,0.3)' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'}
                >
                  {t('pong.forfeit')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
      <FloatingChatWidget />
    </>
  );
}
