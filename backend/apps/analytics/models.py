from __future__ import annotations
import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone

class AchievementCategory(models.TextChoices):
    """Broad grouping for achievements."""
    WINS = "wins", "Wins"
    GAMES = "games", "Games Played"
    STREAKS = "streaks", "Streaks"
    SKILL = "skill", "Skill"
    SOCIAL = "social", "Social"
    TOURNAMENT = "tournament", "Tournament"
    MILESTONE = "milestone", "Milestone"


class AchievementTier(models.TextChoices):
    """Rarity / difficulty tier — drives UI badge colour."""
    BRONZE = "bronze", "Bronze"
    SILVER = "silver", "Silver"
    GOLD = "gold", "Gold"
    PLATINUM = "platinum", "Platinum"

class Achievement(models.Model):
    """
    Static definition of an achievement.

    Achievements are seeded via a management command or data migration.
    The ``key`` field is a unique slug used by the checking logic to
    reference specific achievements without relying on the primary key.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.CharField(
        max_length=60,
        unique=True,
        db_index=True,
        help_text="Unique programmatic identifier (e.g. 'first_win').",
    )
    name = models.CharField(max_length=120)
    description = models.TextField(
        help_text="Player-facing description of how to unlock.",
    )
    category = models.CharField(
        max_length=20,
        choices=AchievementCategory.choices,
        default=AchievementCategory.MILESTONE,
        db_index=True,
    )
    tier = models.CharField(
        max_length=12,
        choices=AchievementTier.choices,
        default=AchievementTier.BRONZE,
    )
    icon = models.CharField(
        max_length=60,
        blank=True,
        default="trophy",
        help_text="Icon identifier used by the frontend.",
    )
    xp_reward = models.PositiveIntegerField(
        default=0,
        help_text="XP granted when the achievement is unlocked.",
    )
    threshold = models.PositiveIntegerField(
        default=1,
        help_text="Target value for progress-based achievements.",
    )
    is_hidden = models.BooleanField(
        default=False,
        help_text="Hidden achievements are not shown until unlocked.",
    )
    ordering_priority = models.PositiveIntegerField(
        default=0,
        help_text="Lower = displayed first within a category.",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "achievements"
        ordering = ["category", "ordering_priority", "name"]
        verbose_name = "Achievement"
        verbose_name_plural = "Achievements"

    def __str__(self) -> str:
        return f"{self.name} [{self.key}]"

class AchievementUnlock(models.Model):
    """
    Records the moment a user unlocks a specific achievement.

    The (user, achievement) pair is unique — an achievement can only be
    unlocked once per user.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="achievement_unlocks",
    )
    achievement = models.ForeignKey(
        Achievement,
        on_delete=models.CASCADE,
        related_name="unlocks",
    )
    unlocked_at = models.DateTimeField(default=timezone.now, db_index=True)
    game_session_id = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="The game session that triggered this unlock (if any).",
    )

    class Meta:
        db_table = "achievement_unlocks"
        unique_together = [("user", "achievement")]
        ordering = ["-unlocked_at"]
        verbose_name = "Achievement Unlock"
        verbose_name_plural = "Achievement Unlocks"

    def __str__(self) -> str:
        return f"{self.user} → {self.achievement.name}"

class AchievementProgress(models.Model):
    """
    Tracks incremental progress toward a threshold-based achievement.

    For achievements that require a single event (threshold == 1),
    a progress row is optional — the unlock record alone is sufficient.
    For multi-step achievements (e.g. "Win 50 games"), the ``current``
    field is incremented after each qualifying event and the achievement
    is unlocked when ``current >= achievement.threshold``.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="achievement_progress",
    )
    achievement = models.ForeignKey(
        Achievement,
        on_delete=models.CASCADE,
        related_name="progress_records",
    )
    current = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "achievement_progress"
        unique_together = [("user", "achievement")]
        verbose_name = "Achievement Progress"
        verbose_name_plural = "Achievement Progress"

    def __str__(self) -> str:
        return (
            f"{self.user} → {self.achievement.name}: "
            f"{self.current}/{self.achievement.threshold}"
        )

    @property
    def is_complete(self) -> bool:
        return self.current >= self.achievement.threshold

    @property
    def percentage(self) -> float:
        if self.achievement.threshold == 0:
            return 100.0
        return min(100.0, (self.current / self.achievement.threshold) * 100)
