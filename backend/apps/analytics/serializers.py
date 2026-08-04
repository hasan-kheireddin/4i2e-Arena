from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import Achievement, AchievementProgress, AchievementUnlock

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


class AchievementStatsSerializer(serializers.Serializer):
    """Summary statistics for a user's achievements."""
    total_achievements = serializers.IntegerField()
    unlocked_count = serializers.IntegerField()
    locked_count = serializers.IntegerField()
    completion_percentage = serializers.FloatField()
    total_xp_from_achievements = serializers.IntegerField()
    by_category = serializers.DictField(child=serializers.DictField())
    by_rarity = serializers.DictField(child=serializers.DictField())
    recent_unlocks = AchievementUnlockSerializer(many=True)

class LeaderboardEntrySerializer(serializers.ModelSerializer):
    """A single row in the leaderboard."""
    rank = serializers.IntegerField(read_only=True)
    xp_to_next_level = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "display_name",
            "avatar_url",
            "xp",
            "level",
            "rank",
            "xp_to_next_level",
        ]
        read_only_fields = fields

    def get_xp_to_next_level(self, obj) -> dict:
        from apps.analytics.xp_service import get_xp_to_next_level
        return get_xp_to_next_level(obj.xp)


class UserXPDetailSerializer(serializers.Serializer):
    """Detailed XP and level info for the requesting user."""
    user_id = serializers.UUIDField()
    username = serializers.CharField()
    display_name = serializers.CharField()
    xp = serializers.IntegerField()
    level = serializers.IntegerField()
    level_info = serializers.DictField()
    rank = serializers.IntegerField()
    total_players = serializers.IntegerField()
