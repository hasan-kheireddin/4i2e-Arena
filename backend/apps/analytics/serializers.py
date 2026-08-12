from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import Achievement, AchievementUnlock

User = get_user_model()


class AchievementSerializer(serializers.ModelSerializer):
    """Read-only serializer for the achievement catalogue."""
    rarity = serializers.CharField(source="tier", read_only=True)

    class Meta:
        model = Achievement
        fields = [
            "id",
            "key",
            "name",
            "description",
            "category",
            "rarity",
            "icon",
            "xp_reward",
            "threshold",
            "is_hidden",
            "ordering_priority",
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
    rarity = serializers.CharField(source="tier", read_only=True)

    class Meta:
        model = Achievement
        fields = [
            "id",
            "key",
            "name",
            "description",
            "category",
            "rarity",
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


