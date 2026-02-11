# Authentication & profile management endpoints:
#
#   POST   /api/accounts/register/            → Create new account
#   POST   /api/accounts/login/               → Login (username or email)
#   POST   /api/accounts/logout/              → Blacklist refresh token
#   POST   /api/accounts/token/refresh/       → Refresh JWT token pair
#   GET    /api/accounts/me/                  → Get current user profile
#   PATCH  /api/accounts/me/update/           → Update profile fields
#   POST   /api/accounts/me/change-password/  → Change password
# =============================================================================

from django.urls import path

from . import views

urlpatterns = [
    # Auth
    path("register/", views.RegisterView.as_view(), name="register"),
    path("login/", views.LoginView.as_view(), name="login"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path(
        "token/refresh/",
        views.CustomTokenRefreshView.as_view(),
        name="token-refresh",
    ),
    # Profile
    path("me/", views.ProfileView.as_view(), name="profile"),
    path("me/update/", views.ProfileUpdateView.as_view(), name="profile-update"),
    path(
        "me/change-password/",
        views.ChangePasswordView.as_view(),
        name="change-password",
    ),
]
