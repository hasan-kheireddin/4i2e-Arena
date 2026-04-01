from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView
from django.contrib.auth import get_user_model
from .models import EmailVerificationToken
from .email_service import send_otp_email, send_password_reset_email
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

User = get_user_model()
from apps.analytics.tracking_service import (
    get_client_ip,
    get_user_agent,
    track_login,
    track_logout,
    track_profile_updated,
    track_registration,
)

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
        user = serializer.save()

        # Mark account inactive until email is verified
        user.is_active = False
        user.save(update_fields=["is_active"])

        # Create OTP and send verification email
        token = EmailVerificationToken.create_otp(user)
        try:
            send_otp_email(user, token.code)
        except Exception:
            pass  # Email failure should not block registration response

        # Track registration event
        track_registration(
            user.pk,
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
        )
        return Response(
            {
                "requires_verification": True,
                "email": user.email,
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
    endpoint to complete login. (2FA flow is implemented in Task 2.3.)
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]

        # Update last activity
        user.last_activity = timezone.now()
        user.save(update_fields=["last_activity"])

        # If 2FA is enabled, signal the client to complete verification
        if user.is_2fa_enabled:
            # Generate a short-lived token for the 2FA step
            refresh = RefreshToken.for_user(user)
            refresh.set_exp(lifetime=timezone.timedelta(minutes=5))
            return Response(
                {
                    "requires_2fa": True,
                    "temp_token": str(refresh.access_token),
                    "user_id": str(user.id),
                },
                status=status.HTTP_200_OK,
            )

        tokens = get_tokens_for_user(user)
        profile = UserProfileSerializer(user).data
        # Track login event
        track_login(
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

        # Track logout event
        track_logout(
            request.user.pk,
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
        )

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
            # Token is blacklisted, expired, or invalid — return 401 instead of 500
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
        track_profile_updated(
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
        email = serializer.validated_data["email"]
        code = serializer.validated_data["code"]

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response(
                {"detail": "Invalid verification code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token = (
            EmailVerificationToken.objects.filter(
                user=user,
                token_type=EmailVerificationToken.TYPE_EMAIL_VERIFY,
                used=False,
                code=code,
            )
            .order_by("-created_at")
            .first()
        )

        if not token:
            return Response(
                {"detail": "Invalid verification code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if token.is_expired:
            return Response(
                {"detail": "Verification code has expired. Please request a new one."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Mark token used, activate user
        token.used = True
        token.save(update_fields=["used"])
        user.is_active = True
        user.save(update_fields=["is_active"])

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
        try:
            user = User.objects.get(email__iexact=email, is_active=False)
        except User.DoesNotExist:
            # Don't reveal whether the email exists
            return Response(
                {"detail": "If that email exists, a new code has been sent."},
                status=status.HTTP_200_OK,
            )

        token = EmailVerificationToken.create_otp(user)
        try:
            send_otp_email(user, token.code)
        except Exception:
            pass

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
            token = EmailVerificationToken.create_reset_token(user)
            send_password_reset_email(user, token.code)
        except User.DoesNotExist:
            pass  # Don't reveal whether the email exists
        except Exception:
            pass

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

        token.used = True
        token.save(update_fields=["used"])
        token.user.set_password(new_password)
        token.user.save(update_fields=["password"])

        return Response(
            {"detail": "Password reset successfully."},
            status=status.HTTP_200_OK,
        )
