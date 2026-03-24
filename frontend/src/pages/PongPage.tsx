import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../lib/utils';
import { useGameSocket } from '../hooks/useGameSocket';

interface PaddleState { y: number }
interface BallState { x: number; y: number; vx: number; vy: number }

type Mode = 'local' | 'online';
type OnlinePhase = 'idle' | 'matchmaking' | 'waiting' | 'playing' | 'over';

interface OnlineGameState {
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: { [slot: number]: { y: number } };
  score?: { [slot: number]: number };
}

// ── canvas draw helper (shared between local and online) ────────────────────
function drawFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  p1Y: number,
  p2Y: number,
  ball: { x: number; y: number; vx: number; vy: number },
  is3D: boolean,
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0a0e1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = 'rgba(148,163,184,0.1)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);

  if (is3D) {
    ctx.save();
    ctx.transform(1, 0, 0, 0.85, 0, canvas.height * 0.08);
  }

  const paddleW = 12, paddleH = 80, radius = 6;

  const p1Grad = ctx.createLinearGradient(10, p1Y - paddleH/2, 10 + paddleW, p1Y + paddleH/2);
  p1Grad.addColorStop(0, '#7C3AED'); p1Grad.addColorStop(1, '#A855F7');
  ctx.fillStyle = p1Grad;
  roundRect(ctx, 10, p1Y - paddleH/2, paddleW, paddleH, radius);
  ctx.shadowColor = 'rgba(124,58,237,0.5)'; ctx.shadowBlur = 15; ctx.fill(); ctx.shadowBlur = 0;

  const p2Grad = ctx.createLinearGradient(canvas.width - 22, p2Y - paddleH/2, canvas.width - 10, p2Y + paddleH/2);
  p2Grad.addColorStop(0, '#EC4899'); p2Grad.addColorStop(1, '#F472B6');
  ctx.fillStyle = p2Grad;
  roundRect(ctx, canvas.width - 22, p2Y - paddleH/2, paddleW, paddleH, radius);
  ctx.shadowColor = 'rgba(236,72,153,0.5)'; ctx.shadowBlur = 15; ctx.fill(); ctx.shadowBlur = 0;

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

  if (is3D) ctx.restore();
}

export default function PongPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState({ p1: 0, p2: 0 });
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [time, setTime] = useState(0);

  const gameState = useRef({
    p1: { y: 200 } as PaddleState,
    p2: { y: 200 } as PaddleState,
    ball: { x: 400, y: 250, vx: 4, vy: 3 } as BallState,
    mouseY: 250,
  });

  // ── online state ──────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>('local');
  const [onlinePhase, setOnlinePhase] = useState<OnlinePhase>('idle');
  const [gameId, setGameId] = useState<string | null>(null);
  const [mySlot, setMySlot] = useState<number | null>(null);
  const [onlineScore, setOnlineScore] = useState({ p1: 0, p2: 0 });
  const [onlineGameState, setOnlineGameState] = useState<OnlineGameState | null>(null);
  const [opponentName, setOpponentName] = useState('Opponent');
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [onlineReason, setOnlineReason] = useState<string | null>(null);
  const [onlineWinnerSlot, setOnlineWinnerSlot] = useState<number | null>(null);

  const [mmPath, setMmPath] = useState<string | null>(null);
  const [gamePath, setGamePath] = useState<string | null>(null);
  const lastPaddleSendRef = useRef(0);

  // ── local timer ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'local' || paused || gameOver) return;
    const interval = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [mode, paused, gameOver]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  };

  // ── local game loop ───────────────────────────────────────────────────────
  const animate = useCallback(() => {
    if (mode !== 'local') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const gs = gameState.current;

    if (!paused && !gameOver) {
      gs.p1.y += (gs.mouseY - gs.p1.y) * 0.15;
      gs.p2.y += (gs.ball.y - gs.p2.y) * 0.06;
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
        setScore((prev) => { const next = { ...prev, p2: prev.p2 + 1 }; if (next.p2 >= 5) setGameOver(true); return next; });
        gs.ball = { x: canvas.width / 2, y: canvas.height / 2, vx: -4, vy: 3 };
      }
      if (gs.ball.x > canvas.width) {
        setScore((prev) => { const next = { ...prev, p1: prev.p1 + 1 }; if (next.p1 >= 5) setGameOver(true); return next; });
        gs.ball = { x: canvas.width / 2, y: canvas.height / 2, vx: 4, vy: -3 };
      }
    }

    drawFrame(ctx, canvas, gs.p1.y, gs.p2.y, gs.ball, is3D);
    requestAnimationFrame(animate);
  }, [mode, paused, gameOver, is3D]);

  useEffect(() => {
    if (mode !== 'local') return;
    const id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, [mode, animate]);

  // ── online game state → canvas ────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'online' || !onlineGameState) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { ball, paddles } = onlineGameState;
    drawFrame(ctx, canvas, paddles[1]?.y ?? 250, paddles[2]?.y ?? 250, ball, is3D);
  }, [mode, onlineGameState, is3D]);

  // ── mouse handler ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
      gameState.current.mouseY = y;
    };
    canvas.addEventListener('mousemove', handler);
    return () => canvas.removeEventListener('mousemove', handler);
  }, []);

  // ── online paddle send ────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'online' || onlinePhase !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastPaddleSendRef.current < 33) return; // ~30fps
      lastPaddleSendRef.current = now;
      const rect = canvas.getBoundingClientRect();
      const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
      gameSend({ type: 'paddle_move', y: Math.round(y) });
    };
    canvas.addEventListener('mousemove', handler);
    return () => canvas.removeEventListener('mousemove', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const state = data.state as OnlineGameState | undefined;
        if (state) {
          setOnlineGameState(state);
          if (state.score) {
            setOnlineScore({ p1: state.score[1] ?? 0, p2: state.score[2] ?? 0 });
          }
        }
      } else if (type === 'game_over') {
        const winner = data.winner as string | null; // e.g. "slot_1" or "1"
        const reason = data.reason as string;
        setOnlineReason(reason);
        if (winner) {
          const slot = parseInt(String(winner).replace(/\D/g, ''), 10);
          setOnlineWinnerSlot(isNaN(slot) ? null : slot);
        } else {
          setOnlineWinnerSlot(null);
        }
        setOnlinePhase('over');
      } else if (type === 'player_left') {
        setOpponentLeft(true);
      }
    }, []),
    onClose: useCallback(() => {
      if (onlinePhase === 'playing') setOnlinePhase('over');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onlinePhase]),
  });

  // ── local reset ───────────────────────────────────────────────────────────
  const resetGame = () => {
    setScore({ p1: 0, p2: 0 });
    setGameOver(false);
    setPaused(false);
    setTime(0);
    const gs = gameState.current;
    gs.p1.y = 250; gs.p2.y = 250;
    gs.ball = { x: 400, y: 250, vx: 4, vy: 3 };
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
    setOpponentName('Opponent');
    setGameId(null);
    setGamePath(null);
    setMmPath('/ws/matchmaking/');
  };

  const handleCancelOnline = () => {
    setMmPath(null);
    setGamePath(null);
    setOnlinePhase('idle');
  };

  const handleForfeit = () => gameSend({ type: 'forfeit' });

  const handleModeSwitch = (m: Mode) => {
    if (m === mode) return;
    setMmPath(null);
    setGamePath(null);
    setOnlinePhase('idle');
    setMode(m);
    if (m === 'local') resetGame();
  };

  const playerWon = score.p1 >= 5;
  const iWon = onlineWinnerSlot !== null && onlineWinnerSlot === mySlot;
  const isDraw = onlineWinnerSlot === null && onlinePhase === 'over' && !opponentLeft;

  const displayScore = mode === 'online' ? onlineScore : score;
  const p2Label = mode === 'online' ? opponentName : 'AI Bot';

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="max-w-5xl w-full space-y-4">

        {/* Mode selector */}
        <div className="flex justify-center">
          <div className="flex rounded-full p-1 gap-1" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            {(['local', 'online'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => handleModeSwitch(m)}
                className="px-5 py-1.5 rounded-full text-sm font-medium capitalize transition-all duration-150"
                style={{
                  backgroundColor: mode === m ? 'rgba(168,85,247,0.2)' : 'transparent',
                  color: mode === m ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                }}
              >
                {m === 'local' ? '🖥 Local (vs AI)' : '🌐 Online (PvP)'}
              </button>
            ))}
          </div>
        </div>

        {/* HUD */}
        <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <Avatar name="You" size="sm" />
            <span className="text-sm font-medium hidden sm:block" style={{ color: 'var(--color-text-primary)' }}>You</span>
            <span className="text-2xl font-bold font-mono" style={{ color: 'var(--color-primary)' }}>{displayScore.p1}</span>
          </div>
          <div className="flex items-center gap-3" style={{ color: 'var(--color-text-secondary)' }}>
            {mode === 'local' && <span className="text-sm font-mono">{formatTime(time)}</span>}
            <span className="px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1.5" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: 'var(--color-success)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-success)' }} />
              {mode === 'local' ? 'Live' : onlinePhase === 'playing' ? 'Live' : onlinePhase}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold font-mono" style={{ color: '#ec4899' }}>{displayScore.p2}</span>
            <span className="text-sm font-medium hidden sm:block" style={{ color: 'var(--color-text-primary)' }}>{p2Label}</span>
            <Avatar name={p2Label} size="sm" />
          </div>
        </div>

        {/* Arena */}
        <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          <canvas ref={canvasRef} width={800} height={500} className="w-full aspect-[16/10] cursor-none" style={{ backgroundColor: '#0a0e1a' }} />

          {/* Online overlays */}
          {mode === 'online' && onlinePhase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ backgroundColor: 'rgba(10, 14, 26, 0.9)', backdropFilter: 'blur(8px)' }}>
              <span className="text-6xl">🏓</span>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Online Pong</h2>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Real-time PvP — server authoritative</p>
              <button onClick={handleFindMatch} className="px-8 py-3 rounded-lg font-semibold text-white" style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}>
                🔍 Find Match
              </button>
            </div>
          )}

          {mode === 'online' && onlinePhase === 'matchmaking' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ backgroundColor: 'rgba(10, 14, 26, 0.9)', backdropFilter: 'blur(8px)' }}>
              <div className="w-12 h-12 rounded-full border-4 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>Searching for opponent…</p>
              <button onClick={handleCancelOnline} className="text-sm px-5 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
            </div>
          )}

          {mode === 'online' && onlinePhase === 'waiting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ backgroundColor: 'rgba(10, 14, 26, 0.9)', backdropFilter: 'blur(8px)' }}>
              <div className="w-12 h-12 rounded-full border-4 animate-spin" style={{ borderColor: '#ec4899', borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>Waiting for opponent…</p>
              <button onClick={handleCancelOnline} className="text-sm px-5 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
            </div>
          )}

          {mode === 'online' && opponentLeft && onlinePhase !== 'over' && (
            <div className="absolute top-4 inset-x-4 flex items-center justify-center">
              <div className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: 'var(--color-error)', border: '1px solid rgba(239,68,68,0.3)' }}>
                Opponent disconnected
              </div>
            </div>
          )}

          {/* Local pause */}
          {mode === 'local' && paused && !gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'rgba(10, 14, 26, 0.8)', backdropFilter: 'blur(8px)' }}>
              <h2 className="text-3xl font-bold" style={{ color: 'var(--color-text-primary)' }}>PAUSED</h2>
              <div className="flex gap-3">
                <button onClick={() => setPaused(false)} className="px-6 py-2 rounded-lg font-medium text-white" style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}>▶️ Resume</button>
                <button onClick={resetGame} className="px-6 py-2 rounded-lg font-medium" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>🔄 Restart</button>
              </div>
            </div>
          )}

          {/* Local game over */}
          {mode === 'local' && gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'rgba(10, 14, 26, 0.85)', backdropFilter: 'blur(8px)' }}>
              <h2 className="text-4xl font-extrabold" style={{ color: playerWon ? 'var(--color-success)' : 'var(--color-error)' }}>
                {playerWon ? '🎉 VICTORY' : 'DEFEAT'}
              </h2>
              <p className="text-2xl font-mono font-bold" style={{ color: 'var(--color-text-primary)' }}>{score.p1} — {score.p2}</p>
              <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                <span>Duration: {formatTime(time)}</span>
              </div>
              <div className="flex gap-3 mt-2">
                <button onClick={resetGame} className="px-6 py-2 rounded-lg font-medium text-white" style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}>🔄 Rematch</button>
                <Link to="/dashboard"><button className="px-6 py-2 rounded-lg font-medium" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>🏠 Back</button></Link>
              </div>
            </div>
          )}

          {/* Online game over */}
          {mode === 'online' && onlinePhase === 'over' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'rgba(10, 14, 26, 0.85)', backdropFilter: 'blur(8px)' }}>
              <h2 className="text-4xl font-extrabold" style={{ color: iWon ? 'var(--color-success)' : isDraw ? '#fbbf24' : 'var(--color-error)' }}>
                {iWon ? '🎉 VICTORY' : isDraw ? 'DRAW' :
                 onlineReason === 'disconnect_forfeit' ? 'OPPONENT LEFT' : 'DEFEAT'}
              </h2>
              <p className="text-2xl font-mono font-bold" style={{ color: 'var(--color-text-primary)' }}>{onlineScore.p1} — {onlineScore.p2}</p>
              <div className="flex gap-3 mt-2">
                <button onClick={() => { setGamePath(null); setOnlinePhase('idle'); }} className="px-6 py-2 rounded-lg font-medium text-white" style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}>🔍 New Match</button>
                <Link to="/dashboard"><button className="px-6 py-2 rounded-lg font-medium" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>🏠 Back</button></Link>
              </div>
            </div>
          )}
        </div>

        {/* Controls Bar */}
        <div className="flex items-center justify-between rounded-xl px-4 py-2.5" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full p-0.5" style={{ backgroundColor: 'var(--color-bg-input)' }}>
              <button onClick={() => setIs3D(false)} className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all duration-150')} style={{ backgroundColor: !is3D ? 'rgba(168, 85, 247, 0.2)' : 'transparent', color: !is3D ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>2D</button>
              <button onClick={() => setIs3D(true)} className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all duration-150')} style={{ backgroundColor: is3D ? 'rgba(168, 85, 247, 0.2)' : 'transparent', color: is3D ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>3D</button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mode === 'local' && (
              <button
                onClick={() => setPaused(!paused)}
                className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2"
                style={{ backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'}
              >
                {paused ? '▶️ Resume' : '⏸️ Pause'}
              </button>
            )}
            {mode === 'online' && onlinePhase === 'playing' && (
              <button
                onClick={handleForfeit}
                className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
                style={{ backgroundColor: 'var(--color-bg-input)', color: 'var(--color-error)', border: '1px solid rgba(239,68,68,0.3)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'}
              >
                🏳 Forfeit
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
