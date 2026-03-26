import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/ui/Avatar';
import { useGameSocket } from '../hooks/useGameSocket';

interface PaddleState { y: number }
interface BallState { x: number; y: number; vx: number; vy: number }

type Mode = 'local' | 'online';
type Difficulty = 'easy' | 'medium' | 'hard';
type OnlinePhase = 'idle' | 'matchmaking' | 'waiting' | 'playing' | 'over';

interface OnlineGameState {
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: { [slot: number]: { y: number } };
  score?: { [slot: number]: number };
}

const WIN_SCORE = 7;
const PADDLE_SPEED = 6;
const AI_SPEED: Record<Difficulty, number> = { easy: 0.03, medium: 0.06, hard: 0.14 };

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
  const [mode, setMode] = useState<Mode>('local');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState({ p1: 0, p2: 0 });
  const [gameOver, setGameOver] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  const gameState = useRef({
    p1: { y: 250 } as PaddleState,
    p2: { y: 250 } as PaddleState,
    ball: { x: 400, y: 250, vx: 4, vy: 3 } as BallState,
  });

  // shared keyboard state
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

  const [mmPath, setMmPath] = useState<string | null>(null);
  const [gamePath, setGamePath] = useState<string | null>(null);

  // online paddle position tracked locally for keyboard sending
  const onlinePaddleYRef = useRef(250);

  // ── local game loop ───────────────────────────────────────────────────────
  const animate = useCallback(() => {
    if (mode !== 'local') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const gs = gameState.current;
    const keys = keysRef.current;

    if (!gameOver) {
      // player paddle — keyboard
      if (keys['w'] || keys['W'] || keys['ArrowUp']) {
        gs.p1.y = Math.max(40, gs.p1.y - PADDLE_SPEED);
      }
      if (keys['s'] || keys['S'] || keys['ArrowDown']) {
        gs.p1.y = Math.min(canvas.height - 40, gs.p1.y + PADDLE_SPEED);
      }

      // AI paddle — tracks ball at difficulty speed
      gs.p2.y += (gs.ball.y - gs.p2.y) * AI_SPEED[difficulty];

      // ball movement
      gs.ball.x += gs.ball.vx;
      gs.ball.y += gs.ball.vy;

      // wall bounce
      if (gs.ball.y <= 8 || gs.ball.y >= canvas.height - 8) gs.ball.vy *= -1;

      // paddle collisions
      if (gs.ball.x <= 22 && gs.ball.x >= 10 && gs.ball.y >= gs.p1.y - 40 && gs.ball.y <= gs.p1.y + 40) {
        gs.ball.vx = Math.abs(gs.ball.vx) * 1.02;
        gs.ball.vy += (gs.ball.y - gs.p1.y) * 0.04;
      }
      if (gs.ball.x >= canvas.width - 22 && gs.ball.x <= canvas.width - 10 && gs.ball.y >= gs.p2.y - 40 && gs.ball.y <= gs.p2.y + 40) {
        gs.ball.vx = -Math.abs(gs.ball.vx) * 1.02;
        gs.ball.vy += (gs.ball.y - gs.p2.y) * 0.04;
      }

      // scoring
      if (gs.ball.x < 0) {
        setScore((prev) => { const next = { ...prev, p2: prev.p2 + 1 }; if (next.p2 >= WIN_SCORE) setGameOver(true); return next; });
        gs.ball = { x: canvas.width / 2, y: canvas.height / 2, vx: -4, vy: 3 };
      }
      if (gs.ball.x > canvas.width) {
        setScore((prev) => { const next = { ...prev, p1: prev.p1 + 1 }; if (next.p1 >= WIN_SCORE) setGameOver(true); return next; });
        gs.ball = { x: canvas.width / 2, y: canvas.height / 2, vx: 4, vy: -3 };
      }
    }

    drawFrame(ctx, canvas, gs.p1.y, gs.p2.y, gs.ball);
    requestAnimationFrame(animate);
  }, [mode, gameOver, difficulty]);

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
    drawFrame(ctx, canvas, paddles[1]?.y ?? 250, paddles[2]?.y ?? 250, ball);
  }, [mode, onlineGameState]);

  // ── online keyboard paddle send ───────────────────────────────────────────
  const gameSendRef = useRef<(data: Record<string, unknown>) => void>(() => {});

  useEffect(() => {
    if (mode !== 'online' || onlinePhase !== 'playing') return;
    const interval = setInterval(() => {
      const keys = keysRef.current;
      let moved = false;
      if (keys['w'] || keys['W'] || keys['ArrowUp']) {
        onlinePaddleYRef.current = Math.max(40, onlinePaddleYRef.current - PADDLE_SPEED);
        moved = true;
      }
      if (keys['s'] || keys['S'] || keys['ArrowDown']) {
        onlinePaddleYRef.current = Math.min(460, onlinePaddleYRef.current + PADDLE_SPEED);
        moved = true;
      }
      if (moved) {
        gameSendRef.current({ type: 'paddle_move', y: Math.round(onlinePaddleYRef.current) });
      }
    }, 33);
    return () => clearInterval(interval);
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
        const winner = data.winner as string | null;
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

  // keep gameSendRef in sync
  useEffect(() => { gameSendRef.current = gameSend; }, [gameSend]);

  // ── local reset ───────────────────────────────────────────────────────────
  const resetGame = () => {
    setScore({ p1: 0, p2: 0 });
    setGameOver(false);
    const gs = gameState.current;
    gs.p1.y = 250; gs.p2.y = 250;
    gs.ball = { x: 400, y: 250, vx: 4, vy: 3 };
  };

  // ── online helpers ────────────────────────────────────────────────────────
  const handleFindMatch = () => {
    onlinePaddleYRef.current = 250;
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

  const playerWon = score.p1 >= WIN_SCORE;
  const iWon = onlineWinnerSlot !== null && onlineWinnerSlot === mySlot;
  const displayScore = mode === 'online' ? onlineScore : score;
  const p2Label = mode === 'online' ? opponentName : 'AI Bot';

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="max-w-5xl w-full space-y-4">

        {/* Mode switcher */}
        <div className="flex justify-center">
          <div className="flex rounded-full p-1 gap-1" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            {(['local', 'online'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => handleModeSwitch(m)}
                className="px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-150"
                style={{
                  backgroundColor: mode === m ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: mode === m ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                }}
              >
                {m === 'local' ? 'Local (vs AI)' : 'Online (PvP)'}
              </button>
            ))}
          </div>
        </div>

        {/* HUD */}
        <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <Avatar name="You" size="sm" />
            <span className="text-sm font-medium hidden sm:block" style={{ color: 'var(--color-text-primary)' }}>You</span>
            <span className="text-2xl font-bold font-mono" style={{ color: '#3B82F6' }}>{displayScore.p1}</span>
          </div>
          <span className="px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1.5" style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: 'var(--color-success)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-success)' }} />
            {mode === 'local' ? 'Live' : onlinePhase === 'playing' ? 'Live' : onlinePhase}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold font-mono" style={{ color: '#EF4444' }}>{displayScore.p2}</span>
            <span className="text-sm font-medium hidden sm:block" style={{ color: 'var(--color-text-primary)' }}>{p2Label}</span>
            <Avatar name={p2Label} size="sm" />
          </div>
        </div>

        {/* Arena */}
        <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          <canvas ref={canvasRef} width={800} height={500} className="w-full aspect-[16/10]" style={{ backgroundColor: '#0a0e1a' }} />

          {/* Online — idle */}
          {mode === 'online' && onlinePhase === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ backgroundColor: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Online Pong</h2>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Real-time PvP — server authoritative</p>
              <button onClick={handleFindMatch} className="px-8 py-3 rounded-lg font-semibold text-white" style={{ background: 'linear-gradient(135deg, #1D4ED8 0%, #EF4444 100%)' }}>
                Find Match
              </button>
            </div>
          )}

          {/* Online — matchmaking */}
          {mode === 'online' && onlinePhase === 'matchmaking' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ backgroundColor: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
              <div className="w-12 h-12 rounded-full border-4 animate-spin" style={{ borderColor: '#3B82F6', borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>Searching for opponent…</p>
              <button onClick={handleCancelOnline} className="text-sm px-5 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
            </div>
          )}

          {/* Online — waiting */}
          {mode === 'online' && onlinePhase === 'waiting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ backgroundColor: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
              <div className="w-12 h-12 rounded-full border-4 animate-spin" style={{ borderColor: '#EF4444', borderTopColor: 'transparent' }} />
              <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>Waiting for opponent…</p>
              <button onClick={handleCancelOnline} className="text-sm px-5 py-2 rounded-lg" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Cancel</button>
            </div>
          )}

          {/* Online — opponent left banner */}
          {mode === 'online' && opponentLeft && onlinePhase !== 'over' && (
            <div className="absolute top-4 inset-x-4 flex items-center justify-center">
              <div className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: 'var(--color-error)', border: '1px solid rgba(239,68,68,0.3)' }}>
                Opponent disconnected
              </div>
            </div>
          )}

          {/* Local — game over */}
          {mode === 'local' && gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'rgba(10,14,26,0.85)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
              <h2 className="text-5xl font-extrabold" style={{ color: playerWon ? '#3B82F6' : '#EF4444' }}>
                {playerWon ? 'Win' : 'Lose'}
              </h2>
              <p className="text-2xl font-mono font-bold" style={{ color: 'var(--color-text-primary)' }}>{score.p1} — {score.p2}</p>
              <div className="flex gap-3 mt-2">
                <button onClick={resetGame} className="px-6 py-2 rounded-lg font-medium text-white" style={{ background: 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)' }}>Play Again</button>
                <Link to="/dashboard"><button className="px-6 py-2 rounded-lg font-medium" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>Back</button></Link>
              </div>
            </div>
          )}

          {/* Online — game over */}
          {mode === 'online' && onlinePhase === 'over' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'rgba(10,14,26,0.85)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
              <h2 className="text-5xl font-extrabold" style={{ color: iWon ? '#3B82F6' : '#EF4444' }}>
                {iWon ? 'Win' : 'Lose'}
              </h2>
              <p className="text-2xl font-mono font-bold" style={{ color: 'var(--color-text-primary)' }}>{onlineScore.p1} — {onlineScore.p2}</p>
              {(onlineReason === 'disconnect_forfeit' || opponentLeft) && (
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Opponent disconnected</p>
              )}
              {onlineReason === 'forfeit' && (
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Opponent forfeited</p>
              )}
              <div className="flex gap-3 mt-2">
                <button onClick={() => { setGamePath(null); setOnlinePhase('idle'); }} className="px-6 py-2 rounded-lg font-medium text-white" style={{ background: 'linear-gradient(135deg, #1D4ED8 0%, #EF4444 100%)' }}>New Match</button>
                <Link to="/dashboard"><button className="px-6 py-2 rounded-lg font-medium" style={{ backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>Back</button></Link>
              </div>
            </div>
          )}
        </div>

        {/* Controls Bar */}
        <div className="flex items-center justify-between rounded-xl px-4 py-2.5" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          {/* left — difficulty (local) or empty (online) */}
          <div className="flex items-center gap-2">
            {mode === 'local' && (['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className="px-3 py-1 rounded-full text-xs font-medium capitalize transition-all duration-150"
                style={{
                  backgroundColor: difficulty === d ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: difficulty === d ? '#3B82F6' : 'var(--color-text-muted)',
                  border: difficulty === d ? '1px solid #3B82F6' : '1px solid var(--color-border)',
                }}
              >
                {d}
              </button>
            ))}
          </div>

          {/* right — hint + forfeit */}
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              W / S &nbsp;or&nbsp; ↑ / ↓
            </span>
            {mode === 'online' && onlinePhase === 'playing' && (
              <button
                onClick={handleForfeit}
                className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
                style={{ backgroundColor: 'var(--color-bg-input)', color: 'var(--color-error)', border: '1px solid rgba(239,68,68,0.3)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'}
              >
                Forfeit
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
