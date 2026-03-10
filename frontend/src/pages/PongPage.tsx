import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../lib/utils';

interface PaddleState { y: number }
interface BallState { x: number; y: number; vx: number; vy: number }

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

  // Timer
  useEffect(() => {
    if (paused || gameOver) return;
    const interval = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [paused, gameOver]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  };

  // Game loop
  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const gs = gameState.current;

    if (!paused && !gameOver) {
      // Player paddle follows mouse
      gs.p1.y += (gs.mouseY - gs.p1.y) * 0.15;

      // AI paddle
      gs.p2.y += (gs.ball.y - gs.p2.y) * 0.06;

      // Ball movement
      gs.ball.x += gs.ball.vx;
      gs.ball.y += gs.ball.vy;

      // Top/bottom bounce
      if (gs.ball.y <= 8 || gs.ball.y >= canvas.height - 8) {
        gs.ball.vy *= -1;
      }

      // Paddle collision - P1
      if (gs.ball.x <= 22 && gs.ball.x >= 10 &&
          gs.ball.y >= gs.p1.y - 40 && gs.ball.y <= gs.p1.y + 40) {
        gs.ball.vx = Math.abs(gs.ball.vx) * 1.02;
        gs.ball.vy += (gs.ball.y - gs.p1.y) * 0.04;
      }

      // Paddle collision - P2
      if (gs.ball.x >= canvas.width - 22 && gs.ball.x <= canvas.width - 10 &&
          gs.ball.y >= gs.p2.y - 40 && gs.ball.y <= gs.p2.y + 40) {
        gs.ball.vx = -Math.abs(gs.ball.vx) * 1.02;
        gs.ball.vy += (gs.ball.y - gs.p2.y) * 0.04;
      }

      // Score
      if (gs.ball.x < 0) {
        setScore((prev) => {
          const next = { ...prev, p2: prev.p2 + 1 };
          if (next.p2 >= 5) setGameOver(true);
          return next;
        });
        gs.ball = { x: canvas.width / 2, y: canvas.height / 2, vx: -4, vy: 3 };
      }
      if (gs.ball.x > canvas.width) {
        setScore((prev) => {
          const next = { ...prev, p1: prev.p1 + 1 };
          if (next.p1 >= 5) setGameOver(true);
          return next;
        });
        gs.ball = { x: canvas.width / 2, y: canvas.height / 2, vx: 4, vy: -3 };
      }
    }

    // Draw
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Center line
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(148,163,184,0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);

    if (is3D) {
      // 3D perspective
      ctx.save();
      ctx.transform(1, 0, 0, 0.85, 0, canvas.height * 0.08);
    }

    // Paddles
    const paddleW = 12;
    const paddleH = 80;
    const radius = 6;

    // P1 paddle (purple gradient)
    const p1Grad = ctx.createLinearGradient(10, gs.p1.y - paddleH/2, 10 + paddleW, gs.p1.y + paddleH/2);
    p1Grad.addColorStop(0, '#7C3AED');
    p1Grad.addColorStop(1, '#A855F7');
    ctx.fillStyle = p1Grad;
    roundRect(ctx, 10, gs.p1.y - paddleH/2, paddleW, paddleH, radius);

    // P1 glow
    ctx.shadowColor = 'rgba(124,58,237,0.5)';
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;

    // P2 paddle (pink gradient)
    const p2Grad = ctx.createLinearGradient(canvas.width - 22, gs.p2.y - paddleH/2, canvas.width - 10, gs.p2.y + paddleH/2);
    p2Grad.addColorStop(0, '#EC4899');
    p2Grad.addColorStop(1, '#F472B6');
    ctx.fillStyle = p2Grad;
    roundRect(ctx, canvas.width - 22, gs.p2.y - paddleH/2, paddleW, paddleH, radius);
    ctx.shadowColor = 'rgba(236,72,153,0.5)';
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Ball with trail
    for (let i = 3; i >= 0; i--) {
      const alpha = i === 0 ? 1 : 0.15 * (3 - i);
      const trailX = gs.ball.x - gs.ball.vx * i * 2;
      const trailY = gs.ball.y - gs.ball.vy * i * 2;
      ctx.beginPath();
      ctx.arc(trailX, trailY, 8 - i, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(248,250,252,${alpha})`;
      if (i === 0) {
        ctx.shadowColor = 'rgba(248,250,252,0.5)';
        ctx.shadowBlur = 12;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (is3D) {
      ctx.restore();
    }

    requestAnimationFrame(animate);
  }, [paused, gameOver, is3D]);

  useEffect(() => {
    const id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, [animate]);

  // Mouse handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      gameState.current.mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height;
    };
    canvas.addEventListener('mousemove', handler);
    return () => canvas.removeEventListener('mousemove', handler);
  }, []);

  const resetGame = () => {
    setScore({ p1: 0, p2: 0 });
    setGameOver(false);
    setPaused(false);
    setTime(0);
    const gs = gameState.current;
    gs.p1.y = 250;
    gs.p2.y = 250;
    gs.ball = { x: 400, y: 250, vx: 4, vy: 3 };
  };

  const playerWon = score.p1 >= 5;

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <div className="max-w-5xl w-full space-y-4">
        {/* HUD */}
        <div 
          className="flex items-center justify-between rounded-xl px-4 py-3"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div className="flex items-center gap-3">
            <Avatar name="You" size="sm" />
            <span className="text-sm font-medium hidden sm:block" style={{ color: 'var(--color-text-primary)' }}>You</span>
            <span className="text-2xl font-bold font-mono" style={{ color: 'var(--color-primary)' }}>{score.p1}</span>
          </div>
          <div className="flex items-center gap-3" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="text-sm font-mono">{formatTime(time)}</span>
            <span 
              className="px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1.5"
              style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: 'var(--color-success)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-success)' }} />
              Live
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold font-mono" style={{ color: '#ec4899' }}>{score.p2}</span>
            <span className="text-sm font-medium hidden sm:block" style={{ color: 'var(--color-text-primary)' }}>AI Bot</span>
            <Avatar name="AI" size="sm" />
          </div>
        </div>

        {/* Arena */}
        <div 
          className="relative rounded-2xl overflow-hidden"
          style={{ border: '1px solid var(--color-border)' }}
        >
          <canvas
            ref={canvasRef}
            width={800}
            height={500}
            className="w-full aspect-[16/10] cursor-none"
            style={{ backgroundColor: '#0a0e1a' }}
          />

          {/* Pause overlay */}
          {paused && !gameOver && (
            <div 
              className="absolute inset-0 flex flex-col items-center justify-center gap-4"
              style={{ backgroundColor: 'rgba(10, 14, 26, 0.8)', backdropFilter: 'blur(8px)' }}
            >
              <h2 className="text-3xl font-bold" style={{ color: 'var(--color-text-primary)' }}>PAUSED</h2>
              <div className="flex gap-3">
                <button
                  onClick={() => setPaused(false)}
                  className="px-6 py-2 rounded-lg font-medium text-white flex items-center gap-2 transition-all duration-200"
                  style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}
                >
                  ▶️ Resume
                </button>
                <button
                  onClick={resetGame}
                  className="px-6 py-2 rounded-lg font-medium transition-all duration-200"
                  style={{
                    backgroundColor: 'var(--color-bg-card)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  🔄 Restart
                </button>
              </div>
            </div>
          )}

          {/* Game Over overlay */}
          {gameOver && (
            <div 
              className="absolute inset-0 flex flex-col items-center justify-center gap-4"
              style={{ backgroundColor: 'rgba(10, 14, 26, 0.85)', backdropFilter: 'blur(8px)' }}
            >
              <h2 
                className="text-4xl font-extrabold"
                style={{ 
                  color: playerWon ? 'var(--color-success)' : 'var(--color-error)' 
                }}
              >
                {playerWon ? '🎉 VICTORY' : 'DEFEAT'}
              </h2>
              <p className="text-2xl font-mono font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {score.p1} — {score.p2}
              </p>
              <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                <span>Duration: {formatTime(time)}</span>
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>
                +{playerWon ? 25 : 5} XP earned
              </p>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={resetGame}
                  className="px-6 py-2 rounded-lg font-medium text-white flex items-center gap-2 transition-all duration-200"
                  style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}
                >
                  🔄 Rematch
                </button>
                <Link to="/dashboard">
                  <button
                    className="px-6 py-2 rounded-lg font-medium transition-all duration-200"
                    style={{
                      backgroundColor: 'var(--color-bg-card)',
                      color: 'var(--color-text-primary)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    🏠 Back
                  </button>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Controls Bar */}
        <div 
          className="flex items-center justify-between rounded-xl px-4 py-2.5"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div className="flex items-center gap-2">
            {/* 2D/3D toggle */}
            <div className="flex rounded-full p-0.5" style={{ backgroundColor: 'var(--color-bg-input)' }}>
              <button
                onClick={() => setIs3D(false)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium transition-all duration-150'
                )}
                style={{
                  backgroundColor: !is3D ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                  color: !is3D ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                }}
              >
                2D
              </button>
              <button
                onClick={() => setIs3D(true)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium transition-all duration-150'
                )}
                style={{
                  backgroundColor: is3D ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                  color: is3D ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                }}
              >
                3D
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPaused(!paused)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2"
              style={{
                backgroundColor: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'}
            >
              {paused ? '▶️ Resume' : '⏸️ Pause'}
            </button>
            <button
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2"
              style={{
                backgroundColor: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'}
            >
              💬 Chat
            </button>
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