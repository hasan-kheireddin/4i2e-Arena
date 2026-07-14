export interface OnlineGameState {
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: { [slot: number]: { y: number } };
}

export interface OnlineSnapshot {
  receivedAt: number;
  state: OnlineGameState;
}

interface DrawFrameOptions {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  p1Y: number;
  p2Y: number;
  ball: { x: number; y: number; vx: number; vy: number };
  geometry?: {
    paddleWidth: number;
    paddleHeight: number;
    leftPaddleX: number;
    rightPaddleX: number;
    ballRadiusX: number;
    ballRadiusY: number;
    paddleCornerRadius: number;
  };
}

interface OnlineFrameOptions {
  snapshots: OnlineSnapshot[];
  latestState: OnlineGameState | null;
}

interface SmoothOnlineStateOptions {
  previousRendered: OnlineGameState | null;
  targetState: OnlineGameState;
  latestState: OnlineGameState | null;
  nowMs: number;
  lastRenderTs: number | null;
  mySlot: number | null;
  keys: Record<string, boolean>;
  reconcileLocalPaddle: boolean;
  latestLocalInputSequence: number;
  lastProcessedInputSequence: number;
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
const ONLINE_FIELD_WIDTH = 800;
const ONLINE_FIELD_HEIGHT = 600;
const ONLINE_PADDLE_WIDTH = 12;
const ONLINE_PADDLE_HEIGHT = 80;
const ONLINE_PADDLE_OFFSET = 20;
const ONLINE_PADDLE_HALF_HEIGHT = ONLINE_PADDLE_HEIGHT / 2;
const ONLINE_BALL_RADIUS = 8;
const VISUAL_PADDLE_WIDTH = 12;
const VISUAL_PADDLE_HEIGHT = 80;
const VISUAL_PADDLE_CORNER_RADIUS = 6;
const VISUAL_BALL_RADIUS = 8;
const ONLINE_SMOOTHING_GAIN = 26;
const LOCAL_RECONCILIATION_THRESHOLD = 6;

export function drawFrame({
  ctx,
  canvas,
  p1Y,
  p2Y,
  ball,
  geometry,
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

  const paddleWidth = geometry?.paddleWidth ?? ONLINE_PADDLE_WIDTH;
  const paddleHeight = geometry?.paddleHeight ?? ONLINE_PADDLE_HEIGHT;
  const leftPaddleX = geometry?.leftPaddleX ?? 10;
  const rightPaddleX = geometry?.rightPaddleX ?? canvas.width - 22;
  const ballRadiusX = geometry?.ballRadiusX ?? ONLINE_BALL_RADIUS;
  const ballRadiusY = geometry?.ballRadiusY ?? ONLINE_BALL_RADIUS;
  const radius = geometry?.paddleCornerRadius ?? 6;

  const p1Gradient = ctx.createLinearGradient(
    leftPaddleX,
    p1Y - paddleHeight / 2,
    leftPaddleX + paddleWidth,
    p1Y + paddleHeight / 2,
  );
  p1Gradient.addColorStop(0, '#1D4ED8');
  p1Gradient.addColorStop(1, '#3B82F6');
  ctx.fillStyle = p1Gradient;
  roundRect(ctx, {
    x: leftPaddleX,
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
    rightPaddleX,
    p2Y - paddleHeight / 2,
    rightPaddleX + paddleWidth,
    p2Y + paddleHeight / 2,
  );
  p2Gradient.addColorStop(0, '#DC2626');
  p2Gradient.addColorStop(1, '#EF4444');
  ctx.fillStyle = p2Gradient;
  roundRect(ctx, {
    x: rightPaddleX,
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
    const radiusScale = (ONLINE_BALL_RADIUS - index) / ONLINE_BALL_RADIUS;
    ctx.ellipse(
      trailX,
      trailY,
      ballRadiusX * radiusScale,
      ballRadiusY * radiusScale,
      0,
      0,
      Math.PI * 2,
    );
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
}: OnlineFrameOptions): OnlineGameState | null {
  if (snapshots.length === 0) return latestState;
  return snapshots[snapshots.length - 1].state;
}

export function smoothOnlineState({
  previousRendered,
  targetState,
  latestState,
  nowMs,
  lastRenderTs,
  mySlot,
  keys,
  reconcileLocalPaddle,
  latestLocalInputSequence,
  lastProcessedInputSequence,
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
    // Snapshot interpolation already produces a continuous 60 Hz path. A
    // second easing pass changes the apparent velocity after every correction.
    ball: { ...targetState.ball },
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
    const previousY = source.paddles[mySlot]?.y
      ?? targetState.paddles[mySlot]?.y
      ?? ONLINE_FIELD_HEIGHT / 2;
    const direction = getOnlineInputDirection(keys);
    const predictedY = projectOnlinePaddleY(
      previousY,
      direction * SERVER_PADDLE_SPEED,
      dtMs,
    );
    const authoritativeY = latestState?.paddles[mySlot]?.y ?? predictedY;
    const authoritativeBall = latestState?.ball ?? targetState.ball;
    const paddleX = mySlot === 1
      ? ONLINE_PADDLE_OFFSET
      : ONLINE_FIELD_WIDTH - ONLINE_PADDLE_OFFSET;
    const nearBall = Math.abs(authoritativeBall.x - paddleX) < 40;
    const difference = authoritativeY - predictedY;
    const mayReconcile = (
      reconcileLocalPaddle
      && lastProcessedInputSequence >= latestLocalInputSequence
      && Math.abs(difference) >= LOCAL_RECONCILIATION_THRESHOLD
    );
    const correctionBlend = nearBall ? 0.6 : (mayReconcile ? blend * 0.5 : 0);
    smoothed.paddles[mySlot] = {
      y: lerp(predictedY, authoritativeY, correctionBlend),
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
  const scaleX = canvas.width / ONLINE_FIELD_WIDTH;
  const scaleY = canvas.height / ONLINE_FIELD_HEIGHT;
  const flipped = mySlot === 2;
  const leftY = flipped
    ? (paddles[2]?.y ?? 300) * scaleY
    : (paddles[1]?.y ?? 300) * scaleY;
  const rightY = flipped
    ? (paddles[1]?.y ?? 300) * scaleY
    : (paddles[2]?.y ?? 300) * scaleY;
  const displayBall = flipped
    ? {
        ...ball,
        x: (ONLINE_FIELD_WIDTH - ball.x) * scaleX,
        y: ball.y * scaleY,
        vx: -ball.vx * scaleX,
        vy: ball.vy * scaleY,
      }
    : {
        ...ball,
        x: ball.x * scaleX,
        y: ball.y * scaleY,
        vx: ball.vx * scaleX,
        vy: ball.vy * scaleY,
      };

  drawFrame({
    ctx,
    canvas,
    p1Y: leftY,
    p2Y: rightY,
    ball: displayBall,
    geometry: {
      paddleWidth: VISUAL_PADDLE_WIDTH,
      paddleHeight: VISUAL_PADDLE_HEIGHT,
      leftPaddleX: (
        ONLINE_PADDLE_OFFSET * scaleX - VISUAL_PADDLE_WIDTH / 2
      ),
      rightPaddleX: (
        (ONLINE_FIELD_WIDTH - ONLINE_PADDLE_OFFSET) * scaleX
        - VISUAL_PADDLE_WIDTH / 2
      ),
      ballRadiusX: VISUAL_BALL_RADIUS,
      ballRadiusY: VISUAL_BALL_RADIUS,
      paddleCornerRadius: VISUAL_PADDLE_CORNER_RADIUS,
    },
  });
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
