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
    # Activity tracking endpoints (Task 10.1)
    ActivityHeatmapView,
    ActivitySummaryView,
    ActivityTimelineView,
    AnonymiseActivityView,
    ExportActivityView,
    GlobalActivitySummaryView,
    RecentActivityView,
    TrackEventView,
    # Analytics engine endpoints (Task 10.2)
    OpponentsSummaryView,
    PeakHoursView,
    PerformanceInsightsView,
    PerformanceTrendView,
    RivalriesView,
    SessionAnalysisView,
    WinRateTrendView,
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
    path(
        "activity/export/",
        ExportActivityView.as_view(),
        name="activity-export",
    ),
    path(
        "activity/anonymise/",
        AnonymiseActivityView.as_view(),
        name="activity-anonymise",
    ),
    path(
        "activity/global/",
        GlobalActivitySummaryView.as_view(),
        name="activity-global",
    ),

    # Analytics engine endpoints (Task 10.2)
    path(
        "insights/win-rate-trend/",
        WinRateTrendView.as_view(),
        name="insights-win-rate-trend",
    ),
    path(
        "insights/performance-trend/",
        PerformanceTrendView.as_view(),
        name="insights-performance-trend",
    ),
    path(
        "insights/peak-hours/",
        PeakHoursView.as_view(),
        name="insights-peak-hours",
    ),
    path(
        "insights/sessions/",
        SessionAnalysisView.as_view(),
        name="insights-sessions",
    ),
    path(
        "insights/opponents/",
        OpponentsSummaryView.as_view(),
        name="insights-opponents",
    ),
    path(
        "insights/rivalries/",
        RivalriesView.as_view(),
        name="insights-rivalries",
    ),
    path(
        "insights/recommendations/",
        PerformanceInsightsView.as_view(),
        name="insights-recommendations",
    ),
]
