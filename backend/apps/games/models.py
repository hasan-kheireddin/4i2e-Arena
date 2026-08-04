from __future__ import annotations
import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


class GameType(models.TextChoices):
    PONG = "pong", "Pong"
    TICTACTOE = "tictactoe", "Tic-Tac-Toe"


class FinishReason(models.TextChoices):
    SCORE = "score", "Score"
    DRAW = "draw", "Draw"
    FORFEIT = "forfeit", "Forfeit"
    DISCONNECT_FORFEIT = "disconnect_forfeit", "Disconnect Forfeit"
    CANCELED = "canceled", "Canceled"
    SERVER_ERROR = "server_error", "Server Error"


class MatchOutcome(models.TextChoices):
    WIN = "win", "Win"
    LOSS = "loss", "Loss"
    DRAW = "draw", "Draw"


class GameMode(models.TextChoices):
    PVP = "pvp", "Player vs Player"


class Match(models.Model):
    """
    Persistent record of a completed game session.

    One row is created every time a Pong or Tic-Tac-Toe game finishes
    (excluding canceled / server-error games).  Associated ``MatchPlayer``
    rows record per-player details.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    # Link back to the in-memory session identifier
    game_session_id = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="In-memory session ID from GameSession.game_id.",
    )

    game_type = models.CharField(
        max_length=12,
        choices=GameType.choices,
        db_index=True,
    )

    game_mode = models.CharField(
        max_length=12,
        choices=GameMode.choices,
        default=GameMode.PVP,
        db_index=True,
    )

    finish_reason = models.CharField(
        max_length=24,
        choices=FinishReason.choices,
        db_index=True,
    )

    # Winner (nullable for draws)
    winner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="won_matches",
    )

    # Timestamps
    started_at = models.DateTimeField(
        help_text="When the game session began (first tick / first move).",
    )
    finished_at = models.DateTimeField(
        help_text="When the game session ended.",
    )
    duration_seconds = models.FloatField(
        default=0.0,
        help_text="Game duration in seconds (finished_at - started_at).",
    )

    # Scores snapshot (denormalized for quick queries)
    player1_score = models.IntegerField(default=0)
    player2_score = models.IntegerField(default=0)

    # Metadata populated from the engine at game end
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            "Engine-specific metadata: final board state (TTT), "
            "ball speed (Pong), total moves, etc."
        ),
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "matches"
        ordering = ["-finished_at"]
        indexes = [
            models.Index(
                fields=["-finished_at"],
                name="idx_match_finished",
            ),
            models.Index(
                fields=["game_type", "-finished_at"],
                name="idx_match_type_finished",
            ),
            models.Index(
                fields=["game_mode", "-finished_at"],
                name="idx_match_mode_finished",
            ),
        ]
        verbose_name = "Match"
        verbose_name_plural = "Matches"

    def __str__(self) -> str:
        return f"Match {self.game_session_id} ({self.game_type})"


class MatchPlayer(models.Model):
    """
    Records a single player's participation in a match.

    There are typically 2 MatchPlayer rows per match.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    match = models.ForeignKey(
        Match,
        on_delete=models.CASCADE,
        related_name="players",
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="match_participations",
    )

    slot = models.PositiveSmallIntegerField(
        help_text="Player slot in the game (1 or 2).",
    )

    outcome = models.CharField(
        max_length=6,
        choices=MatchOutcome.choices,
        db_index=True,
    )

    score = models.IntegerField(
        default=0,
        help_text="Player's final score (points in Pong, N/A for TTT).",
    )

    xp_earned = models.PositiveIntegerField(
        default=0,
        help_text="XP awarded for this match.",
    )

    class Meta:
        db_table = "match_players"
        unique_together = [("match", "user")]
        ordering = ["slot"]
        indexes = [
            models.Index(
                fields=["user", "match"],
                name="idx_mp_user_match",
            ),
        ]
        verbose_name = "Match Player"
        verbose_name_plural = "Match Players"

    def __str__(self) -> str:
        return f"{self.user_id} in {self.match.game_session_id} (slot {self.slot})"
