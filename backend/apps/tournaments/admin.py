from django.contrib import admin
from .models import Tournament, TournamentEntry, TournamentRound


@admin.register(Tournament)
class TournamentAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "game_type",
        "status",
        "participant_count",
        "max_participants",
        "current_round",
        "total_rounds",
        "created_by",
        "winner",
        "created_at",
    )
    list_filter = ("status", "game_type")
    search_fields = ("name", "created_by__username")
    raw_id_fields = ("created_by", "winner")
    readonly_fields = (
        "participant_count",
        "current_round",
        "total_rounds",
        "started_at",
        "completed_at",
        "created_at",
        "updated_at",
    )


@admin.register(TournamentEntry)
class TournamentEntryAdmin(admin.ModelAdmin):
    list_display = ("tournament", "player", "registered_at")
    list_filter = ("tournament__status",)
    search_fields = ("player__username", "tournament__name")
    raw_id_fields = ("tournament", "player")


@admin.register(TournamentRound)
class TournamentRoundAdmin(admin.ModelAdmin):
    list_display = (
        "tournament",
        "round_number",
        "match_index",
        "player1",
        "player2",
        "winner",
        "status",
        "player1_score",
        "player2_score",
    )
    list_filter = ("status", "round_number")
    search_fields = (
        "tournament__name",
        "player1__username",
        "player2__username",
    )
    raw_id_fields = ("tournament", "player1", "player2", "winner")
    readonly_fields = ("started_at", "completed_at", "created_at")
