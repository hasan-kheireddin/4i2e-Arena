# Authentication & profile management endpoints:
#
#   POST   /api/accounts/register/            → Create new account
#   POST   /api/accounts/login/               → Login (username or email)
#   POST   /api/accounts/logout/              → Blacklist refresh token
#   POST   /api/accounts/token/refresh/       → Refresh JWT token pair
#   GET    /api/accounts/me/                  → Get current user profile
#   PATCH  /api/accounts/me/update/           → Update profile fields
#   POST   /api/accounts/me/change-password/  → Change password
#   GET    /api/accounts/oauth/<provider>/initiate/  → Get OAuth redirect URL
#   POST   /api/accounts/oauth/<provider>/callback/  → Handle OAuth callback
#   POST   /api/accounts/2fa/setup/           → Generate TOTP secret + QR code
#   POST   /api/accounts/2fa/confirm/         → Confirm 2FA setup with code
#   POST   /api/accounts/2fa/verify/          → Verify TOTP during login
#   POST   /api/accounts/2fa/disable/         → Disable 2FA
#   POST   /api/accounts/2fa/recovery/        → Use recovery code during login
#   GET    /api/accounts/2fa/status/          → Check 2FA status
# =============================================================================

from django.urls import path
from . import oauth_views, twofa_views, views

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
    # OAuth 2.0
    path(
        "oauth/<str:provider>/initiate/",
        oauth_views.OAuthInitiateView.as_view(),
        name="oauth-initiate",
    ),
    path(
        "oauth/<str:provider>/callback/",
        oauth_views.OAuthCallbackView.as_view(),
        name="oauth-callback",
    ),
    # Two-Factor Authentication
    path("2fa/setup/", twofa_views.TwoFactorSetupView.as_view(), name="2fa-setup"),
    path("2fa/confirm/", twofa_views.TwoFactorConfirmView.as_view(), name="2fa-confirm"),
    path("2fa/verify/", twofa_views.TwoFactorVerifyView.as_view(), name="2fa-verify"),
    path("2fa/disable/", twofa_views.TwoFactorDisableView.as_view(), name="2fa-disable"),
    path("2fa/recovery/", twofa_views.RecoveryCodeView.as_view(), name="2fa-recovery"),
    path("2fa/status/", twofa_views.TwoFactorStatusView.as_view(), name="2fa-status"),
]
