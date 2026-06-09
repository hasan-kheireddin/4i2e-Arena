import logging

from django.contrib.auth import get_user_model
from django.contrib.auth import logout as django_logout
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from apps.analytics.tracking_service import (
    get_client_ip,
    get_user_agent,
    track_login,
    track_logout,
    track_profile_updated,
    track_registration,
)

from .email_service import send_otp_email, send_password_reset_email
from .models import EmailVerificationToken, PendingRegistration, TOTPDevice
from .safety import non_blocking
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    UserProfileSerializer,
    UserUpdateSerializer,
    VerifyEmailSerializer,
    get_tokens_for_user,
)
from .twofa_views import _issue_temp_token

logger = logging.getLogger(__name__)
User = get_user_model()
safe_track_registration = non_blocking(track_registration)
safe_track_login = non_blocking(track_login)
safe_track_logout = non_blocking(track_logout)
safe_track_profile_updated = non_blocking(track_profile_updated)


def _request_origin(request) -> str:
    return f"{request.scheme}://{request.get_host()}".rstrip("/")


def _effective_display_name(username: str, display_name: str) -> str:
    return display_name.strip() or username.strip()


def _display_name_taken_response():
    return Response(
        {"display_name": ["This display name is already taken."]},
        status=status.HTTP_400_BAD_REQUEST,
    )


def _pending_display_name_conflicts(display_name: str, pending_pk=None) -> bool:
    queryset = PendingRegistration.objects.select_for_update().filter(
        Q(display_name__iexact=display_name)
        | (Q(display_name="") & Q(username__iexact=display_name))
    )
    if pending_pk is not None:
        queryset = queryset.exclude(pk=pending_pk)
    return queryset.exists()


class RegisterView(APIView):
    """
    Create a new user account.

    Accepts username, email, password, password2, and optional display_name.
    Returns the user profile and JWT token pair on success.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data["username"].strip()
        email = serializer.validated_data["email"].strip().lower()
        display_name = serializer.validated_data.get("display_name", "").strip()
        password = serializer.validated_data["password"]

        with transaction.atomic():
            pending_by_email = (
                PendingRegistration.objects.select_for_update()
                .filter(email__iexact=email)
                .first()
            )
            pending_by_username = (
                PendingRegistration.objects.select_for_update()
                .filter(username__iexact=username)
                .first()
            )

            if (
                pending_by_email
                and pending_by_username
                and pending_by_email.pk != pending_by_username.pk
            ):
                return Response(
                    {
                        "detail": (
                            "A pending registration already exists for this "
                            "email or username. Please finish verification or "
                            "use different credentials."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            pending = pending_by_email or pending_by_username or PendingRegistration()
            effective_display_name = _effective_display_name(username, display_name)
            if User.objects.filter(
                display_name__iexact=effective_display_name,
            ).exists():
                return _display_name_taken_response()

            if _pending_display_name_conflicts(
                effective_display_name,
                pending.pk,
            ):
                return _display_name_taken_response()

            pending.username = username
            pending.email = email
            pending.display_name = display_name
            pending.set_password(password)
            pending.issue_code()
            pending.save()

        try:
            send_otp_email(pending, pending.code)
        except Exception:
            logger.exception(
                "Failed to send OTP email to %s during registration",
                pending.email,
            )
        return Response(
            {
                "requires_verification": True,
                "email": pending.email,
                "detail": "A verification code has been sent to your email.",
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    """
    Authenticate with username (or email) + password.
    Returns the user profile and JWT token pair.

    If the user has 2FA enabled, returns `requires_2fa: true` with a
    temporary token instead — the client must call the 2FA verification
    endpoint to complete login.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]

        # Update last activity
        user.last_activity = timezone.now()
        user.save(update_fields=["last_activity"])

        # If 2FA is enabled, require the authenticator-app verification step.
        if user.is_2fa_enabled:
            has_confirmed_device = TOTPDevice.objects.filter(
                user=user,
                confirmed=True,
            ).exists()
            if not has_confirmed_device:
                logger.warning(
                    "User %s has is_2fa_enabled=True but no confirmed TOTP device",
                    user.pk,
                )
                user.is_2fa_enabled = False
                user.save(update_fields=["is_2fa_enabled"])
            else:
                request.session["2fa_user_id"] = str(user.id)
                request.session.modified = True
                return Response(
                    {
                        "requires_2fa": True,
                        "temp_token": _issue_temp_token(user, auth_method="password"),
                        "user_id": str(user.id),
                    },
                    status=status.HTTP_200_OK,
                )

        tokens = get_tokens_for_user(user)
        profile = UserProfileSerializer(user).data
        # Track login event (non-blocking)
        safe_track_login(
            user.pk,
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
            method="password",
        )
        return Response(
            {
                "user": profile,
                "tokens": tokens,
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    """
    Blacklist the refresh token to invalidate the session.
    The client should also discard the access token locally.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"detail": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError:
            return Response(
                {"detail": "Token is invalid or already blacklisted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user_pk = request.user.pk
        # Track logout event (non-blocking)
        safe_track_logout(
            user_pk,
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
        )
        django_logout(request)

        return Response(
            {"detail": "Successfully logged out."},
            status=status.HTTP_200_OK,
        )


class CustomTokenRefreshView(TokenRefreshView):
    """
    Accepts a refresh token and returns a new access + refresh token pair.
    Inherits from SimpleJWT's TokenRefreshView.
    The old refresh token is blacklisted after rotation (configured in
    settings.SIMPLE_JWT.ROTATE_REFRESH_TOKENS / BLACKLIST_AFTER_ROTATION).
    """

    def post(self, request, *args, **kwargs):
        try:
            return super().post(request, *args, **kwargs)
        except TokenError as e:
            # Token is blacklisted, expired, or invalid.
            return Response(
                {"detail": str(e), "code": "token_not_valid"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except Exception:
            # Catch any unexpected error (e.g. DB IntegrityError on blacklist table)
            # so we never leak a 500 from this endpoint
            return Response(
                {"detail": "Token is invalid or expired.", "code": "token_not_valid"},
                status=status.HTTP_401_UNAUTHORIZED,
            )


class ProfileView(generics.RetrieveAPIView):
    """
    Return the authenticated user's full profile.
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserProfileSerializer

    def get_object(self):
        return self.request.user


class ProfileUpdateView(generics.UpdateAPIView):
    """
    Update the authenticated user's profile.
    Accepts: display_name, avatar_url, preferred_language.
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserUpdateSerializer
    http_method_names = ["patch"]

    def get_object(self):
        return self.request.user

    def perform_update(self, serializer):
        instance = serializer.save()
        changed = list(serializer.validated_data.keys())
        safe_track_profile_updated(
            instance.pk,
            fields_changed=changed,
            ip_address=get_client_ip(self.request),
            user_agent=get_user_agent(self.request),
        )


class ChangePasswordView(APIView):
    """
    Change the authenticated user's password.
    Requires old_password, new_password, new_password2.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if request.user.is_oauth_user:
            return Response(
                {"detail": "Password changes are disabled for 42 OAuth accounts."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ChangePasswordSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)

        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])

        return Response(
            {"detail": "Password changed successfully."},
            status=status.HTTP_200_OK,
        )


class VerifyEmailView(APIView):
    """
    Verify a user's email address using the 6-digit OTP.
    Activates the account and returns JWT tokens.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()
        code = serializer.validated_data["code"]

        with transaction.atomic():
            pending = (
                PendingRegistration.objects.select_for_update()
                .filter(email__iexact=email)
                .first()
            )

            if not pending or pending.code != code:
                return Response(
                    {"detail": "Invalid verification code."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if pending.is_expired:
                return Response(
                    {
                        "detail": (
                            "Verification code has expired. Please request a new one."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if User.objects.filter(username__iexact=pending.username).exists():
                return Response(
                    {
                        "detail": (
                            "That username is no longer available. "
                            "Please register again."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if User.objects.filter(email__iexact=pending.email).exists():
                return Response(
                    {
                        "detail": (
                            "That email is already associated with an account."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            effective_display_name = _effective_display_name(
                pending.username,
                pending.display_name,
            )
            if User.objects.filter(
                display_name__iexact=effective_display_name,
            ).exists():
                return Response(
                    {
                        "display_name": [
                            "That display name is no longer available. "
                            "Please register again."
                        ]
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user = User(
                username=pending.username,
                email=pending.email,
                display_name=pending.display_name,
                is_active=True,
            )
            user.password = pending.password_hash
            user.save()
            pending.delete()

        safe_track_registration(
            user.pk,
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
        )

        tokens = get_tokens_for_user(user)
        profile = UserProfileSerializer(user).data
        return Response(
            {"user": profile, "tokens": tokens},
            status=status.HTTP_200_OK,
        )


class ResendOTPView(APIView):
    """Resend OTP to the given email (if account is inactive/unverified)."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        pending = PendingRegistration.objects.filter(email__iexact=email).first()
        if not pending:
            # Don't reveal whether the email exists
            return Response(
                {"detail": "If that email exists, a new code has been sent."},
                status=status.HTTP_200_OK,
            )

        with transaction.atomic():
            pending = (
                PendingRegistration.objects.select_for_update()
                .filter(pk=pending.pk)
                .first()
            )
            if not pending:
                return Response(
                    {"detail": "If that email exists, a new code has been sent."},
                    status=status.HTTP_200_OK,
                )
            pending.issue_code()
            pending.save(update_fields=["code", "expires_at", "updated_at"])

        try:
            send_otp_email(pending, pending.code)
        except Exception:
            logger.exception("Failed to resend OTP email to %s", pending.email)

        return Response(
            {"detail": "If that email exists, a new code has been sent."},
            status=status.HTTP_200_OK,
        )


class PasswordResetRequestView(APIView):
    """Send a password-reset email with a unique token link."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        try:
            user = User.objects.get(email__iexact=email, is_active=True)
            if user.is_oauth_user:
                return Response(
                    {"detail": "If that email exists, a reset link has been sent."},
                    status=status.HTTP_200_OK,
                )
            token = EmailVerificationToken.create_reset_token(user)
            send_password_reset_email(
                user,
                token.code,
                frontend_url=_request_origin(request),
            )
        except User.DoesNotExist:
            pass  # Don't reveal whether the email exists
        except Exception:
            logger.exception("Failed to send password reset email to %s", email)

        return Response(
            {"detail": "If that email exists, a reset link has been sent."},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    """Validate the reset token and set the new password."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        raw_token = serializer.validated_data["token"]
        new_password = serializer.validated_data["password"]

        token = (
            EmailVerificationToken.objects.filter(
                token_type=EmailVerificationToken.TYPE_PASSWORD_RESET,
                code=raw_token,
                used=False,
            )
            .select_related("user")
            .first()
        )

        if not token:
            return Response(
                {"detail": "Invalid or expired reset link."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if token.is_expired:
            return Response(
                {"detail": "This reset link has expired. Please request a new one."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if token.user.is_oauth_user:
            token.used = True
            token.save(update_fields=["used"])
            return Response(
                {"detail": "Password reset is disabled for 42 OAuth accounts."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token.used = True
        token.save(update_fields=["used"])
        token.user.set_password(new_password)
        token.user.save(update_fields=["password"])

        return Response(
            {"detail": "Password reset successfully."},
            status=status.HTTP_200_OK,
        )
