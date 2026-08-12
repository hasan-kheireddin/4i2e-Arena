from django.urls import path

from apps.games.views import (
    CreateLocalMatchView,
    GameInfoView,
    LeaderboardView,
    LiveGamesView,
    MatchListView,
    PublicUserStatsView,
    UserMatchHistoryView,
    UserMatchListView,
    UserStatsView,
)

urlpatterns = [
    
    path(
        "matches/",
        MatchListView.as_view(),
        name="match-list",
    ),
    path(
        "matches/create/",
        CreateLocalMatchView.as_view(),
        name="match-create-local",
    ),
    path(
        "matches/me/",
        UserMatchListView.as_view(),
        name="match-list-me",
    ),
    path(
        "matches/user/<uuid:user_id>/",
        UserMatchHistoryView.as_view(),
        name="match-list-user",
    ),
    path(
        "stats/me/",
        UserStatsView.as_view(),
        name="stats-me",
    ),
    path(
        "stats/user/<uuid:user_id>/",
        PublicUserStatsView.as_view(),
        name="stats-user",
    ),
    path(
        "stats/leaderboard/",
        LeaderboardView.as_view(),
        name="stats-leaderboard",
    ),
    path(
        "live/",
        LiveGamesView.as_view(),
        name="live-games",
    ),
    path(
        "live/<str:game_id>/",
        GameInfoView.as_view(),
        name="game-info",
    ),
]
