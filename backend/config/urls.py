"""
URL configuration for ft_transcendence project.

Routes all API traffic under /api/:
  /api/accounts/  → authentication, profiles, 2FA
  /api/games/     → match history, stats, leaderboard
  /api/analytics/ → achievements, XP, activity tracking
"""

from django.urls import include, path

urlpatterns = [
    # Accounts: auth, profiles, 2FA
    path("api/accounts/", include("apps.accounts.urls")),

    # Games: match history and statistics
    path("api/games/", include("apps.games.urls")),

    # Analytics: achievements, XP, leaderboard, activity tracking
    path("api/analytics/", include("apps.analytics.urls")),

    # Chat: channels, messages, memberships
    path("api/chat/", include("apps.chat.urls")),
]
