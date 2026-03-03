from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import Achievement, AchievementProgress, AchievementUnlock

User = get_user_model()


class AchievementSerializer(serializers.ModelSerializer):
    """Read-only serializer for the achievement catalogue."""

    class Meta:
        model = Achievement
        fields = [
            "id",
            "key",
            "name",
            "description",
            "category",
            "tier",
            "icon",
            "xp_reward",
            "threshold",
            "is_hidden",
            "ordering_priority",
        ]
        read_only_fields = fields


class AchievementProgressSerializer(serializers.ModelSerializer):
    """Serializer for a user's progress toward an achievement."""
    achievement = AchievementSerializer(read_only=True)
    percentage = serializers.FloatField(read_only=True)
    is_complete = serializers.BooleanField(read_only=True)

    class Meta:
        model = AchievementProgress
        fields = [
            "id",
            "achievement",
            "current",
            "percentage",
            "is_complete",
            "updated_at",
        ]
        read_only_fields = fields


class AchievementUnlockSerializer(serializers.ModelSerializer):
    """Serializer for a user's unlocked achievement."""
    achievement = AchievementSerializer(read_only=True)

    class Meta:
        model = AchievementUnlock
        fields = [
            "id",
            "achievement",
            "unlocked_at",
            "game_session_id",
        ]
        read_only_fields = fields


class AchievementWithUserStatusSerializer(serializers.ModelSerializer):
    """
    Achievement catalogue entry enriched with the requesting user's
    unlock status and progress.
    """
    is_unlocked = serializers.BooleanField(read_only=True)
    unlocked_at = serializers.DateTimeField(read_only=True, allow_null=True)
    progress_current = serializers.IntegerField(read_only=True, default=0)
    progress_percentage = serializers.FloatField(read_only=True, default=0.0)

    class Meta:
        model = Achievement
        fields = [
            "id",
            "key",
            "name",
            "description",
            "category",
            "tier",
            "icon",
            "xp_reward",
            "threshold",
            "is_hidden",
            "is_unlocked",
            "unlocked_at",
            "progress_current",
            "progress_percentage",
        ]
        read_only_fields = fields


class AchievementStatsSerializer(serializers.Serializer):
    """Summary statistics for a user's achievements."""
    total_achievements = serializers.IntegerField()
    unlocked_count = serializers.IntegerField()
    locked_count = serializers.IntegerField()
    completion_percentage = serializers.FloatField()
    total_xp_from_achievements = serializers.IntegerField()
    by_category = serializers.DictField(child=serializers.DictField())
    by_tier = serializers.DictField(child=serializers.DictField())
    recent_unlocks = AchievementUnlockSerializer(many=True)
