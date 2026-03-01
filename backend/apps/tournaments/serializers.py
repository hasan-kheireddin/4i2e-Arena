from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import (
    GameType,
    Tournament,
    TournamentEntry,
    TournamentRound,
    TournamentStatus,
    _is_power_of_two,
)

User = get_user_model()

class TournamentPlayerSerializer(serializers.ModelSerializer):
    """Lightweight user representation for tournament contexts."""

    class Meta:
        model = User
        fields = ["id", "username", "display_name", "avatar_url"]
        read_only_fields = fields


class TournamentRoundSerializer(serializers.ModelSerializer):
    """Read-only serializer for a single bracket match."""

    player1 = TournamentPlayerSerializer(read_only=True)
    player2 = TournamentPlayerSerializer(read_only=True)
    winner = TournamentPlayerSerializer(read_only=True)

    class Meta:
        model = TournamentRound
        fields = [
            "id",
            "round_number",
            "match_index",
            "player1",
            "player2",
            "winner",
            "status",
            "player1_score",
            "player2_score",
            "game_session_id",
            "started_at",
            "completed_at",
        ]
        read_only_fields = fields


class TournamentEntrySerializer(serializers.ModelSerializer):
    """Read-only serializer for a tournament registration."""

    player = TournamentPlayerSerializer(read_only=True)

    class Meta:
        model = TournamentEntry
        fields = ["id", "player", "registered_at"]
        read_only_fields = fields

class TournamentListSerializer(serializers.ModelSerializer):
    """Compact tournament representation for list endpoints."""

    created_by = TournamentPlayerSerializer(read_only=True)
    winner = TournamentPlayerSerializer(read_only=True)
    participant_count = serializers.IntegerField(read_only=True)
    is_full = serializers.BooleanField(read_only=True)
    is_joinable = serializers.BooleanField(read_only=True)

    class Meta:
        model = Tournament
        fields = [
            "id",
            "name",
            "description",
            "game_type",
            "status",
            "max_participants",
            "participant_count",
            "is_full",
            "is_joinable",
            "created_by",
            "winner",
            "current_round",
            "total_rounds",
            "started_at",
            "completed_at",
            "created_at",
        ]
        read_only_fields = fields


class TournamentDetailSerializer(TournamentListSerializer):
    """Full tournament representation including entries and bracket."""

    entries = TournamentEntrySerializer(many=True, read_only=True)
    rounds = TournamentRoundSerializer(many=True, read_only=True)

    class Meta(TournamentListSerializer.Meta):
        fields = TournamentListSerializer.Meta.fields + ["entries", "rounds"]
        read_only_fields = fields

class TournamentCreateSerializer(serializers.Serializer):
    """Validates and creates a new tournament."""

    name = serializers.CharField(max_length=100)
    description = serializers.CharField(required=False, default="", allow_blank=True)
    game_type = serializers.ChoiceField(choices=GameType.choices, default=GameType.PONG)
    max_participants = serializers.IntegerField(min_value=4, max_value=32, default=8)

    def validate_max_participants(self, value):
        if not _is_power_of_two(value):
            raise serializers.ValidationError(
                "Must be a power of 2 (4, 8, 16, 32)."
            )
        return value

    def validate_name(self, value):
        value = value.strip()
        if len(value) < 3:
            raise serializers.ValidationError(
                "Tournament name must be at least 3 characters."
            )
        return value

    def create(self, validated_data):
        user = self.context["request"].user
        return Tournament.objects.create(created_by=user, **validated_data)


class TournamentUpdateSerializer(serializers.Serializer):
    """
    Allows the creator to update tournament metadata before it starts.
    Only name, description, and max_participants can be changed while PENDING.
    """

    name = serializers.CharField(max_length=100, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    max_participants = serializers.IntegerField(
        min_value=4, max_value=32, required=False
    )

    def validate_max_participants(self, value):
        if not _is_power_of_two(value):
            raise serializers.ValidationError(
                "Must be a power of 2 (4, 8, 16, 32)."
            )
        tournament: Tournament = self.context["tournament"]
        if value < tournament.participant_count:
            raise serializers.ValidationError(
                f"Cannot reduce below current participant count ({tournament.participant_count})."
            )
        return value

    def validate_name(self, value):
        value = value.strip()
        if len(value) < 3:
            raise serializers.ValidationError(
                "Tournament name must be at least 3 characters."
            )
        return value

    def update(self, instance: Tournament, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save(update_fields=list(validated_data.keys()) + ["updated_at"])
        return instance

class RoundCompleteSerializer(serializers.Serializer):
    """Mark a tournament round as completed with a winner."""

    winner_id = serializers.UUIDField()
    player1_score = serializers.IntegerField(min_value=0, default=0)
    player2_score = serializers.IntegerField(min_value=0, default=0)

    def validate_winner_id(self, value):
        round_obj: TournamentRound = self.context["round"]
        valid_ids = {round_obj.player1_id, round_obj.player2_id}
        if value not in valid_ids:
            raise serializers.ValidationError(
                "Winner must be one of the two players in this match."
            )
        return value
