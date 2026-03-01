from __future__ import annotations
import math
import uuid
from typing import Optional
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


class TournamentStatus(models.TextChoices):
    PENDING = "pending", "Pending"          # accepting registrations
    IN_PROGRESS = "in_progress", "In Progress"  # bracket generated, games live
    COMPLETED = "completed", "Completed"    # winner declared
    CANCELLED = "cancelled", "Cancelled"    # manually cancelled


class GameType(models.TextChoices):
    PONG = "pong", "Pong"
    TICTACTOE = "tictactoe", "Tic-Tac-Toe"


class RoundStatus(models.TextChoices):
    PENDING = "pending", "Pending"          # waiting for players / not started
    IN_PROGRESS = "in_progress", "In Progress"  # match is live
    COMPLETED = "completed", "Completed"    # match finished, winner set
    BYE = "bye", "Bye"                      # auto-advance (no opponent)

class Tournament(models.Model):
    """
    Represents a single-elimination tournament.

    Lifecycle:
      1. Creator opens a tournament (status=PENDING).
      2. Players register via TournamentEntry.
      3. Creator (or system) starts the tournament → bracket generated,
         status → IN_PROGRESS.
      4. Matches play out round by round.
      5. When the final round is complete → status=COMPLETED, winner set.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default="")
    game_type = models.CharField(
        max_length=20,
        choices=GameType.choices,
        default=GameType.PONG,
    )
    status = models.CharField(
        max_length=20,
        choices=TournamentStatus.choices,
        default=TournamentStatus.PENDING,
        db_index=True,
    )
    max_participants = models.PositiveIntegerField(
        default=8,
        validators=[MinValueValidator(4), MaxValueValidator(32)],
        help_text="Must be a power of 2 (4, 8, 16, 32).",
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_tournaments",
    )
    winner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="won_tournaments",
    )

    current_round = models.PositiveIntegerField(default=0)
    total_rounds = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tournaments"
        ordering = ["-created_at"]
        verbose_name = "Tournament"
        verbose_name_plural = "Tournaments"

    def __str__(self) -> str:
        return f"{self.name} ({self.get_status_display()})"


    @property
    def participant_count(self) -> int:
        return self.entries.count()

    @property
    def is_full(self) -> bool:
        return self.participant_count >= self.max_participants

    @property
    def is_joinable(self) -> bool:
        return self.status == TournamentStatus.PENDING and not self.is_full

    def clean(self):
        """Validate max_participants is a power of 2."""
        from django.core.exceptions import ValidationError

        if self.max_participants and not _is_power_of_two(self.max_participants):
            raise ValidationError(
                {"max_participants": "Must be a power of 2 (4, 8, 16, 32)."}
            )


    def generate_bracket(self) -> list["TournamentRound"]:
        """
        Build the full single-elimination bracket.

        Returns the list of created TournamentRound objects.
        Raises ValueError if the tournament cannot be started.
        """
        if self.status != TournamentStatus.PENDING:
            raise ValueError("Tournament has already been started or completed.")

        participant_count = self.participant_count
        if participant_count < 2:
            raise ValueError("Need at least 2 participants to start.")

        # Pad to next power of 2
        bracket_size = _next_power_of_two(participant_count)
        total_rounds = int(math.log2(bracket_size))

        # Fetch seeded players (order by registration time → earlier = higher seed)
        entries = list(
            self.entries.order_by("registered_at").values_list("player_id", flat=True)
        )

        # Pad with None for byes
        while len(entries) < bracket_size:
            entries.append(None)

        # Seed ordering: standard tournament seeding
        seeded = _standard_seed_order(entries)

        # Create all rounds for all bracket levels
        rounds_created: list[TournamentRound] = []
        round_objects_by_level: dict[int, list[TournamentRound]] = {}

        # --- First round (level 1) ----------------------------------------
        first_round_matches: list[TournamentRound] = []
        for i in range(0, bracket_size, 2):
            p1 = seeded[i]
            p2 = seeded[i + 1]

            match = TournamentRound(
                tournament=self,
                round_number=1,
                match_index=i // 2,
                player1_id=p1,
                player2_id=p2,
            )

            # Handle byes
            if p1 is None and p2 is None:
                match.status = RoundStatus.BYE
            elif p1 is None:
                match.status = RoundStatus.BYE
                match.winner_id = p2
            elif p2 is None:
                match.status = RoundStatus.BYE
                match.winner_id = p1
            else:
                match.status = RoundStatus.PENDING

            first_round_matches.append(match)

        TournamentRound.objects.bulk_create(first_round_matches)
        rounds_created.extend(first_round_matches)
        round_objects_by_level[1] = first_round_matches

        # --- Subsequent rounds (levels 2 .. total_rounds) ------------------
        for level in range(2, total_rounds + 1):
            prev_matches = round_objects_by_level[level - 1]
            current_matches: list[TournamentRound] = []
            for j in range(0, len(prev_matches), 2):
                match = TournamentRound(
                    tournament=self,
                    round_number=level,
                    match_index=j // 2,
                    status=RoundStatus.PENDING,
                )
                current_matches.append(match)

            TournamentRound.objects.bulk_create(current_matches)

            # Refresh from DB to get PKs
            current_matches = list(
                TournamentRound.objects.filter(
                    tournament=self, round_number=level
                ).order_by("match_index")
            )

            rounds_created.extend(current_matches)
            round_objects_by_level[level] = current_matches

        # --- Update tournament state ---------------------------------------
        self.status = TournamentStatus.IN_PROGRESS
        self.current_round = 1
        self.total_rounds = total_rounds
        self.started_at = timezone.now()
        self.save(update_fields=[
            "status", "current_round", "total_rounds", "started_at", "updated_at",
        ])

        # Auto-advance byes in round 1
        self._advance_byes(round_objects_by_level)

        return rounds_created

    def _advance_byes(
        self, round_objects_by_level: dict[int, list["TournamentRound"]]
    ) -> None:
        """Propagate bye winners into the next round."""
        if 1 not in round_objects_by_level or 2 not in round_objects_by_level:
            return

        first_round = round_objects_by_level[1]
        second_round = round_objects_by_level[2]

        for i, match in enumerate(first_round):
            if match.status == RoundStatus.BYE and match.winner_id:
                next_match = second_round[i // 2]
                if i % 2 == 0:
                    next_match.player1_id = match.winner_id
                else:
                    next_match.player2_id = match.winner_id
                next_match.save(update_fields=["player1_id", "player2_id"])

    def advance_winner(self, completed_round: "TournamentRound") -> Optional["TournamentRound"]:
        """
        After a TournamentRound is completed, push its winner into the
        next round. Returns the next TournamentRound (or None if this
        was the final).
        """
        if not completed_round.winner_id:
            raise ValueError("Round has no winner yet.")

        next_round_number = completed_round.round_number + 1

        # Final round → tournament completed
        if next_round_number > self.total_rounds:
            self.winner_id = completed_round.winner_id
            self.status = TournamentStatus.COMPLETED
            self.completed_at = timezone.now()
            self.save(update_fields=["winner_id", "status", "completed_at", "updated_at"])
            return None

        # Locate next match
        next_match_index = completed_round.match_index // 2
        try:
            next_match = TournamentRound.objects.get(
                tournament=self,
                round_number=next_round_number,
                match_index=next_match_index,
            )
        except TournamentRound.DoesNotExist:
            raise ValueError(
                f"Next round not found: round={next_round_number}, index={next_match_index}"
            )

        # Slot winner into correct position
        if completed_round.match_index % 2 == 0:
            next_match.player1_id = completed_round.winner_id
        else:
            next_match.player2_id = completed_round.winner_id
        next_match.save(update_fields=["player1_id", "player2_id"])

        # Check if current round is fully done → bump current_round
        pending_in_round = TournamentRound.objects.filter(
            tournament=self,
            round_number=completed_round.round_number,
        ).exclude(
            status__in=[RoundStatus.COMPLETED, RoundStatus.BYE],
        ).count()

        if pending_in_round == 0 and self.current_round == completed_round.round_number:
            self.current_round = next_round_number
            self.save(update_fields=["current_round", "updated_at"])

        return next_match


class TournamentEntry(models.Model):
    """A player's registration in a tournament."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tournament = models.ForeignKey(
        Tournament,
        on_delete=models.CASCADE,
        related_name="entries",
    )
    player = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tournament_entries",
    )
    registered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "tournament_entries"
        unique_together = [("tournament", "player")]
        ordering = ["registered_at"]
        verbose_name = "Tournament Entry"
        verbose_name_plural = "Tournament Entries"

    def __str__(self) -> str:
        return f"{self.player} → {self.tournament.name}"


class TournamentRound(models.Model):
    """
    A single match slot inside a tournament bracket.

    round_number  = 1 for first round, 2 for quarter-finals, etc.
    match_index   = 0-based position within that round.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tournament = models.ForeignKey(
        Tournament,
        on_delete=models.CASCADE,
        related_name="rounds",
    )
    round_number = models.PositiveIntegerField(db_index=True)
    match_index = models.PositiveIntegerField()

    player1 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tournament_rounds_as_p1",
    )
    player2 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tournament_rounds_as_p2",
    )
    winner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tournament_rounds_won",
    )
    status = models.CharField(
        max_length=20,
        choices=RoundStatus.choices,
        default=RoundStatus.PENDING,
        db_index=True,
    )
    # Optional link to an actual game session (to be connected later)
    game_session_id = models.UUIDField(null=True, blank=True)

    player1_score = models.PositiveIntegerField(default=0)
    player2_score = models.PositiveIntegerField(default=0)

    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "tournament_rounds"
        unique_together = [("tournament", "round_number", "match_index")]
        ordering = ["round_number", "match_index"]
        verbose_name = "Tournament Round"
        verbose_name_plural = "Tournament Rounds"

    def __str__(self) -> str:
        p1 = getattr(self.player1, "username", "TBD")
        p2 = getattr(self.player2, "username", "TBD")
        return f"R{self.round_number}-M{self.match_index}: {p1} vs {p2}"

    def complete(self, winner_id: uuid.UUID, p1_score: int = 0, p2_score: int = 0) -> None:
        """Mark this round as completed with the given winner."""
        self.winner_id = winner_id
        self.player1_score = p1_score
        self.player2_score = p2_score
        self.status = RoundStatus.COMPLETED
        self.completed_at = timezone.now()
        self.save(update_fields=[
            "winner_id", "player1_score", "player2_score",
            "status", "completed_at",
        ])


def _is_power_of_two(n: int) -> bool:
    return n > 0 and (n & (n - 1)) == 0


def _next_power_of_two(n: int) -> int:
    """Return the smallest power of 2 >= n."""
    if n <= 0:
        return 1
    return 1 << (n - 1).bit_length()


def _standard_seed_order(players: list) -> list:
    """
    Arrange players in standard single-elimination seeding order.

    For 8 players [1,2,3,4,5,6,7,8], the standard bracket seeding is:
    [1,8, 4,5, 2,7, 3,6]  — so seed 1 faces seed 8, etc.

    This uses a recursive algorithm to produce the standard seeding.
    """
    n = len(players)
    if n <= 1:
        return players
    if n == 2:
        return players

    # Build the seed position order for n spots
    positions = _seed_positions(n)
    return [players[p] for p in positions]


def _seed_positions(n: int) -> list[int]:
    """
    Recursively compute standard tournament seed positions.

    For n=2: [0, 1]
    For n=4: [0, 3, 2, 1]  → seed 1 vs 4, seed 3 vs 2
    For n=8: [0, 7, 4, 3, 2, 5, 6, 1]  → seed 1v8, 5v4, 3v6, 7v2
    """
    if n == 2:
        return [0, 1]

    half = n // 2
    prev = _seed_positions(half)

    result: list[int] = []
    for p in prev:
        result.append(p)
        result.append(n - 1 - p)
    return result
