from django.urls import path
from .views import (
    AchievementDetailView,
    AchievementListView,
    AchievementProgressListView,
    AchievementStatsView,
    AchievementUnlockedListView,
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
]
