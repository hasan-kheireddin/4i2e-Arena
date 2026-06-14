# Authentication & profile management endpoints:
#
#   POST   /api/accounts/register/                  → Create new account (sends OTP)
#   POST   /api/accounts/verify-email/              → Verify OTP + activate account
#   POST   /api/accounts/resend-otp/                → Resend OTP code
#   POST   /api/accounts/login/                     → Login (username or email)
#   POST   /api/accounts/logout/                    → Blacklist refresh token
#   POST   /api/accounts/token/refresh/             → Refresh JWT token pair
#   GET    /api/accounts/me/                        → Get current user profile
#   PATCH  /api/accounts/me/update/                 → Update profile fields
#   POST   /api/accounts/me/change-password/        → Change password
#   POST   /api/accounts/password-reset/            → Send password reset email
#   POST   /api/accounts/password-reset/confirm/    → Confirm password reset
#   GET    /api/accounts/oauth/<provider>/initiate/ → Get OAuth redirect URL
#   POST   /api/accounts/oauth/<provider>/callback/ → Handle OAuth callback
#   POST   /api/accounts/2fa/setup/                 → Generate TOTP secret + QR code
#   POST   /api/accounts/2fa/verify/                → Verify setup code and enable 2FA
#   POST   /api/accounts/2fa/login-verify/          → Verify TOTP during login
#   POST   /api/accounts/2fa/confirm/               → Backward-compatible alias for setup verification
#   POST   /api/accounts/2fa/disable/               → Disable 2FA
#   GET    /api/accounts/2fa/status/                → Check 2FA status
# =============================================================================

from django.urls import path
from django.urls import path, re_path
from . import oauth_views, twofa_views, views

urlpatterns = [
    # Auth
    path("register/", views.RegisterView.as_view(), name="register"),
    path("verify-email/", views.VerifyEmailView.as_view(), name="verify-email"),
    path("resend-otp/", views.ResendOTPView.as_view(), name="resend-otp"),
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
    path("users/<uuid:pk>/", views.PublicProfileView.as_view(), name="public-profile"),
    path("users/search/", views.UserSearchView.as_view(), name="user-search"),
    path(
        "me/change-password/",
        views.ChangePasswordView.as_view(),
        name="change-password",
    ),
    # Password reset
    path("password-reset/", views.PasswordResetRequestView.as_view(), name="password-reset"),
    path("password-reset/confirm/", views.PasswordResetConfirmView.as_view(), name="password-reset-confirm"),
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
    path("2fa/verify/", twofa_views.TwoFactorConfirmView.as_view(), name="2fa-verify-setup"),
    path("2fa/login-verify/", twofa_views.TwoFactorVerifyView.as_view(), name="2fa-login-verify"),
    path("2fa/confirm/", twofa_views.TwoFactorConfirmView.as_view(), name="2fa-confirm"),
    path("2fa/disable/", twofa_views.TwoFactorDisableView.as_view(), name="2fa-disable"),
    path("2fa/status/", twofa_views.TwoFactorStatusView.as_view(), name="2fa-status"),
]
