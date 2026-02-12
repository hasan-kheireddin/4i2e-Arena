# =============================================================================
# Games — Pong AI
# =============================================================================
# AI opponents for the Pong game with three difficulty levels.
#
# All AI players use the same interface as human players: they produce
# a paddle direction ("up", "down", "stop") that is fed into the engine
# via ``engine.handle_input(slot, direction)``.
#
# Difficulty levels:
#   - Easy (reactive):    Follows the ball's current Y with a reaction
#                         delay and intentional inaccuracy.
#   - Medium (predictive): Predicts where the ball will arrive and moves
#                          there with slight error margin.
#   - Hard (perfect):     Predicts the exact landing position including
#                          wall bounces, reacts instantly with no error.
#
# Usage:
#   ai = PongAI(difficulty="easy", player_slot=2)
#   direction = ai.compute_move(engine)
#   engine.handle_input(ai.player_slot, direction)
# =============================================================================

from __future__ import annotations

import enum
import random

from apps.games.pong_engine import (
    BALL_RADIUS,
    PADDLE_HEIGHT,
    PongEngine,
)


# ---------------------------------------------------------------------------
# Difficulty
# ---------------------------------------------------------------------------

class AIDifficulty(str, enum.Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


# ---------------------------------------------------------------------------
# Tuning constants per difficulty
# ---------------------------------------------------------------------------

# How many ticks between AI "reactions" (lower = faster)
REACTION_INTERVALS = {
    AIDifficulty.EASY: 15,      # reacts every 15 ticks (~4 Hz)
    AIDifficulty.MEDIUM: 5,     # reacts every 5 ticks (~12 Hz)
    AIDifficulty.HARD: 1,       # reacts every tick (60 Hz)
}

# Maximum random offset added to the target Y (in game units)
AIM_ERROR = {
    AIDifficulty.EASY: PADDLE_HEIGHT * 1.5,    # large miss zone
    AIDifficulty.MEDIUM: PADDLE_HEIGHT * 0.3,   # small miss zone
    AIDifficulty.HARD: 0.0,                     # no error
}

# Dead zone: don't move if paddle is within this distance of target
DEAD_ZONE = {
    AIDifficulty.EASY: PADDLE_HEIGHT * 0.4,
    AIDifficulty.MEDIUM: PADDLE_HEIGHT * 0.15,
    AIDifficulty.HARD: 2.0,
}


# ---------------------------------------------------------------------------
# PongAI
# ---------------------------------------------------------------------------

class PongAI:
    """
    AI opponent for Pong. Produces paddle directions using the same
    interface as human players.

    Parameters
    ----------
    difficulty   : str or AIDifficulty — "easy", "medium", or "hard"
    player_slot  : int — 1 (left paddle) or 2 (right paddle)
    """

    def __init__(
        self,
        difficulty: str = "medium",
        player_slot: int = 2,
    ) -> None:
        if player_slot not in (1, 2):
            raise ValueError(f"player_slot must be 1 or 2, got {player_slot}")
        if isinstance(difficulty, str):
            difficulty = AIDifficulty(difficulty)
        self.difficulty: AIDifficulty = difficulty
        self.player_slot: int = player_slot

        # Internal state
        self._tick_counter: int = 0
        self._cached_direction: str = "stop"
        self._cached_target_y: float | None = None
        self._aim_offset: float = 0.0
        self._ball_was_approaching: bool = False

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def compute_move(self, engine: PongEngine) -> str:
        """
        Compute the paddle direction for the current tick.

        Returns "up", "down", or "stop".
        """
        self._tick_counter += 1
        interval = REACTION_INTERVALS[self.difficulty]

        # Between reaction intervals, do a quick overshoot guard:
        # if the paddle has passed the last target, stop early instead
        # of holding direction for the full interval and overshooting.
        if self._tick_counter % interval != 0:
            if self._cached_target_y is not None and self._cached_direction != "stop":
                paddle = self._get_my_paddle(engine)
                dead = DEAD_ZONE[self.difficulty]
                past_target = (
                    (self._cached_direction == "down" and paddle.y >= self._cached_target_y - dead)
                    or (self._cached_direction == "up" and paddle.y <= self._cached_target_y + dead)
                )
                if past_target:
                    self._cached_direction = "stop"
            return self._cached_direction

        # Determine target Y
        target_y = self._get_target_y(engine)

        # Re-roll aim offset only when the ball starts a new approach.
        # Clear it when the ball moves away so the AI returns cleanly
        # to centre without a stale offset pulling it off.
        approaching = not self._ball_moving_away(engine)
        if approaching and not self._ball_was_approaching:
            error_range = AIM_ERROR[self.difficulty]
            self._aim_offset = (
                random.uniform(-error_range, error_range)
                if error_range > 0
                else 0.0
            )
        elif not approaching:
            self._aim_offset = 0.0
            self._cached_target_y = None
        self._ball_was_approaching = approaching

        target_y += self._aim_offset
        self._cached_target_y = target_y

        # Compute direction
        paddle = self._get_my_paddle(engine)
        dead = DEAD_ZONE[self.difficulty]

        if paddle.y < target_y - dead:
            self._cached_direction = "down"
        elif paddle.y > target_y + dead:
            self._cached_direction = "up"
        else:
            self._cached_direction = "stop"

        return self._cached_direction

    # ------------------------------------------------------------------
    # Target computation strategies
    # ------------------------------------------------------------------

    def _get_target_y(self, engine: PongEngine) -> float:
        """Dispatch to the difficulty-specific targeting strategy."""
        if self.difficulty == AIDifficulty.EASY:
            return self._target_reactive(engine)
        elif self.difficulty == AIDifficulty.MEDIUM:
            return self._target_predictive(engine)
        else:
            return self._target_perfect(engine)

    def _target_reactive(self, engine: PongEngine) -> float:
        """
        Easy: simply follow the ball's current Y position.
        The reaction delay and aim error make it beatable.
        """
        return engine.ball.y

    def _target_predictive(self, engine: PongEngine) -> float:
        """
        Medium: linear extrapolation of the ball's trajectory to the
        paddle's X position with a single-bounce reflection.  This is
        better than a raw clamp (which pins the prediction to the wall)
        but still imperfect for multi-bounce trajectories.
        """
        ball = engine.ball
        paddle = self._get_my_paddle(engine)

        # If ball is moving away from us, return to centre
        if self._ball_moving_away(engine):
            return engine.field_height / 2

        # Simple linear prediction
        dx = abs(paddle.x - ball.x)
        if abs(ball.vx) < 0.01:
            return ball.y

        ticks_to_arrive = dx / abs(ball.vx)
        predicted_y = ball.y + ball.vy * ticks_to_arrive

        # Single-bounce reflection instead of a hard clamp.
        # "Fold" the prediction back into the field so the AI aims at
        # a reflected point rather than hugging the wall.
        low = BALL_RADIUS
        high = engine.field_height - BALL_RADIUS
        span = high - low
        if span > 0:
            predicted_y = self._reflect(predicted_y, low, high, span)
        return predicted_y

    def _target_perfect(self, engine: PongEngine) -> float:
        """
        Hard: predict the exact Y position where the ball will arrive,
        simulating wall bounces.
        """
        ball = engine.ball
        paddle = self._get_my_paddle(engine)

        # If ball is moving away, return to centre for optimal positioning
        if self._ball_moving_away(engine):
            return engine.field_height / 2

        if abs(ball.vx) < 0.01:
            return ball.y

        # Simulate ball trajectory with wall bounces.
        # Safety cap prevents infinite loops if vx is unexpectedly tiny
        # or the simulation gets stuck due to floating-point edge cases.
        max_steps = int(engine.field_width / max(abs(ball.vx), 0.1)) + 200

        sim_x = ball.x
        sim_y = ball.y
        sim_vx = ball.vx
        sim_vy = ball.vy
        target_x = paddle.x

        steps = 0
        if self.player_slot == 1:
            # Left paddle — ball must be moving left (vx < 0)
            while sim_x > target_x and steps < max_steps:
                sim_x += sim_vx
                sim_y += sim_vy
                # Bounce off top/bottom walls
                if sim_y - BALL_RADIUS <= 0:
                    sim_y = BALL_RADIUS
                    sim_vy = abs(sim_vy)
                elif sim_y + BALL_RADIUS >= engine.field_height:
                    sim_y = engine.field_height - BALL_RADIUS
                    sim_vy = -abs(sim_vy)
                steps += 1
        else:
            # Right paddle — ball must be moving right (vx > 0)
            while sim_x < target_x and steps < max_steps:
                sim_x += sim_vx
                sim_y += sim_vy
                if sim_y - BALL_RADIUS <= 0:
                    sim_y = BALL_RADIUS
                    sim_vy = abs(sim_vy)
                elif sim_y + BALL_RADIUS >= engine.field_height:
                    sim_y = engine.field_height - BALL_RADIUS
                    sim_vy = -abs(sim_vy)
                steps += 1

        # If we hit the safety cap the simulation didn't converge;
        # fall back to the ball's current Y rather than a potentially
        # mid-trajectory sim_y that could send the paddle off-course.
        if steps >= max_steps:
            return ball.y

        return sim_y

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get_my_paddle(self, engine: PongEngine):
        """Return the paddle for this AI's slot."""
        if self.player_slot == 1:
            return engine.player1.paddle
        return engine.player2.paddle

    def _ball_moving_away(self, engine: PongEngine) -> bool:
        """Check if the ball is moving away from this AI's paddle."""
        if self.player_slot == 1:
            return engine.ball.vx > 0  # moving right = away from left paddle
        return engine.ball.vx < 0  # moving left = away from right paddle

    @staticmethod
    def _reflect(y: float, low: float, high: float, span: float) -> float:
        """Reflect *y* into [low, high] using a zigzag (triangle-wave) fold."""
        # Shift so that low == 0, then fold over [0, span].
        y -= low
        # How many half-spans away are we?  Use modular arithmetic so
        # arbitrarily large overshoots are handled correctly.
        period = span * 2
        y = y % period          # now in [0, 2·span)
        if y > span:
            y = period - y      # mirror the second half back
        return y + low

    def reset(self) -> None:
        """Reset AI state (e.g. for a new game)."""
        self._tick_counter = 0
        self._cached_direction = "stop"
        self._cached_target_y = None
        self._aim_offset = 0.0
        self._ball_was_approaching = False

    def __repr__(self) -> str:
        return (
            f"PongAI(difficulty={self.difficulty.value}, "
            f"slot={self.player_slot})"
        )
