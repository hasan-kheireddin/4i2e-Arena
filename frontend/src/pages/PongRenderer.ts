export interface OnlineGameState {
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: { [slot: number]: { y: number } };
}

export interface OnlineSnapshot {
  serverTsMs: number;
  state: OnlineGameState;
}

interface DrawFrameOptions {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  p1Y: number;
  p2Y: number;
  ball: { x: number; y: number; vx: number; vy: number };
}

interface OnlineFrameOptions {
  snapshots: OnlineSnapshot[];
  latestState: OnlineGameState | null;
  latency: { rttMs: number; clockOffsetMs: number };
  mySlot: number | null;
  keys: Record<string, boolean>;
}

interface SmoothOnlineStateOptions {
  previousRendered: OnlineGameState | null;
  targetState: OnlineGameState;
  nowMs: number;
  lastRenderTs: number | null;
  mySlot: number | null;
}

interface RoundedRect {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

const SERVER_TICK_RATE = 60;
const SERVER_PADDLE_SPEED = 8;
const ONLINE_FIELD_HEIGHT = 600;
const ONLINE_PADDLE_HALF_HEIGHT = 40;
const INTERPOLATION_BASE_DELAY_MS = 45;
const INTERPOLATION_MAX_EXTRAPOLATION_MS = 120;
const ONLINE_SMOOTHING_GAIN = 26;

export function drawFrame({
  ctx,
  canvas,
  p1Y,
  p2Y,
  ball,
}: DrawFrameOptions) {
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

  const paddleWidth = 12;
  const paddleHeight = 80;
  const radius = 6;

  const p1Gradient = ctx.createLinearGradient(
    10,
    p1Y - paddleHeight / 2,
    10 + paddleWidth,
    p1Y + paddleHeight / 2,
  );
  p1Gradient.addColorStop(0, '#1D4ED8');
  p1Gradient.addColorStop(1, '#3B82F6');
  ctx.fillStyle = p1Gradient;
  roundRect(ctx, {
    x: 10,
    y: p1Y - paddleHeight / 2,
    width: paddleWidth,
    height: paddleHeight,
    radius,
  });
  ctx.shadowColor = 'rgba(59,130,246,0.6)';
  ctx.shadowBlur = 15;
  ctx.fill();
  ctx.shadowBlur = 0;

  const p2Gradient = ctx.createLinearGradient(
    canvas.width - 22,
    p2Y - paddleHeight / 2,
    canvas.width - 10,
    p2Y + paddleHeight / 2,
  );
  p2Gradient.addColorStop(0, '#DC2626');
  p2Gradient.addColorStop(1, '#EF4444');
  ctx.fillStyle = p2Gradient;
  roundRect(ctx, {
    x: canvas.width - 22,
    y: p2Y - paddleHeight / 2,
    width: paddleWidth,
    height: paddleHeight,
    radius,
  });
  ctx.shadowColor = 'rgba(239,68,68,0.6)';
  ctx.shadowBlur = 15;
  ctx.fill();
  ctx.shadowBlur = 0;

  for (let index = 3; index >= 0; index -= 1) {
    const alpha = index === 0 ? 1 : 0.15 * (3 - index);
    const trailX = ball.x - ball.vx * index * 2;
    const trailY = ball.y - ball.vy * index * 2;
    ctx.beginPath();
    ctx.arc(trailX, trailY, 8 - index, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(248,250,252,${alpha})`;
    if (index === 0) {
      ctx.shadowColor = 'rgba(248,250,252,0.5)';
      ctx.shadowBlur = 12;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

export function getOnlineInputMessageDirection(
  keys: Record<string, boolean>,
): 'up' | 'down' | 'stop' {
  const direction = getOnlineInputDirection(keys);
  if (direction < 0) return 'up';
  if (direction > 0) return 'down';
  return 'stop';
}

export function resolveOnlineFrameState({
  snapshots,
  latestState,
  latency,
  mySlot,
  keys,
}: OnlineFrameOptions): OnlineGameState | null {
  if (snapshots.length === 0) return latestState;

  const renderDelayMs = clamp(
    INTERPOLATION_BASE_DELAY_MS + latency.rttMs / 2,
    INTERPOLATION_BASE_DELAY_MS,
    220,
  );
  const targetServerTs = Date.now() + latency.clockOffsetMs - renderDelayMs;
  return resolveBufferedOnlineState(snapshots, targetServerTs, mySlot, keys);
}

export function smoothOnlineState({
  previousRendered,
  targetState,
  nowMs,
  lastRenderTs,
  mySlot,
}: SmoothOnlineStateOptions): {
  state: OnlineGameState;
  lastRenderTs: number;
} {
  const dtMs = lastRenderTs === null ? 16.7 : clamp(nowMs - lastRenderTs, 1, 100);
  const blend = clamp(
    1 - Math.exp(-(dtMs / 1000) * ONLINE_SMOOTHING_GAIN),
    0.08,
    1,
  );
  const source = previousRendered ?? targetState;
  const smoothed: OnlineGameState = {
    ball: {
      x: lerp(source.ball.x, targetState.ball.x, blend),
      y: lerp(source.ball.y, targetState.ball.y, blend),
      vx: targetState.ball.vx,
      vy: targetState.ball.vy,
    },
    paddles: {
      1: {
        y: lerp(
          source.paddles[1]?.y ?? targetState.paddles[1]?.y ?? 300,
          targetState.paddles[1]?.y ?? 300,
          blend,
        ),
      },
      2: {
        y: lerp(
          source.paddles[2]?.y ?? targetState.paddles[2]?.y ?? 300,
          targetState.paddles[2]?.y ?? 300,
          blend,
        ),
      },
    },
  };

  if (mySlot === 1 || mySlot === 2) {
    smoothed.paddles[mySlot] = {
      y: targetState.paddles[mySlot]?.y ?? smoothed.paddles[mySlot]?.y ?? 300,
    };
  }

  return { state: smoothed, lastRenderTs: nowMs };
}

export function drawPerspectiveOnlineFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: OnlineGameState,
  mySlot: number | null,
) {
  const { ball, paddles } = state;
  const scaleY = canvas.height / ONLINE_FIELD_HEIGHT;
  const flipped = mySlot === 2;
  const leftY = flipped
    ? (paddles[2]?.y ?? 300) * scaleY
    : (paddles[1]?.y ?? 300) * scaleY;
  const rightY = flipped
    ? (paddles[1]?.y ?? 300) * scaleY
    : (paddles[2]?.y ?? 300) * scaleY;
  const displayBall = flipped
    ? { ...ball, x: canvas.width - ball.x, vx: -ball.vx, y: ball.y * scaleY }
    : { ...ball, y: ball.y * scaleY };

  drawFrame({ ctx, canvas, p1Y: leftY, p2Y: rightY, ball: displayBall });
}

function getOnlineInputDirection(keys: Record<string, boolean>): -1 | 0 | 1 {
  if (keys['w'] || keys['W'] || keys['ArrowUp']) return -1;
  if (keys['s'] || keys['S'] || keys['ArrowDown']) return 1;
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}

function projectOnlinePaddleY(y: number, velocityPerTick: number, dtMs: number): number {
  const dtTicks = (dtMs / 1000) * SERVER_TICK_RATE;
  return clamp(
    y + velocityPerTick * dtTicks,
    ONLINE_PADDLE_HALF_HEIGHT,
    ONLINE_FIELD_HEIGHT - ONLINE_PADDLE_HALF_HEIGHT,
  );
}

function estimatePaddleVelocityPerTick(
  snapshots: OnlineSnapshot[],
  slot: 1 | 2,
): number {
  if (snapshots.length < 2) return 0;
  const last = snapshots[snapshots.length - 1];
  const previous = snapshots[snapshots.length - 2];
  const dtMs = Math.max(1, last.serverTsMs - previous.serverTsMs);
  const dtTicks = Math.max((dtMs / 1000) * SERVER_TICK_RATE, 1);
  const lastY = last.state.paddles[slot]?.y ?? ONLINE_FIELD_HEIGHT / 2;
  const previousY = previous.state.paddles[slot]?.y ?? lastY;
  return (lastY - previousY) / dtTicks;
}

function extrapolateOnlineState(
  lastSnapshot: OnlineSnapshot,
  snapshots: OnlineSnapshot[],
  targetServerTs: number,
  mySlot: number | null,
  keys: Record<string, boolean>,
): OnlineGameState {
  const dtMs = clamp(
    targetServerTs - lastSnapshot.serverTsMs,
    0,
    INTERPOLATION_MAX_EXTRAPOLATION_MS,
  );
  const dtTicks = (dtMs / 1000) * SERVER_TICK_RATE;
  const ownVelocity = getOnlineInputDirection(keys) * SERVER_PADDLE_SPEED;
  const paddle1Velocity = mySlot === 1
    ? ownVelocity
    : estimatePaddleVelocityPerTick(snapshots, 1);
  const paddle2Velocity = mySlot === 2
    ? ownVelocity
    : estimatePaddleVelocityPerTick(snapshots, 2);

  return {
    ball: {
      x: lastSnapshot.state.ball.x + lastSnapshot.state.ball.vx * dtTicks,
      y: lastSnapshot.state.ball.y + lastSnapshot.state.ball.vy * dtTicks,
      vx: lastSnapshot.state.ball.vx,
      vy: lastSnapshot.state.ball.vy,
    },
    paddles: {
      1: {
        y: projectOnlinePaddleY(
          lastSnapshot.state.paddles[1]?.y ?? ONLINE_FIELD_HEIGHT / 2,
          paddle1Velocity,
          dtMs,
        ),
      },
      2: {
        y: projectOnlinePaddleY(
          lastSnapshot.state.paddles[2]?.y ?? ONLINE_FIELD_HEIGHT / 2,
          paddle2Velocity,
          dtMs,
        ),
      },
    },
  };
}

function trimSnapshotBuffer(
  snapshots: OnlineSnapshot[],
  targetServerTs: number,
) {
  while (snapshots.length > 2 && snapshots[1].serverTsMs < targetServerTs - 200) {
    snapshots.shift();
  }
}

function interpolateOnlineSnapshots(
  previous: OnlineSnapshot,
  next: OnlineSnapshot,
  targetServerTs: number,
): OnlineGameState {
  const span = Math.max(1, next.serverTsMs - previous.serverTsMs);
  const alpha = clamp((targetServerTs - previous.serverTsMs) / span, 0, 1);
  const p1Previous = previous.state.paddles[1]?.y ?? 300;
  const p1Next = next.state.paddles[1]?.y ?? p1Previous;
  const p2Previous = previous.state.paddles[2]?.y ?? 300;
  const p2Next = next.state.paddles[2]?.y ?? p2Previous;

  return {
    ball: {
      x: lerp(previous.state.ball.x, next.state.ball.x, alpha),
      y: lerp(previous.state.ball.y, next.state.ball.y, alpha),
      vx: next.state.ball.vx,
      vy: next.state.ball.vy,
    },
    paddles: {
      1: { y: lerp(p1Previous, p1Next, alpha) },
      2: { y: lerp(p2Previous, p2Next, alpha) },
    },
  };
}

function resolveBufferedOnlineState(
  snapshots: OnlineSnapshot[],
  targetServerTs: number,
  mySlot: number | null,
  keys: Record<string, boolean>,
): OnlineGameState | null {
  if (snapshots.length === 0) return null;

  trimSnapshotBuffer(snapshots, targetServerTs);
  if (snapshots.length === 1) {
    return extrapolateOnlineState(
      snapshots[0],
      snapshots,
      targetServerTs,
      mySlot,
      keys,
    );
  }

  const upperIndex = snapshots.findIndex(
    (snapshot) => snapshot.serverTsMs >= targetServerTs,
  );
  if (upperIndex === 0) return snapshots[0].state;
  if (upperIndex === -1) {
    const lastSnapshot = snapshots[snapshots.length - 1];
    return extrapolateOnlineState(
      lastSnapshot,
      snapshots,
      targetServerTs,
      mySlot,
      keys,
    );
  }

  return interpolateOnlineSnapshots(
    snapshots[upperIndex - 1],
    snapshots[upperIndex],
    targetServerTs,
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  { x, y, width, height, radius }: RoundedRect,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius,
    y + height,
  );
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
