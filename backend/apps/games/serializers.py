from __future__ import annotations
from rest_framework import serializers
from apps.games.models import Match, MatchPlayer


class StatsQuerySerializer(serializers.Serializer):
    """Validate query parameters for the user-stats endpoint."""

    game_type = serializers.ChoiceField(
        choices=["pong", "tictactoe"],
        required=False,
        allow_null=True,
    )
    mode = serializers.ChoiceField(
        choices=["pvp", "pva", "local"],
        required=False,
        allow_null=True,
    )


class LeaderboardQuerySerializer(serializers.Serializer):
    """Validate query parameters for the leaderboard endpoint."""

    game_type = serializers.ChoiceField(
        choices=["pong", "tictactoe"],
        required=False,
        allow_null=True,
    )
    metric = serializers.ChoiceField(
        choices=["wins"],
        required=False,
        default="wins",
    )
    period = serializers.ChoiceField(
        choices=["all", "daily", "weekly", "monthly"],
        required=False,
        default="all",
    )
    limit = serializers.IntegerField(
        required=False,
        default=50,
        min_value=1,
        max_value=100,
    )


class MatchQuerySerializer(serializers.Serializer):
    """Validate query parameters for match list endpoints."""

    game_type = serializers.ChoiceField(
        choices=["pong", "tictactoe"],
        required=False,
        allow_null=True,
    )
    finish_reason = serializers.CharField(
        required=False,
        allow_blank=False,
    )
    opponent = serializers.UUIDField(
        required=False,
    )
    search = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    result = serializers.ChoiceField(
        choices=["win", "loss", "draw"],
        required=False,
    )
    outcome = serializers.ChoiceField(
        choices=["win", "loss", "draw"],
        required=False,
    )
    mode = serializers.ChoiceField(
        choices=["pvp", "pva", "local"],
        required=False,
    )
    game_mode = serializers.ChoiceField(
        choices=["pvp", "pva", "pve"],
        required=False,
    )
    ordering = serializers.ChoiceField(
        choices=[
            "date",
            "-date",
            "score",
            "-score",
            "duration",
            "-duration",
        ],
        required=False,
        default="-date",
    )
    from_date = serializers.DateTimeField(
        required=False,
    )
    to_date = serializers.DateTimeField(
        required=False,
    )

class MatchPlayerSerializer(serializers.ModelSerializer):
    """Serializes a single player's participation in a match."""

    user_id = serializers.UUIDField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    display_name = serializers.CharField(
        source="user.display_name", read_only=True,
    )
    avatar_url = serializers.URLField(
        source="user.avatar_url", read_only=True,
    )

    class Meta:
        model = MatchPlayer
        fields = [
            "user_id",
            "username",
            "display_name",
            "avatar_url",
            "slot",
            "outcome",
            "score",
            "xp_earned",
        ]


class MatchListSerializer(serializers.ModelSerializer):
    """
    Compact serializer for match list endpoints.

    Includes nested player data so the frontend can render
    match cards without extra requests.
    """

    players = MatchPlayerSerializer(many=True, read_only=True)
    winner_id = serializers.UUIDField(
        source="winner.id", read_only=True, allow_null=True,
    )
    winner_username = serializers.CharField(
        source="winner.username", read_only=True, allow_null=True,
    )
    class Meta:
        model = Match
        fields = [
            "id",
            "game_session_id",
            "game_type",
            "game_mode",
            "finish_reason",
            "winner_id",
            "winner_username",
            "player1_score",
            "player2_score",
            "started_at",
            "finished_at",
            "duration_seconds",
            "ai_difficulty",
            "metadata",
            "players",
        ]


class MatchDetailSerializer(serializers.ModelSerializer):
    """Full match detail serializer."""

    players = MatchPlayerSerializer(many=True, read_only=True)
    winner_id = serializers.UUIDField(
        source="winner.id", read_only=True, allow_null=True,
    )
    winner_username = serializers.CharField(
        source="winner.username", read_only=True, allow_null=True,
    )

    class Meta:
        model = Match
        fields = [
            "id",
            "game_session_id",
            "game_type",
            "game_mode",
            "finish_reason",
            "winner_id",
            "winner_username",
            "player1_score",
            "player2_score",
            "started_at",
            "finished_at",
            "duration_seconds",
            "ai_difficulty",
            "metadata",
            "players",
            "created_at",
        ]
