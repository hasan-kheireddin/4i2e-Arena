import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../components/ui/Avatar';
import { useGameSocket } from '../hooks/useGameSocket';
import { createLocalMatch } from '../services/games';

interface PaddleState { y: number }
interface BallState { x: number; y: number; vx: number; vy: number }

type Mode = 'local' | 'online' | 'ai';
type Difficulty = 'easy' | 'medium' | 'hard';
type OnlinePhase = 'idle' | 'matchmaking' | 'waiting' | 'playing' | 'over';

interface OnlineGameState {
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: { [slot: number]: { y: number } };
}

const WIN_SCORE = 7;
const PADDLE_SPEED = 6;
// AI difficulty - higher = faster/harder
const AI_SPEED: Record<Difficulty, number> = { easy: 0.06, medium: 0.10, hard: 0.18 };
// Ball speed multipliers based on difficulty
const BALL_SPEED: Record<Difficulty, number> = { easy: 0.7, medium: 1.0, hard: 1.4 };
// Base ball speeds (medium difficulty / local / online)
const BASE_BALL_VX = 4;
const BASE_BALL_VY = 3;

// ── canvas draw helper ──────────────────────────────────────────────────────
function drawFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  p1Y: number,
  p2Y: number,
  ball: { x: number; y: number; vx: number; vy: number },
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0a0e1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // centre dashed line
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = 'rgba(148,163,184,0.1)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);

  const paddleW = 12, paddleH = 80, radius = 6;

  // player paddle — blue gradient
  const p1Grad = ctx.createLinearGradient(10, p1Y - paddleH / 2, 10 + paddleW, p1Y + paddleH / 2);
  p1Grad.addColorStop(0, '#1D4ED8');
  p1Grad.addColorStop(1, '#3B82F6');
  ctx.fillStyle = p1Grad;
  roundRect(ctx, 10, p1Y - paddleH / 2, paddleW, paddleH, radius);
  ctx.shadowColor = 'rgba(59,130,246,0.6)';
  ctx.shadowBlur = 15;
  ctx.fill();
  ctx.shadowBlur = 0;

  // opponent paddle — red gradient
  const p2Grad = ctx.createLinearGradient(canvas.width - 22, p2Y - paddleH / 2, canvas.width - 10, p2Y + paddleH / 2);
  p2Grad.addColorStop(0, '#DC2626');
  p2Grad.addColorStop(1, '#EF4444');
  ctx.fillStyle = p2Grad;
  roundRect(ctx, canvas.width - 22, p2Y - paddleH / 2, paddleW, paddleH, radius);
  ctx.shadowColor = 'rgba(239,68,68,0.6)';
  ctx.shadowBlur = 15;
  ctx.fill();
  ctx.shadowBlur = 0;

  // ball with trail
  for (let i = 3; i >= 0; i--) {
    const alpha = i === 0 ? 1 : 0.15 * (3 - i);
    const trailX = ball.x - ball.vx * i * 2;
    const trailY = ball.y - ball.vy * i * 2;
    ctx.beginPath();
    ctx.arc(trailX, trailY, 8 - i, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(248,250,252,${alpha})`;
    if (i === 0) { ctx.shadowColor = 'rgba(248,250,252,0.5)'; ctx.shadowBlur = 12; }
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

export default function PongPage() {
  const { t } = useTranslation();
  // Read mode and difficulty from URL params (set by PlayPage)
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawMode = searchParams.get('mode') ?? 'local';
  const mode: Mode = rawMode === 'online' ? 'online' : rawMode === 'ai' ? 'ai' : 'local';
  // Difficulty is locked at start — read once from URL, never changes
  const rawDiff = searchParams.get('difficulty') ?? 'medium';
  const difficulty: Difficulty = (['easy','medium','hard'] as Difficulty[]).includes(rawDiff as Difficulty)
    ? rawDiff as Difficulty : 'medium';

  // Helper: Get ball speed based on mode and difficulty
  const getBallSpeed = (vx: number, vy: number) => {
    // AI mode uses difficulty-based speed, local/online use normal (medium) speed
    const multiplier = mode === 'ai' ? BALL_SPEED[difficulty] : 1.0;
    return { vx: vx * multiplier, vy: vy * multiplier };
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState({ p1: 0, p2: 0 });
  const [gameOver, setGameOver] = useState(false);
  const [gameStartTime, setGameStartTime] = useState<number | null>(null);
  const [localPlayerNames, setLocalPlayerNames] = useState({ p1: '', p2: '' });
  const [localNamesReady, setLocalNamesReady] = useState(mode !== 'local');

  const initialBall = getBallSpeed(BASE_BALL_VX, BASE_BALL_VY);
  const gameState = useRef({
    p1: { y: 250 } as PaddleState,
    p2: { y: 250 } as PaddleState,
    ball: { x: 400, y: 250, vx: initialBall.vx, vy: initialBall.vy } as BallState,
  });

  const keysRef = useRef<Record<string, boolean>>({});

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

  // ── online state ──────────────────────────────────────────────────────────
  const [onlinePhase, setOnlinePhase] = useState<OnlinePhase>('idle');
  const [gameId, setGameId] = useState<string | null>(null);
  const [mySlot, setMySlot] = useState<number | null>(null);
  const [onlineScore, setOnlineScore] = useState({ p1: 0, p2: 0 });
  const [onlineGameState, setOnlineGameState] = useState<OnlineGameState | null>(null);
  const [opponentName, setOpponentName] = useState('Opponent');
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [onlineReason, setOnlineReason] = useState<string | null>(null);
  const [onlineWinnerSlot, setOnlineWinnerSlot] = useState<number | null>(null);
  const [iReady, setIReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const mySlotRef = useRef<number | null>(null);

  const [mmPath, setMmPath] = useState<string | null>(null);
  const [gamePath, setGamePath] = useState<string | null>(null);

  // Tracks last sent direction to avoid spamming identical messages
  const prevDirectionRef = useRef<'up' | 'down' | 'stop'>('stop');

  // ── local game loop ───────────────────────────────────────────────────────
  const animate = useCallback(() => {
    if (mode === 'online') return;
    if (mode === 'local' && !localNamesReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const gs = gameState.current;
    const keys = keysRef.current;

    if (!gameOver) {
      // Player 1 (left / blue): W / S or Arrow keys in AI mode
      if (keys['w'] || keys['W'] || (mode === 'ai' && keys['ArrowUp'])) gs.p1.y = Math.max(40, gs.p1.y - PADDLE_SPEED);
      if (keys['s'] || keys['S'] || (mode === 'ai' && keys['ArrowDown'])) gs.p1.y = Math.min(canvas.height - 40, gs.p1.y + PADDLE_SPEED);

      if (mode === 'ai') {
        // AI controls right paddle — speed locked by difficulty
        gs.p2.y += (gs.ball.y - gs.p2.y) * AI_SPEED[difficulty];
      } else {
        // Local 2P: Player 2 uses Arrow keys
        if (keys['ArrowUp'])   gs.p2.y = Math.max(40, gs.p2.y - PADDLE_SPEED);
        if (keys['ArrowDown']) gs.p2.y = Math.min(canvas.height - 40, gs.p2.y + PADDLE_SPEED);
      }

      gs.ball.x += gs.ball.vx;
      gs.ball.y += gs.ball.vy;

      if (gs.ball.y <= 8 || gs.ball.y >= canvas.height - 8) gs.ball.vy *= -1;

      if (gs.ball.x <= 22 && gs.ball.x >= 10 && gs.ball.y >= gs.p1.y - 40 && gs.ball.y <= gs.p1.y + 40) {
        gs.ball.vx = Math.abs(gs.ball.vx) * 1.02;
        gs.ball.vy += (gs.ball.y - gs.p1.y) * 0.04;
      }
      if (gs.ball.x >= canvas.width - 22 && gs.ball.x <= canvas.width - 10 && gs.ball.y >= gs.p2.y - 40 && gs.ball.y <= gs.p2.y + 40) {
        gs.ball.vx = -Math.abs(gs.ball.vx) * 1.02;
        gs.ball.vy += (gs.ball.y - gs.p2.y) * 0.04;
      }

      if (gs.ball.x < 0) {
        setScore((prev) => { const next = { ...prev, p2: prev.p2 + 1 }; if (next.p2 >= WIN_SCORE) setGameOver(true); return next; });
        const resetSpeed = getBallSpeed(-BASE_BALL_VX, BASE_BALL_VY);
        gs.ball = { x: canvas.width / 2, y: canvas.height / 2, vx: resetSpeed.vx, vy: resetSpeed.vy };
      }
      if (gs.ball.x > canvas.width) {
        setScore((prev) => { const next = { ...prev, p1: prev.p1 + 1 }; if (next.p1 >= WIN_SCORE) setGameOver(true); return next; });
        const resetSpeed = getBallSpeed(BASE_BALL_VX, -BASE_BALL_VY);
        gs.ball = { x: canvas.width / 2, y: canvas.height / 2, vx: resetSpeed.vx, vy: resetSpeed.vy };
      }
    }

    drawFrame(ctx, canvas, gs.p1.y, gs.p2.y, gs.ball);
    
    // Only continue loop if game is not over
    if (!gameOver) {
      requestAnimationFrame(animate);
    }
  }, [mode, gameOver, difficulty, localNamesReady]);

  useEffect(() => {
    // Don't start loop if game is over or in online mode
    if (mode === 'online' || gameOver || (mode === 'local' && !localNamesReady)) return;
    // Set start time on first frame for local/AI modes
    if (!gameStartTime && (mode === 'ai' || (mode === 'local' && localNamesReady))) {
      setGameStartTime(Date.now());
    }
    const id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, [mode, animate, gameOver, gameStartTime, localNamesReady]);

  // ── Save match history when game ends (local/AI modes) ──
  useEffect(() => {
    if (!gameOver || mode === 'online' || !gameStartTime) return;
    
    const saveMatch = async () => {
      const durationSeconds = Math.round((Date.now() - gameStartTime) / 1000);
      const winner = score.p1 >= WIN_SCORE ? 'X' : 'O';
      
      try {
        await createLocalMatch({
          game_type: 'pong',
          game_mode: mode === 'ai' ? 'pve' : 'pvp',
          winner: winner,
          duration_seconds: durationSeconds,
          player1_score: score.p1,
          player2_score: score.p2,
          ai_difficulty: mode === 'ai' ? difficulty : undefined,
          metadata: {
            mode,
            final_score: score,
            local_players: mode === 'local'
              ? {
                  player1_name: localPlayerNames.p1.trim(),
                  player2_name: localPlayerNames.p2.trim(),
                }
              : undefined,
          },
        });
      } catch (error) {
        console.error('Failed to save Pong match:', error);
      }
    };
    
    saveMatch();
  }, [gameOver, mode, gameStartTime, score, difficulty, localPlayerNames]);

  // ── online game state → canvas ────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'online' || !onlineGameState) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { ball, paddles } = onlineGameState;
    // Backend field is 800×600, canvas is 800×500 — scale Y coordinates
    const scaleY = canvas.height / 600;
    // Mirror the view for slot 2 so "you" are always on the left (blue paddle)
    const flipped = mySlot === 2;
    const leftY  = flipped ? (paddles[2]?.y ?? 300) * scaleY : (paddles[1]?.y ?? 300) * scaleY;
    const rightY = flipped ? (paddles[1]?.y ?? 300) * scaleY : (paddles[2]?.y ?? 300) * scaleY;
    const displayBall = flipped
      ? { ...ball, x: canvas.width - ball.x, vx: -ball.vx, y: ball.y * scaleY }
      : { ...ball, y: ball.y * scaleY };
    drawFrame(ctx, canvas, leftY, rightY, displayBall);
  }, [mode, onlineGameState, mySlot]);

  // ── online keyboard input → direction-based messages ─────────────────────
  const gameSendRef = useRef<(data: Record<string, unknown>) => void>(() => {});

  useEffect(() => {
    if (mode !== 'online' || onlinePhase !== 'playing') return;
    const interval = setInterval(() => {
      const keys = keysRef.current;
      let dir: 'up' | 'down' | 'stop' = 'stop';
      if (keys['w'] || keys['W'] || keys['ArrowUp']) dir = 'up';
      else if (keys['s'] || keys['S'] || keys['ArrowDown']) dir = 'down';

      // Only send when direction changes to avoid flooding the server
      if (dir !== prevDirectionRef.current) {
        prevDirectionRef.current = dir;
        gameSendRef.current({ type: 'input', direction: dir });
      }
    }, 16); // ~60fps polling
    return () => {
      clearInterval(interval);
      // Send stop when effect cleans up (phase change / unmount)
      if (prevDirectionRef.current !== 'stop') {
        gameSendRef.current({ type: 'input', direction: 'stop' });
        prevDirectionRef.current = 'stop';
      }
    };
  }, [mode, onlinePhase]);

  // ── matchmaking socket ────────────────────────────────────────────────────
  const { send: mmSend } = useGameSocket(mmPath, {
    onOpen: useCallback(() => {
      mmSend({ type: 'find_match', game_type: 'pong' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
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

  // ── game socket ───────────────────────────────────────────────────────────
  const { send: gameSend } = useGameSocket(gamePath, {
    onOpen: useCallback(() => {
      if (gameId) gameSend({ type: 'join', game_id: gameId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameId]),
    onMessage: useCallback((data: Record<string, unknown>) => {
      const type = data.type as string;

      if (type === 'game_joined') {
        const slot = data.slot as number;
        setMySlot(slot);
        mySlotRef.current = slot;
        const info = data.game_info as Record<string, unknown> | undefined;
        if (info) {
          const players = info.players as Record<string, { username: string }> | undefined;
          if (players) {
            const oppSlot = slot === 1 ? '2' : '1';
            if (players[oppSlot]) setOpponentName(players[oppSlot].username);
          }
        }
      } else if (type === 'game_start') {
        setOnlinePhase('playing');
      } else if (type === 'game_state') {
        const ball = data.ball as { x: number; y: number; vx: number; vy: number };
        const p1 = data.player1 as { score: number; paddle: { y: number } } | undefined;
        const p2 = data.player2 as { score: number; paddle: { y: number } } | undefined;
        if (p1 && p2) {
          setOnlineGameState({ ball, paddles: { 1: { y: p1.paddle.y }, 2: { y: p2.paddle.y } } });
          setOnlineScore({ p1: p1.score, p2: p2.score });
        }
        // Transition from waiting → playing on first state frame
        setOnlinePhase((prev) => prev === 'waiting' ? 'playing' : prev);
      } else if (type === 'game_over') {
        const winner = data.winner as number | null;
        const reason = data.reason as string;
        const fs = data.final_state as { player1?: { score: number }; player2?: { score: number } } | undefined;
        setOnlineReason(reason);
        setOnlineWinnerSlot(winner ?? null);
        if (fs?.player1 && fs?.player2) {
          setOnlineScore({ p1: fs.player1.score, p2: fs.player2.score });
        }
        setOnlinePhase('over');
      } else if (type === 'both_connected') {
        // Both players joined the lobby — ready to accept Ready clicks
      } else if (type === 'player_ready') {
        const slot = data.slot as number;
        if (slot === mySlotRef.current) {
          setIReady(true);
        } else {
          setOpponentReady(true);
        }
      } else if (type === 'player_left') {
        setOpponentLeft(true);
      }
    }, []),
    onClose: useCallback(() => {
      if (onlinePhase === 'playing') setOnlinePhase('over');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onlinePhase]),
  });

  useEffect(() => { gameSendRef.current = gameSend; }, [gameSend]);

  // ── local reset ───────────────────────────────────────────────────────────
  const resetGame = () => {
    setScore({ p1: 0, p2: 0 });
    setGameOver(false);
    setGameStartTime(null); // Reset timer for new game
    if (mode === 'local') {
      setLocalPlayerNames({ p1: '', p2: '' });
      setLocalNamesReady(false);
    }
    const gs = gameState.current;
    gs.p1.y = 250; gs.p2.y = 250;
    const resetSpeed = getBallSpeed(BASE_BALL_VX, BASE_BALL_VY);
    gs.ball = { x: 400, y: 250, vx: resetSpeed.vx, vy: resetSpeed.vy };
  };

  // ── online helpers ────────────────────────────────────────────────────────
  const handleFindMatch = () => {
    setOnlinePhase('matchmaking');
    setOnlineGameState(null);
    setOnlineScore({ p1: 0, p2: 0 });
    setOpponentLeft(false);
    setOnlineReason(null);
    setOnlineWinnerSlot(null);
    setMySlot(null);
    mySlotRef.current = null;
    setOpponentName('Opponent');
    setGameId(null);
    setGamePath(null);
    setIReady(false);
    setOpponentReady(false);
    prevDirectionRef.current = 'stop';
    setMmPath('/ws/matchmaking/');
  };

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

  const handleForfeit = () => gameSend({ type: 'forfeit' });

  const playerWon = score.p1 >= WIN_SCORE;
  const iWon = onlineWinnerSlot !== null && onlineWinnerSlot === mySlot;
  // For slot 2 players, swap so "my score" is always on the left
  const myDisplayScore  = mode === 'online' ? (mySlot === 2 ? onlineScore.p2 : onlineScore.p1) : score.p1;
  const oppDisplayScore = mode === 'online' ? (mySlot === 2 ? onlineScore.p1 : onlineScore.p2) : score.p2;
  const p1DisplayLabel = mode === 'online'
    ? t('pong.you')
    : mode === 'local'
      ? (localPlayerNames.p1.trim() || t('pong.player1'))
      : t('pong.you');
  const p2Label = mode === 'online' ? opponentName : 'Opponent';

  // Mode label for HUD badge
  const modeLabel = mode === 'online' ? t('pong.mode_online') : mode === 'ai' ? t('pong.mode_ai', { difficulty }) : t('pong.mode_local');
  const p2DisplayLabel = mode === 'online'
    ? p2Label
    : mode === 'ai'
      ? t('pong.ai_bot')
      : (localPlayerNames.p2.trim() || t('pong.player2'));

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="max-w-5xl w-full space-y-4">

        {/* HUD */}
        <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <Avatar name={p1DisplayLabel} size="sm" />
            <span className="text-sm font-medium hidden sm:block" style={{ color: '#3B82F6' }}>{p1DisplayLabel}</span>
            <span className="text-2xl font-bold font-mono" style={{ color: '#3B82F6' }}>{myDisplayScore}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1.5" style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: 'var(--color-success)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-success)' }} />
              {mode !== 'online' ? t('pong.live') : onlinePhase === 'playing' ? t('pong.live') : onlinePhase}
            </span>
            <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>{modeLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold font-mono" style={{ color: '#EF4444' }}>{oppDisplayScore}</span>
            <span className="text-sm font-medium hidden sm:block" style={{ color: '#EF4444' }}>{p2DisplayLabel}</span>
            <Avatar name={p2DisplayLabel} size="sm" />
          </div>
        </div>

        {/* Arena */}
        <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          <canvas ref={canvasRef} width={800} height={387} className="w-full" style={{ backgroundColor: '#0a0e1a', aspectRatio: '800/387' }} />

          {/* Local — name setup */}
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

          {/* Online — idle */}
          {mode === 'online' && onlinePhase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ backgroundColor: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(8px)' }}>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{t('pong.title')}</h2>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t('pong.subtitle')}</p>
              <button onClick={handleFindMatch} className="px-8 py-3 rounded-lg font-semibold text-white" style={{ background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)' }}>
                {t('pong.find_match')}
              </button>
            </div>
          )}

          {/* Online — matchmaking */}
          {mode === 'online' && onlinePhase === 'matchmaking' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ backgroundColor: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(8px)' }}>
              <div className="w-12 h-12 rounded-full border-4 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>{t('pong.searching')}</p>
              <button onClick={handleCancelOnline} className="text-sm px-5 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>{t('pong.cancel')}</button>
            </div>
          )}

          {/* Online — ready lobby */}
          {mode === 'online' && onlinePhase === 'waiting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ backgroundColor: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(8px)' }}>
              <p className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>vs {opponentName}</p>

              {/* Ready status indicators */}
              <div className="flex gap-8 text-sm">
                <span style={{ color: iReady ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                  {iReady ? t('pong.you_ready') : t('pong.you_not_ready')}
                </span>
                <span style={{ color: opponentReady ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                  {opponentReady ? t('pong.opponent_ready', { name: opponentName }) : t('pong.opponent_not_ready', { name: opponentName })}
                </span>
              </div>

              {!iReady ? (
                <button
                  onClick={handleReady}
                  className="px-10 py-3 rounded-lg font-bold text-white text-lg"
                  style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}
                >
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

          {/* Online — opponent left banner */}
          {mode === 'online' && opponentLeft && onlinePhase !== 'over' && (
            <div className="absolute top-4 inset-x-4 flex items-center justify-center">
              <div className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: 'var(--color-error)', border: '1px solid rgba(239,68,68,0.3)' }}>
                {t('pong.opponent_disconnected')}
              </div>
            </div>
          )}

          {/* Local — game over */}
          {mode === 'local' && gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'rgba(10,14,26,0.85)', backdropFilter: 'blur(8px)' }}>
              <h2 className="text-5xl font-extrabold" style={{ color: playerWon ? '#3B82F6' : '#EF4444' }}>
                {playerWon
                  ? t('pong.local_player_wins', { name: localPlayerNames.p1.trim() || t('pong.player1') })
                  : t('pong.local_player_wins', { name: localPlayerNames.p2.trim() || t('pong.player2') })}
              </h2>
              <p className="text-2xl font-mono font-bold" style={{ color: 'var(--color-text-primary)' }}>{score.p1} — {score.p2}</p>
              <div className="flex gap-3 mt-2">
                <button onClick={resetGame} className="px-6 py-2 rounded-lg font-medium text-white" style={{ background: 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)' }}>{t('pong.play_again')}</button>
                <button onClick={() => navigate('/games/playpage')} className="px-6 py-2 rounded-lg font-medium" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>{t('pong.back_to_games')}</button>
              </div>
            </div>
          )}

          {/* AI — game over */}
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

          {/* Online — game over */}
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
        </div>

        {/* Controls Bar */}
        <div className="flex items-center justify-between rounded-xl px-4 py-2.5" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {mode === 'local' ? (
              <>
                <span><span className="font-bold" style={{ color: '#3B82F6' }}>{localPlayerNames.p1.trim() || 'P1'}</span> W / S</span>
                <span className="opacity-30">|</span>
                <span><span className="font-bold" style={{ color: '#EF4444' }}>{localPlayerNames.p2.trim() || 'P2'}</span> ↑ / ↓</span>
              </>
            ) : (
              <span>W / S &nbsp;or&nbsp; ↑ / ↓</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {mode === 'online' && onlinePhase === 'playing' && (
              <button
                onClick={handleForfeit}
                className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
                style={{ backgroundColor: 'var(--color-bg-input)', color: 'var(--color-error)', border: '1px solid rgba(239,68,68,0.3)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'}
              >
                {t('pong.forfeit')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
