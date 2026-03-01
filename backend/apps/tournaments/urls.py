# =============================================================================
# Tournaments — URL Configuration
# =============================================================================
#   GET    /api/tournaments/                              → List all tournaments
#   POST   /api/tournaments/                              → Create a new tournament
#   GET    /api/tournaments/me/                            → My tournaments
#   GET    /api/tournaments/stats/me/                      → My tournament stats
#   GET    /api/tournaments/<id>/                          → Tournament detail
#   PATCH  /api/tournaments/<id>/                          → Update tournament
#   DELETE /api/tournaments/<id>/                          → Cancel tournament
#   POST   /api/tournaments/<id>/join/                     → Join tournament
#   POST   /api/tournaments/<id>/leave/                    → Leave tournament
#   GET    /api/tournaments/<id>/participants/              → List participants
#   POST   /api/tournaments/<id>/start/                    → Generate bracket & start
#   GET    /api/tournaments/<id>/bracket/                  → View bracket
#   GET    /api/tournaments/<id>/stats/                    → Tournament statistics
#   POST   /api/tournaments/<id>/prepare-round/            → Prepare round matches
#   POST   /api/tournaments/<tid>/rounds/<rid>/complete/   → Complete a round
# =============================================================================

from django.urls import path
from . import views

urlpatterns = [
    # Tournament CRUD
    path("", views.TournamentListCreateView.as_view(), name="tournament-list-create"),
    path("me/", views.MyTournamentsView.as_view(), name="my-tournaments"),
    path("stats/me/", views.PlayerTournamentStatsView.as_view(), name="player-tournament-stats"),
    path("<uuid:pk>/", views.TournamentDetailView.as_view(), name="tournament-detail"),

    # Participant management
    path("<uuid:pk>/join/", views.TournamentJoinView.as_view(), name="tournament-join"),
    path("<uuid:pk>/leave/", views.TournamentLeaveView.as_view(), name="tournament-leave"),
    path("<uuid:pk>/participants/", views.TournamentParticipantsView.as_view(), name="tournament-participants"),

    # Bracket
    path("<uuid:pk>/start/", views.TournamentStartView.as_view(), name="tournament-start"),
    path("<uuid:pk>/bracket/", views.TournamentBracketView.as_view(), name="tournament-bracket"),

    # Statistics
    path("<uuid:pk>/stats/", views.TournamentStatsView.as_view(), name="tournament-stats"),

    # Round preparation
    path("<uuid:pk>/prepare-round/", views.TournamentPrepareRoundView.as_view(), name="tournament-prepare-round"),

    # Round completion
    path(
        "<uuid:tournament_pk>/rounds/<uuid:round_pk>/complete/",
        views.TournamentRoundCompleteView.as_view(),
        name="tournament-round-complete",
    ),
]

