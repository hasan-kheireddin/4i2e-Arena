from django.urls import path

from apps.games.views import (
    HeadToHeadView,
    LeaderboardView,
    MatchDetailView,
    MatchListView,
    MatchSummaryView,
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
        "matches/me/",
        UserMatchListView.as_view(),
        name="match-list-me",
    ),
    path(
        "matches/summary/",
        MatchSummaryView.as_view(),
        name="match-summary",
    ),
    path(
        "matches/user/<uuid:user_id>/",
        UserMatchHistoryView.as_view(),
        name="match-list-user",
    ),
    path(
        "matches/<uuid:pk>/",
        MatchDetailView.as_view(),
        name="match-detail",
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
        "stats/head-to-head/<uuid:opponent_id>/",
        HeadToHeadView.as_view(),
        name="stats-head-to-head",
    ),
    path(
        "stats/leaderboard/",
        LeaderboardView.as_view(),
        name="stats-leaderboard",
    ),
]
