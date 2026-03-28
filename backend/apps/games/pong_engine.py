# =============================================================================
# Games — Pong Engine
# =============================================================================
# Server-authoritative Pong game engine.
#
# The engine runs at a fixed tick rate (default 60 Hz). All physics,
# collision detection, and scoring happen server-side. Clients send
# paddle-movement inputs and receive the authoritative game state.
#
# Coordinate system:
#   - Origin (0, 0) is the top-left corner of the playing field.
#   - X increases to the right, Y increases downward.
#   - The field spans [0, FIELD_WIDTH] × [0, FIELD_HEIGHT].
#   - Player 1 paddle is on the left  (x = PADDLE_OFFSET).
#   - Player 2 paddle is on the right (x = FIELD_WIDTH - PADDLE_OFFSET).
#
# Units are abstract "game units" — the frontend maps them to pixels/3D.
# =============================================================================

from __future__ import annotations
import enum
import math
import random
import time
from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Constants — tweak these to adjust game feel
# ---------------------------------------------------------------------------

# Playing field dimensions
FIELD_WIDTH: float = 800.0
FIELD_HEIGHT: float = 600.0

# Paddle
PADDLE_WIDTH: float = 12.0
PADDLE_HEIGHT: float = 80.0
PADDLE_OFFSET: float = 20.0  # distance from field edge to paddle centre-x
PADDLE_SPEED: float = 8.0  # units per tick

# Ball
BALL_RADIUS: float = 8.0
BALL_INITIAL_SPEED: float = 5.0  # units per tick
BALL_MAX_SPEED: float = 12.0
BALL_SPEED_INCREMENT: float = 0.3  # added after each paddle hit

# Scoring
WIN_SCORE: int = 11

# Serve
SERVE_DELAY_TICKS: int = 60  # 1 second at 60 fps

# Angle limits (radians) — max deflection angle off a paddle
MAX_BOUNCE_ANGLE: float = math.radians(60)  # ±60°


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

class GameStatus(str, enum.Enum):
    WAITING = "waiting"
    COUNTDOWN = "countdown"
    PLAYING = "playing"
    FINISHED = "finished"


class PaddleDirection(str, enum.Enum):
    UP = "up"
    DOWN = "down"
    STOP = "stop"


@dataclass
class Ball:
    x: float = FIELD_WIDTH / 2
    y: float = FIELD_HEIGHT / 2
    vx: float = 0.0
    vy: float = 0.0
    speed: float = BALL_INITIAL_SPEED

    def to_dict(self) -> dict:
        return {
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "vx": round(self.vx, 2),
            "vy": round(self.vy, 2),
        }


@dataclass
class Paddle:
    x: float = 0.0
    y: float = FIELD_HEIGHT / 2
    width: float = PADDLE_WIDTH
    height: float = PADDLE_HEIGHT
    direction: PaddleDirection = PaddleDirection.STOP

    @property
    def top(self) -> float:
        return self.y - self.height / 2

    @property
    def bottom(self) -> float:
        return self.y + self.height / 2

    @property
    def left(self) -> float:
        return self.x - self.width / 2

    @property
    def right(self) -> float:
        return self.x + self.width / 2

    def to_dict(self) -> dict:
        return {
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "width": self.width,
            "height": self.height,
        }


@dataclass
class PlayerState:
    score: int = 0
    paddle: Paddle = field(default_factory=Paddle)
    player_id: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "score": self.score,
            "paddle": self.paddle.to_dict(),
            "player_id": self.player_id,
        }


# ---------------------------------------------------------------------------
# PongEngine
# ---------------------------------------------------------------------------

class PongEngine:
    """
    Server-authoritative Pong game engine.

    Usage
    -----
    >>> engine = PongEngine()
    >>> engine.set_player("player-1", 1)
    >>> engine.set_player("player-2", 2)
    >>> engine.start()
    >>> while engine.status == GameStatus.PLAYING:
    ...     engine.tick()
    ...     state = engine.get_state()
    """

    def __init__(
        self,
        field_width: float = FIELD_WIDTH,
        field_height: float = FIELD_HEIGHT,
        win_score: int = WIN_SCORE,
    ):
        self.field_width = field_width
        self.field_height = field_height
        self.win_score = win_score

        # Ball
        self.ball = Ball(x=field_width / 2, y=field_height / 2)

        # Players
        self.player1 = PlayerState(
            paddle=Paddle(x=PADDLE_OFFSET, y=field_height / 2)
        )
        self.player2 = PlayerState(
            paddle=Paddle(x=field_width - PADDLE_OFFSET, y=field_height / 2)
        )

        # Game state
        self.status: GameStatus = GameStatus.WAITING
        self.tick_count: int = 0
        self.serve_cooldown: int = 0
        self.winner: Optional[int] = None  # 1 or 2
        self.last_scorer: Optional[int] = None

        # Timestamps (for analytics / match recording)
        self.started_at: Optional[float] = None
        self.finished_at: Optional[float] = None

    # ------------------------------------------------------------------
    # Player management
    # ------------------------------------------------------------------

    def set_player(self, player_id: str, slot: int) -> None:
        """Assign a player id to slot 1 or 2."""
        if slot == 1:
            self.player1.player_id = player_id
        elif slot == 2:
            self.player2.player_id = player_id
        else:
            raise ValueError(f"Invalid slot {slot}. Must be 1 or 2.")

    # ------------------------------------------------------------------
    # Game lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Start the game."""
        if self.status == GameStatus.FINISHED:
            raise RuntimeError("Cannot start a finished game.")

        if self.status == GameStatus.WAITING:
            self.status = GameStatus.COUNTDOWN
            self.serve_cooldown = SERVE_DELAY_TICKS
            self._reset_ball()
            if self.started_at is None:
                self.started_at = time.time()

    def forfeit(self, player_slot: int) -> None:
        """A player forfeits — the other player wins."""
        self.winner = 2 if player_slot == 1 else 1
        self.status = GameStatus.FINISHED
        self.finished_at = time.time()

    # ------------------------------------------------------------------
    # Input handling
    # ------------------------------------------------------------------

    def handle_input(self, player_slot: int, direction: str) -> None:
        """
        Process paddle-movement input from a player.

        Parameters
        ----------
        player_slot : int — 1 or 2
        direction   : str — "up", "down", or "stop"
        """
        try:
            pd = PaddleDirection(direction)
        except ValueError:
            return  # silently ignore invalid directions

        paddle = self._get_paddle(player_slot)
        if paddle is not None:
            paddle.direction = pd

    # ------------------------------------------------------------------
    # Main tick
    # ------------------------------------------------------------------

    def tick(self) -> dict:
        """
        Advance the simulation by one tick.

        Returns the current game state dict (same as ``get_state()``).
        """
        self.tick_count += 1

        if self.status == GameStatus.COUNTDOWN:
            self.serve_cooldown -= 1
            if self.serve_cooldown <= 0:
                self.status = GameStatus.PLAYING
                self._serve()
            return self.get_state()

        if self.status != GameStatus.PLAYING:
            return self.get_state()

        # 1. Move paddles
        self._move_paddle(self.player1.paddle)
        self._move_paddle(self.player2.paddle)

        # 2. Move ball
        self._move_ball()

        # 3. Check collisions
        self._check_wall_collision()
        self._check_paddle_collision(self.player1.paddle, is_left=True)
        self._check_paddle_collision(self.player2.paddle, is_left=False)

        # 4. Check scoring
        self._check_scoring()

        return self.get_state()

    # ------------------------------------------------------------------
    # State serialisation
    # ------------------------------------------------------------------

    def get_state(self) -> dict:
        """Return the full game state as a JSON-serialisable dict."""
        return {
            "status": self.status.value,
            "tick": self.tick_count,
            "ball": self.ball.to_dict(),
            "player1": self.player1.to_dict(),
            "player2": self.player2.to_dict(),
            "field": {
                "width": self.field_width,
                "height": self.field_height,
            },
            "winner": self.winner,
            "serve_cooldown": self.serve_cooldown,
        }

    # ------------------------------------------------------------------
    # Private: paddle movement
    # ------------------------------------------------------------------

    def _get_paddle(self, player_slot: int) -> Optional[Paddle]:
        if player_slot == 1:
            return self.player1.paddle
        elif player_slot == 2:
            return self.player2.paddle
        return None

    def _move_paddle(self, paddle: Paddle) -> None:
        """Move a paddle according to its current direction, clamped to the field."""
        if paddle.direction == PaddleDirection.UP:
            paddle.y -= PADDLE_SPEED
        elif paddle.direction == PaddleDirection.DOWN:
            paddle.y += PADDLE_SPEED

        # Clamp so the paddle stays fully within the field
        half = paddle.height / 2
        paddle.y = max(half, min(self.field_height - half, paddle.y))

    # ------------------------------------------------------------------
    # Private: ball movement
    # ------------------------------------------------------------------

    def _move_ball(self) -> None:
        """Advance the ball by its velocity."""
        self.ball.x += self.ball.vx
        self.ball.y += self.ball.vy

    # ------------------------------------------------------------------
    # Private: wall collision
    # ------------------------------------------------------------------

    def _check_wall_collision(self) -> None:
        """Bounce the ball off the top and bottom walls."""
        r = BALL_RADIUS

        if self.ball.y - r <= 0:
            self.ball.y = r
            self.ball.vy = abs(self.ball.vy)
        elif self.ball.y + r >= self.field_height:
            self.ball.y = self.field_height - r
            self.ball.vy = -abs(self.ball.vy)

    # ------------------------------------------------------------------
    # Private: paddle collision
    # ------------------------------------------------------------------

    def _check_paddle_collision(self, paddle: Paddle, *, is_left: bool) -> None:
        """
        Detect and resolve ball–paddle collision.

        The ball's outgoing angle depends on *where* it hits the paddle:
        - Centre hit → nearly horizontal return.
        - Edge hit   → steep angle (up to ±MAX_BOUNCE_ANGLE).

        Each hit also increases the ball speed slightly (up to BALL_MAX_SPEED).
        """
        r = BALL_RADIUS

        # Quick rejection — ball not near this paddle's x-zone
        if is_left:
            if self.ball.x - r > paddle.right:
                return
            if self.ball.vx > 0:  # moving away
                return
        else:
            if self.ball.x + r < paddle.left:
                return
            if self.ball.vx < 0:  # moving away
                return

        # Y overlap check
        if self.ball.y + r < paddle.top or self.ball.y - r > paddle.bottom:
            return

        # --- Collision confirmed ---

        # Compute hit position normalised to [-1, 1]
        #   -1 = top edge of paddle, 0 = center, +1 = bottom edge
        relative_hit = (self.ball.y - paddle.y) / (paddle.height / 2)
        relative_hit = max(-1.0, min(1.0, relative_hit))

        # Compute bounce angle
        bounce_angle = relative_hit * MAX_BOUNCE_ANGLE

        # Increase speed
        self.ball.speed = min(self.ball.speed + BALL_SPEED_INCREMENT, BALL_MAX_SPEED)

        # Compute new velocity
        direction = 1.0 if is_left else -1.0
        self.ball.vx = direction * self.ball.speed * math.cos(bounce_angle)
        self.ball.vy = self.ball.speed * math.sin(bounce_angle)

        # Push ball out of paddle to prevent double-collision
        if is_left:
            self.ball.x = paddle.right + r
        else:
            self.ball.x = paddle.left - r

    # ------------------------------------------------------------------
    # Private: scoring
    # ------------------------------------------------------------------

    def _check_scoring(self) -> None:
        """
        Detect if the ball has passed a paddle and award a point.
        """
        scored = False

        if self.ball.x - BALL_RADIUS <= 0:
            # Ball past left edge → Player 2 scores
            self.player2.score += 1
            self.last_scorer = 2
            scored = True
        elif self.ball.x + BALL_RADIUS >= self.field_width:
            # Ball past right edge → Player 1 scores
            self.player1.score += 1
            self.last_scorer = 1
            scored = True

        if not scored:
            return

        # Check for win
        if self.player1.score >= self.win_score:
            self.winner = 1
            self.status = GameStatus.FINISHED
            self.finished_at = time.time()
        elif self.player2.score >= self.win_score:
            self.winner = 2
            self.status = GameStatus.FINISHED
            self.finished_at = time.time()
        else:
            # Reset for next serve — scored-on player serves
            self._reset_ball()
            self.status = GameStatus.COUNTDOWN
            self.serve_cooldown = SERVE_DELAY_TICKS

    # ------------------------------------------------------------------
    # Private: serve / reset
    # ------------------------------------------------------------------

    def _reset_ball(self) -> None:
        """Place the ball at centre and zero its velocity."""
        self.ball.x = self.field_width / 2
        self.ball.y = self.field_height / 2
        self.ball.speed = BALL_INITIAL_SPEED
        self.ball.vx = 0.0
        self.ball.vy = 0.0

    def _serve(self) -> None:
        """
        Launch the ball in a random-ish direction toward the given side.
        Called when countdown reaches zero.
        """
        # Determine direction: serve to the side that was scored on,
        # or random if first serve
        if self.last_scorer is not None:
            direction = 1 if self.last_scorer == 2 else -1
        else:
            direction = random.choice([-1, 1])

        # Random angle between -30° and +30°
        angle = random.uniform(-math.pi / 6, math.pi / 6)

        self.ball.speed = BALL_INITIAL_SPEED
        self.ball.vx = direction * self.ball.speed * math.cos(angle)
        self.ball.vy = self.ball.speed * math.sin(angle)

    # ------------------------------------------------------------------
    # Convenience
    # ------------------------------------------------------------------

    @property
    def duration(self) -> Optional[float]:
        """Duration of the game in seconds, or None if not started."""
        if self.started_at is None:
            return None
        end = self.finished_at or time.time()
        return end - self.started_at

    def __repr__(self) -> str:
        return (
            f"PongEngine("
            f"status={self.status.value}, "
            f"score={self.player1.score}-{self.player2.score}, "
            f"tick={self.tick_count})"
        )
