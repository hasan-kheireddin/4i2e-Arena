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


class LeaderboardQuerySerializer(serializers.Serializer):
    """Validate query parameters for the leaderboard endpoint."""

    game_type = serializers.ChoiceField(
        choices=["pong", "tictactoe"],
        required=False,
        allow_null=True,
    )
    metric = serializers.ChoiceField(
        choices=["wins", "win_rate", "xp"],
        required=False,
        default="wins",
    )
    limit = serializers.IntegerField(
        required=False,
        default=50,
        min_value=1,
        max_value=100,
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
    tournament_id = serializers.UUIDField(
        source="tournament.id", read_only=True, allow_null=True,
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
            "tournament_id",
            "players",
        ]


class MatchDetailSerializer(serializers.ModelSerializer):
    """
    Full match detail serializer.

    Adds metadata and tournament round info on top of the list fields.
    """

    players = MatchPlayerSerializer(many=True, read_only=True)
    winner_id = serializers.UUIDField(
        source="winner.id", read_only=True, allow_null=True,
    )
    winner_username = serializers.CharField(
        source="winner.username", read_only=True, allow_null=True,
    )
    tournament_id = serializers.UUIDField(
        source="tournament.id", read_only=True, allow_null=True,
    )
    tournament_name = serializers.CharField(
        source="tournament.name", read_only=True, allow_null=True,
    )
    tournament_round_id = serializers.UUIDField(
        source="tournament_round.id", read_only=True, allow_null=True,
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
            "tournament_id",
            "tournament_name",
            "tournament_round_id",
            "metadata",
            "players",
            "created_at",
        ]
