from django.urls import path

from .views import (
    # Achievement endpoints
    AchievementDetailView,
    AchievementListView,
    AchievementStatsView,
    AchievementUnlockedListView,
    LevelTableView,
    UserXPDetailView,
    PublicStatsView,
    # Activity tracking endpoints (Task 10.1)
    TrackEventView,
)

urlpatterns = [
    # Achievement endpoints
    path(
        "achievements/",
        AchievementListView.as_view(),
        name="achievement-list",
    ),
    path(
        "achievements/unlocked/",
        AchievementUnlockedListView.as_view(),
        name="achievement-unlocked-list",
    ),
    path(
        "achievements/unlocked/user/<uuid:user_id>/",
        AchievementUnlockedListView.as_view(),
        name="achievement-unlocked-list-user",
    ),
    path(
        "achievements/stats/",
        AchievementStatsView.as_view(),
        name="achievement-stats",
    ),
    path(
        "achievements/stats/user/<uuid:user_id>/",
        AchievementStatsView.as_view(),
        name="achievement-stats-user",
    ),
    path(
        "achievements/<uuid:pk>/",
        AchievementDetailView.as_view(),
        name="achievement-detail",
    ),

    # Public stats (no auth — used by landing page)
    path(
        "public-stats/",
        PublicStatsView.as_view(),
        name="public-stats",
    ),

    # XP & Leaderboard endpoints
    path(
        "xp/me/",
        UserXPDetailView.as_view(),
        name="user-xp-detail",
    ),
    path(
        "xp/user/<uuid:user_id>/",
        UserXPDetailView.as_view(),
        name="user-xp-detail-user",
    ),
    path(
        "xp/levels/",
        LevelTableView.as_view(),
        name="level-table",
    ),

    # Activity tracking endpoints (Task 10.1)
    path(
        "activity/track/",
        TrackEventView.as_view(),
        name="activity-track",
    ),
]
