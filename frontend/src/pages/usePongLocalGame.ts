import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createLocalMatch } from '../services/games';
import { drawFrame } from './PongRenderer';
import type { PongMode } from './PongGameView';

interface PaddleState {
  y: number;
}

interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface LocalGameState {
  p1: PaddleState;
  p2: PaddleState;
  ball: BallState;
}

interface LocalPlayerNames {
  p1: string;
  p2: string;
}

interface LocalGameOptions {
  canvasRef: RefObject<HTMLCanvasElement>;
  mode: PongMode;
}

const WIN_SCORE = 7;
const PADDLE_SPEED = 6;
const BASE_BALL_VX = 4;
const BASE_BALL_VY = 3;
const LOCAL_STEP_MS = 1000 / 60;
const LOCAL_MAX_CATCHUP_STEPS = 6;

export function usePongLocalGame({
  canvasRef,
  mode,
}: LocalGameOptions) {
  const [score, setScore] = useState({ p1: 0, p2: 0 });
  const [gameOver, setGameOver] = useState(false);
  const [isLocalPaused, setIsLocalPaused] = useState(false);
  const [gameStartTime, setGameStartTime] = useState<number | null>(null);
  const [localPlayerNames, setLocalPlayerNames] = useState<LocalPlayerNames>({
    p1: '',
    p2: '',
  });
  const [localNamesReady, setLocalNamesReady] = useState(mode !== 'local');

  const gameOverRef = useRef(false);
  const matchSavedRef = useRef(false);
  const lastFrameTsRef = useRef<number | null>(null);
  const accumulatorMsRef = useRef(0);
  const keysRef = useRef<Record<string, boolean>>({});
  const initialBall = { vx: BASE_BALL_VX, vy: BASE_BALL_VY };
  const gameStateRef = useRef<LocalGameState>({
    p1: { y: 250 },
    p2: { y: 250 },
    ball: { x: 400, y: 250, ...initialBall },
  });

  useEffect(() => {
    gameOverRef.current = gameOver || isLocalPaused;
  }, [gameOver, isLocalPaused]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      keysRef.current[event.key] = true;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keysRef.current[event.key] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const scorePoint = useCallback((
    player: 'p1' | 'p2',
    state: LocalGameState,
    canvas: HTMLCanvasElement,
    resetVx: number,
    resetVy: number,
  ) => {
    let gameEnded = false;
    setScore((previous) => {
      if (gameOverRef.current) return previous;
      const nextScore = Math.min(previous[player] + 1, WIN_SCORE);
      gameEnded = nextScore >= WIN_SCORE;
      if (gameEnded) {
        gameOverRef.current = true;
        setGameOver(true);
      }
      return { ...previous, [player]: nextScore };
    });

    if (gameEnded) return;
    const resetSpeed = { vx: resetVx, vy: resetVy };
    state.ball = {
      x: canvas.width / 2,
      y: canvas.height / 2,
      ...resetSpeed,
    };
  }, []);

  const handleScore = useCallback((
    state: LocalGameState,
    canvas: HTMLCanvasElement,
  ) => {
    if (state.ball.x < 0) {
      scorePoint('p2', state, canvas, -BASE_BALL_VX, BASE_BALL_VY);
      return;
    }
    if (state.ball.x > canvas.width) {
      scorePoint('p1', state, canvas, BASE_BALL_VX, -BASE_BALL_VY);
    }
  }, [scorePoint]);

  const simulateStep = useCallback((canvas: HTMLCanvasElement) => {
    const state = gameStateRef.current;
    const keys = keysRef.current;

    movePlayerOne(state, keys, canvas.height);
    movePlayerTwo(state, keys, canvas.height);
    moveBall(state, canvas);
    handlePaddleCollisions(state, canvas.width);
    handleScore(state, canvas);
  }, [mode, handleScore]);

  const animate = useCallback((nowMs: number) => {
    if (!canAnimateLocalGame(mode, localNamesReady)) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const deltaMs = updateFrameClock(nowMs, lastFrameTsRef);
    accumulatorMsRef.current += deltaMs;
    runSimulationSteps(
      canvas,
      accumulatorMsRef,
      gameOverRef,
      simulateStep,
    );

    const state = gameStateRef.current;
    drawFrame({
      ctx: context,
      canvas,
      p1Y: state.p1.y,
      p2Y: state.p2.y,
      ball: state.ball,
    });

    if (!gameOverRef.current) {
      requestAnimationFrame(animate);
    }
  }, [canvasRef, mode, localNamesReady, simulateStep]);

  useEffect(() => {
    if (!shouldStartLocalLoop(mode, gameOver, localNamesReady)) return;
    if (gameStartTime === null) {
      setGameStartTime(Date.now());
    }

    resetFrameClock(lastFrameTsRef, accumulatorMsRef);
    const animationId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animationId);
      resetFrameClock(lastFrameTsRef, accumulatorMsRef);
    };
  }, [mode, animate, gameOver, gameStartTime, localNamesReady]);

  useEffect(() => {
    if (!shouldSaveMatch(gameOver, mode, gameStartTime, matchSavedRef.current)) {
      return;
    }
    matchSavedRef.current = true;
    void saveLocalMatch({
      mode,
      score,
      gameStartTime,
      localPlayerNames,
    });
  }, [gameOver, mode, gameStartTime, score, localPlayerNames]);

  const resetGame = () => {
    setScore({ p1: 0, p2: 0 });
    setGameOver(false);
    setIsLocalPaused(false);
    gameOverRef.current = false;
    matchSavedRef.current = false;
    setGameStartTime(null);
    if (mode === 'local') {
      setLocalPlayerNames({ p1: '', p2: '' });
      setLocalNamesReady(false);
    }

    const resetSpeed = { vx: BASE_BALL_VX, vy: BASE_BALL_VY };
    gameStateRef.current = {
      p1: { y: 250 },
      p2: { y: 250 },
      ball: { x: 400, y: 250, ...resetSpeed },
    };
  };

  const startLocalGame = () => {
    if (!localPlayerNames.p1.trim()) return;
    if (!localPlayerNames.p2.trim()) return;
    setLocalNamesReady(true);
    setGameStartTime(Date.now());
  };

  const toggleLocalPause = () => {
    const nextPaused = !isLocalPaused;
    setIsLocalPaused(nextPaused);
    gameOverRef.current = nextPaused;
    if (nextPaused) return;

    resetFrameClock(lastFrameTsRef, accumulatorMsRef);
    requestAnimationFrame(animate);
  };

  return {
    score,
    gameOver,
    isLocalPaused,
    localPlayerNames,
    localNamesReady,
    keysRef,
    setLocalPlayerNames,
    resetGame,
    startLocalGame,
    toggleLocalPause,
  };
}

function movePlayerOne(
  state: LocalGameState,
  keys: Record<string, boolean>,
  canvasHeight: number,
) {
  const movingUp = keys.w || keys.W;
  const movingDown = keys.s || keys.S;
  if (movingUp) {
    state.p1.y = Math.max(40, state.p1.y - PADDLE_SPEED);
  }
  if (movingDown) {
    state.p1.y = Math.min(canvasHeight - 40, state.p1.y + PADDLE_SPEED);
  }
}

function movePlayerTwo(
  state: LocalGameState,
  keys: Record<string, boolean>,
  canvasHeight: number,
) {
  if (keys.ArrowUp) {
    state.p2.y = Math.max(40, state.p2.y - PADDLE_SPEED);
  }
  if (keys.ArrowDown) {
    state.p2.y = Math.min(canvasHeight - 40, state.p2.y + PADDLE_SPEED);
  }
}

function moveBall(state: LocalGameState, canvas: HTMLCanvasElement) {
  state.ball.x += state.ball.vx;
  state.ball.y += state.ball.vy;
  if (state.ball.y <= 8 || state.ball.y >= canvas.height - 8) {
    state.ball.vy *= -1;
  }
}

function handlePaddleCollisions(state: LocalGameState, canvasWidth: number) {
  if (hitsLeftPaddle(state)) {
    state.ball.vx = Math.abs(state.ball.vx) * 1.02;
    state.ball.vy += (state.ball.y - state.p1.y) * 0.04;
  }
  if (hitsRightPaddle(state, canvasWidth)) {
    state.ball.vx = -Math.abs(state.ball.vx) * 1.02;
    state.ball.vy += (state.ball.y - state.p2.y) * 0.04;
  }
}

function hitsLeftPaddle(state: LocalGameState): boolean {
  if (state.ball.x < 10 || state.ball.x > 22) return false;
  return Math.abs(state.ball.y - state.p1.y) <= 40;
}

function hitsRightPaddle(state: LocalGameState, canvasWidth: number): boolean {
  if (state.ball.x < canvasWidth - 22 || state.ball.x > canvasWidth - 10) {
    return false;
  }
  return Math.abs(state.ball.y - state.p2.y) <= 40;
}

function canAnimateLocalGame(mode: PongMode, namesReady: boolean): boolean {
  if (mode === 'online') return false;
  return mode !== 'local' || namesReady;
}

function shouldStartLocalLoop(
  mode: PongMode,
  gameOver: boolean,
  namesReady: boolean,
): boolean {
  if (gameOver) return false;
  return canAnimateLocalGame(mode, namesReady);
}

function updateFrameClock(
  nowMs: number,
  lastFrameTsRef: { current: number | null },
): number {
  if (lastFrameTsRef.current === null) {
    lastFrameTsRef.current = nowMs;
  }
  let deltaMs = nowMs - lastFrameTsRef.current;
  lastFrameTsRef.current = nowMs;
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    deltaMs = 0;
  }
  return Math.min(deltaMs, 250);
}

function runSimulationSteps(
  canvas: HTMLCanvasElement,
  accumulatorRef: { current: number },
  gameOverRef: { current: boolean },
  simulateStep: (canvas: HTMLCanvasElement) => void,
) {
  let steps = 0;
  while (
    !gameOverRef.current
    && accumulatorRef.current >= LOCAL_STEP_MS
    && steps < LOCAL_MAX_CATCHUP_STEPS
  ) {
    simulateStep(canvas);
    accumulatorRef.current -= LOCAL_STEP_MS;
    steps += 1;
  }
  if (steps >= LOCAL_MAX_CATCHUP_STEPS) {
    accumulatorRef.current = 0;
  }
}

function resetFrameClock(
  lastFrameTsRef: { current: number | null },
  accumulatorRef: { current: number },
) {
  lastFrameTsRef.current = null;
  accumulatorRef.current = 0;
}

function shouldSaveMatch(
  gameOver: boolean,
  mode: PongMode,
  gameStartTime: number | null,
  alreadySaved: boolean,
): gameStartTime is number {
  if (!gameOver || alreadySaved) return false;
  if (mode === 'online') return false;
  return gameStartTime !== null;
}

async function saveLocalMatch({
  mode,
  score,
  gameStartTime,
  localPlayerNames,
}: {
  mode: PongMode;
  score: { p1: number; p2: number };
  gameStartTime: number;
  localPlayerNames: LocalPlayerNames;
}) {
  try {
    await createLocalMatch({
      game_type: 'pong',
      game_mode: 'pvp',
      winner: score.p1 >= WIN_SCORE ? 'X' : 'O',
      duration_seconds: Math.round((Date.now() - gameStartTime) / 1000),
      player1_score: score.p1,
      player2_score: score.p2,
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
  } catch {}
}
