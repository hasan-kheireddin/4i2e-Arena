# =============================================================================
# Accounts — Two-Factor Authentication Views
# =============================================================================
# Endpoints:
#
#   POST  /api/accounts/2fa/setup/        → Generate TOTP secret + QR code
#   POST  /api/accounts/2fa/confirm/      → Confirm setup with first code
#   POST  /api/accounts/2fa/verify/       → Verify TOTP during login
#   POST  /api/accounts/2fa/disable/      → Disable 2FA
#   POST  /api/accounts/2fa/recovery/     → Use recovery code during login
#   GET   /api/accounts/2fa/status/       → Check 2FA status
# =============================================================================

import io
import logging
import base64
import pyotp
import qrcode
from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import TokenError
from .models import TOTPDevice
from .serializers import UserProfileSerializer, get_tokens_for_user
from .twofa_serializers import (
    TwoFactorConfirmSerializer,
    TwoFactorDisableSerializer,
    TwoFactorVerifySerializer,
    RecoveryCodeSerializer,
)
from apps.analytics.tracking_service import (
    get_client_ip,
    get_user_agent,
    track_2fa_verified,
)

logger = logging.getLogger(__name__)
User = get_user_model()

TOTP_ISSUER = "ft_transcendence"


# ---------------------------------------------------------------------------
# Helper: resolve user from a temporary token
# ---------------------------------------------------------------------------
def _user_from_temp_token(token_str: str) -> User | None:
    """
    Decode the short-lived access token issued at login when 2FA is required
    and return the corresponding user.
    """
    try:
        token = AccessToken(token_str)
        user_id = token.get("user_id")
        return User.objects.get(id=user_id)
    except (TokenError, User.DoesNotExist, KeyError):
        return None


# ---------------------------------------------------------------------------
# 2FA Setup — POST /api/accounts/2fa/setup/
# ---------------------------------------------------------------------------
class TwoFactorSetupView(APIView):
    """
    Generate a new TOTP secret for the authenticated user and return:
      - secret       : base32-encoded string (for manual entry)
      - otpauth_uri  : URI for QR code scanning
      - qr_code      : base64-encoded PNG image of the QR code
      - recovery_codes : list of 8 single-use backup codes

    If the user already has a *confirmed* device, returns 400 — they
    must disable 2FA first before re-enrolling.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user

        # Block if already confirmed
        if hasattr(user, "totp_device") and user.totp_device.confirmed:
            return Response(
                {"detail": "2FA is already enabled. Disable it first to re-enroll."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Delete any prior unconfirmed device
        TOTPDevice.objects.filter(user=user, confirmed=False).delete()

        # Generate new TOTP secret
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        otpauth_uri = totp.provisioning_uri(
            name=user.email or user.username,
            issuer_name=TOTP_ISSUER,
        )

        # Generate QR code as base64 PNG
        qr_img = qrcode.make(otpauth_uri, box_size=6, border=2)
        buf = io.BytesIO()
        qr_img.save(buf, format="PNG")
        qr_b64 = base64.b64encode(buf.getvalue()).decode()

        # Create the device (unconfirmed)
        device = TOTPDevice(user=user)
        device.set_secret(secret)
        recovery_codes = device.generate_recovery_codes()
        device.save()

        return Response(
            {
                "secret": secret,
                "otpauth_uri": otpauth_uri,
                "qr_code": f"data:image/png;base64,{qr_b64}",
                "recovery_codes": recovery_codes,
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# 2FA Confirm — POST /api/accounts/2fa/confirm/
# ---------------------------------------------------------------------------
class TwoFactorConfirmView(APIView):
    """
    The user enters the first 6-digit code from their authenticator app
    to prove the secret was scanned/entered correctly. On success the
    device is marked ``confirmed`` and the user's ``is_2fa_enabled`` flag
    is set.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = TwoFactorConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]

        user = request.user
        try:
            device = TOTPDevice.objects.get(user=user)
        except TOTPDevice.DoesNotExist:
            return Response(
                {"detail": "No 2FA setup found. Call /2fa/setup/ first."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if device.confirmed:
            return Response(
                {"detail": "2FA is already confirmed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify the TOTP code
        secret = device.get_secret()
        totp = pyotp.TOTP(secret)
        if not totp.verify(code, valid_window=1):
            return Response(
                {"detail": "Invalid code. Please try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Mark confirmed
        device.confirmed = True
        device.save(update_fields=["confirmed"])

        user.is_2fa_enabled = True
        user.save(update_fields=["is_2fa_enabled"])

        return Response(
            {"detail": "Two-factor authentication enabled successfully."},
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# 2FA Verify (login step 2) — POST /api/accounts/2fa/verify/
# ---------------------------------------------------------------------------
class TwoFactorVerifyView(APIView):
    """
    Second step of the login flow when 2FA is enabled.

    Receives the *temporary token* (issued by LoginView) and a 6-digit
    TOTP code. If valid, returns the full JWT token pair + user profile.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = TwoFactorVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        temp_token = serializer.validated_data["temp_token"]
        code = serializer.validated_data["code"]

        # Resolve user from temp token
        user = _user_from_temp_token(temp_token)
        if user is None:
            return Response(
                {"detail": "Invalid or expired temporary token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Verify TOTP
        try:
            device = TOTPDevice.objects.get(user=user, confirmed=True)
        except TOTPDevice.DoesNotExist:
            return Response(
                {"detail": "2FA is not set up for this account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        secret = device.get_secret()
        totp = pyotp.TOTP(secret)
        if not totp.verify(code, valid_window=1):
            return Response(
                {"detail": "Invalid TOTP code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Issue full JWT tokens
        tokens = get_tokens_for_user(user)
        profile = UserProfileSerializer(user).data
        
        # Track 2FA verification event
        track_2fa_verified(
            user.pk,
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
        )
        
        return Response(
            {"user": profile, "tokens": tokens},
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# 2FA Disable — POST /api/accounts/2fa/disable/
# ---------------------------------------------------------------------------
class TwoFactorDisableView(APIView):
    """
    Disable 2FA for the authenticated user. Requires a valid TOTP code
    to prevent accidental or malicious disabling.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = TwoFactorDisableSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]

        user = request.user
        try:
            device = TOTPDevice.objects.get(user=user, confirmed=True)
        except TOTPDevice.DoesNotExist:
            return Response(
                {"detail": "2FA is not enabled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        secret = device.get_secret()
        totp = pyotp.TOTP(secret)
        if not totp.verify(code, valid_window=1):
            return Response(
                {"detail": "Invalid TOTP code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Remove device and clear flag
        device.delete()
        user.is_2fa_enabled = False
        user.save(update_fields=["is_2fa_enabled"])

        return Response(
            {"detail": "Two-factor authentication disabled."},
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# Recovery Code (login step 2 fallback) — POST /api/accounts/2fa/recovery/
# ---------------------------------------------------------------------------
class RecoveryCodeView(APIView):
    """
    Alternative to TOTP verification when the user has lost access to
    their authenticator app. Uses a single-use recovery code.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RecoveryCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        temp_token = serializer.validated_data["temp_token"]
        code = serializer.validated_data["code"]

        user = _user_from_temp_token(temp_token)
        if user is None:
            return Response(
                {"detail": "Invalid or expired temporary token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            device = TOTPDevice.objects.get(user=user, confirmed=True)
        except TOTPDevice.DoesNotExist:
            return Response(
                {"detail": "2FA is not set up for this account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not device.verify_recovery_code(code):
            return Response(
                {"detail": "Invalid recovery code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Issue full JWT tokens
        tokens = get_tokens_for_user(user)
        profile = UserProfileSerializer(user).data

        return Response(
            {
                "user": profile,
                "tokens": tokens,
                "remaining_recovery_codes": device.remaining_recovery_codes,
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# 2FA Status — GET /api/accounts/2fa/status/
# ---------------------------------------------------------------------------
class TwoFactorStatusView(APIView):
    """
    Returns the current 2FA status for the authenticated user.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        try:
            device = TOTPDevice.objects.get(user=user)
            return Response(
                {
                    "is_2fa_enabled": user.is_2fa_enabled,
                    "confirmed": device.confirmed,
                    "remaining_recovery_codes": device.remaining_recovery_codes,
                    "created_at": device.created_at.isoformat(),
                },
                status=status.HTTP_200_OK,
            )
        except TOTPDevice.DoesNotExist:
            return Response(
                {
                    "is_2fa_enabled": False,
                    "confirmed": False,
                    "remaining_recovery_codes": 0,
                    "created_at": None,
                },
                status=status.HTTP_200_OK,
            )
