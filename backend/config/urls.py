"""
URL configuration for ft_transcendence project.

Routes all API traffic under /api/:
  /api/accounts/  → authentication, profiles, OAuth, 2FA
  /api/games/     → match history, stats, leaderboard
  /api/analytics/ → achievements, XP, activity tracking
"""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),

    # Accounts: auth, profiles, OAuth 2.0, 2FA
    path("api/accounts/", include("apps.accounts.urls")),

    # Games: match history and statistics
    path("api/games/", include("apps.games.urls")),

    # Analytics: achievements, XP, leaderboard, activity tracking
    path("api/analytics/", include("apps.analytics.urls")),
]
