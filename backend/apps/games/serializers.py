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
        choices=["pvp", "local"],
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


class CreateLocalMatchSerializer(serializers.Serializer):
    """Validate local/frontend-recorded match payloads."""

    game_type = serializers.ChoiceField(choices=["pong", "tictactoe"])
    game_mode = serializers.ChoiceField(
        choices=["pvp"],
        required=False,
        default="pvp",
    )
    winner = serializers.ChoiceField(
        choices=["X", "O"],
        required=False,
        allow_null=True,
        default=None,
    )
    duration_seconds = serializers.FloatField(
        required=False,
        default=0.0,
        min_value=0,
    )
    player1_score = serializers.IntegerField(
        required=False,
        default=0,
        min_value=0,
    )
    player2_score = serializers.IntegerField(
        required=False,
        default=0,
        min_value=0,
    )
    metadata = serializers.JSONField(required=False, default=dict)

    def validate_metadata(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Metadata must be an object.")
        return value

    def validate(self, attrs):
        winner = attrs.get("winner")
        player1_score = attrs["player1_score"]
        player2_score = attrs["player2_score"]

        if winner is None:
            if player1_score != player2_score:
                raise serializers.ValidationError({
                    "winner": "Winner may be omitted only for a draw.",
                })
        elif winner == "X" and player1_score <= player2_score:
            raise serializers.ValidationError({
                "winner": "Winner X must have a higher player1_score.",
            })
        elif winner == "O" and player2_score <= player1_score:
            raise serializers.ValidationError({
                "winner": "Winner O must have a higher player2_score.",
            })

        return attrs


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
        choices=["pvp", "local"],
        required=False,
    )
    game_mode = serializers.ChoiceField(
        choices=["pvp"],
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
    class Meta:
        model = MatchPlayer
        fields = [
            "user_id",
            "username",
            "display_name",
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
            "metadata",
            "players",
        ]
