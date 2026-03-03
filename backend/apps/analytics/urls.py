from django.urls import path
from .views import (
    AchievementDetailView,
    AchievementListView,
    AchievementProgressListView,
    AchievementStatsView,
    AchievementUnlockedListView,
    LeaderboardView,
    LevelTableView,
    UserXPDetailView,
)

urlpatterns = [
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

]
