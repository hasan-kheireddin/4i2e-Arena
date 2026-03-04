from django.urls import path

from apps.games.views import (
    MatchDetailView,
    MatchListView,
    MatchSummaryView,
    UserMatchHistoryView,
    UserMatchListView,
)

urlpatterns = [
    # Match history endpoints
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
]
