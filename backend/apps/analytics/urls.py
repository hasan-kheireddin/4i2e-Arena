from django.urls import path

from .views import (
    # Achievement endpoints
    AchievementDetailView,
    AchievementListView,
    AchievementProgressListView,
    AchievementStatsView,
    AchievementUnlockedListView,
    LeaderboardView,
    LevelTableView,
    UserXPDetailView,
    PublicStatsView,
    # Activity tracking endpoints (Task 10.1)
    ActivityHeatmapView,
    ActivitySummaryView,
    ActivityTimelineView,
    RecentActivityView,
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
        "achievements/progress/",
        AchievementProgressListView.as_view(),
        name="achievement-progress-list",
    ),
    path(
        "achievements/stats/",
        AchievementStatsView.as_view(),
        name="achievement-stats",
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
        "leaderboard/",
        LeaderboardView.as_view(),
        name="leaderboard",
    ),
    path(
        "xp/me/",
        UserXPDetailView.as_view(),
        name="user-xp-detail",
    ),
    path(
        "xp/levels/",
        LevelTableView.as_view(),
        name="level-table",
    ),

    # Activity tracking endpoints (Task 10.1)
    path(
        "activity/summary/",
        ActivitySummaryView.as_view(),
        name="activity-summary",
    ),
    path(
        "activity/timeline/",
        ActivityTimelineView.as_view(),
        name="activity-timeline",
    ),
    path(
        "activity/heatmap/",
        ActivityHeatmapView.as_view(),
        name="activity-heatmap",
    ),
    path(
        "activity/recent/",
        RecentActivityView.as_view(),
        name="activity-recent",
    ),
    path(
        "activity/track/",
        TrackEventView.as_view(),
        name="activity-track",
    ),
]
