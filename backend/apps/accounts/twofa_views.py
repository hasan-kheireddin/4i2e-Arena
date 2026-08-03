# =============================================================================
# Accounts — Two-Factor Authentication Views
# =============================================================================
# Endpoints:
#
#   POST  /api/accounts/2fa/setup/         → Generate TOTP secret + QR code
#   POST  /api/accounts/2fa/verify/        → Confirm setup with first code
#   POST  /api/accounts/2fa/login-verify/  → Verify TOTP during login
#   POST  /api/accounts/2fa/confirm/       → Backward-compatible alias for setup verification
#   POST  /api/accounts/2fa/disable/       → Disable 2FA
#   GET   /api/accounts/2fa/status/        → Check 2FA status
# =============================================================================

import io
import logging
import base64
import hashlib
import secrets
import time
import pyotp
import qrcode
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import TokenError
from .auth_cookies import set_auth_cookies
from .models import TOTPDevice
from .safety import (
    non_blocking,
    safe_cache_delete,
    safe_cache_get,
    safe_cache_incr_with_ttl,
)
from .serializers import UserProfileSerializer, get_tokens_for_user
from .throttles import AuthScopedRateThrottle
from .twofa_serializers import (
    TwoFactorConfirmSerializer,
    TwoFactorDisableSerializer,
    TwoFactorRecoveryRegenerateSerializer,
    TwoFactorVerifySerializer,
)
from apps.analytics.tracking_service import (
    get_client_ip,
    get_user_agent,
    track_2fa_verified,
)

logger = logging.getLogger(__name__)
User = get_user_model()
safe_track_2fa_verified = non_blocking(track_2fa_verified)

TOTP_ISSUER = "ft_transcendence"
TWOFA_ATTEMPT_LIMIT = 5
TWOFA_ATTEMPT_WINDOW = 300  # seconds


def _matching_timestep(totp: pyotp.TOTP, code: str) -> int | None:
    """Return the exact accepted counter within the one-step clock window."""
    current = int(time.time()) // totp.interval
    for timestep in range(current - 1, current + 2):
        if secrets.compare_digest(totp.at(timestep * totp.interval), code):
            return timestep
    return None


def _consume_second_factor(user: User, code: str) -> tuple[TOTPDevice, str] | None:
    """Atomically consume a TOTP timestep or one recovery code."""
    with transaction.atomic():
        try:
            device = TOTPDevice.objects.select_for_update().get(
                user=user,
                confirmed=True,
            )
        except TOTPDevice.DoesNotExist:
            return None

        normalized = code.strip().upper()
        if len(normalized) in (8, TOTPDevice.RECOVERY_CODE_LENGTH):
            candidate = hashlib.sha256(normalized.encode()).hexdigest()
            matched = next(
                (stored for stored in device.recovery_codes if secrets.compare_digest(stored, candidate)),
                None,
            )
            if matched is None:
                return None
            device.recovery_codes.remove(matched)
            device.save(update_fields=["recovery_codes"])
            return device, "recovery"

        totp = pyotp.TOTP(device.get_secret())
        timestep = _matching_timestep(totp, normalized)
        if timestep is None:
            return None
        if device.last_timestep is not None and timestep <= device.last_timestep:
            return None
        device.last_timestep = timestep
        device.save(update_fields=["last_timestep"])
        return device, "totp"


# ---------------------------------------------------------------------------
# Helper: resolve user from a temporary token
# ---------------------------------------------------------------------------
def _user_from_temp_token(token_str: str) -> tuple[User, str] | None:
    """
    Decode the short-lived access token issued at login when 2FA is required
    and return the corresponding user.
    """
    try:
        token = AccessToken(token_str)
        if not token.get("twofa_pending", False):
            return None
        user_id = token.get("user_id")
        jti = str(token.get("jti", ""))
        if not jti:
            return None
        return User.objects.get(id=user_id), jti
    except (TokenError, User.DoesNotExist, KeyError):
        return None


def _issue_temp_token(
    user: User,
    *,
    auth_method: str,
) -> str:
    """Issue a short-lived token that gates final login behind TOTP."""
    temp_token = AccessToken.for_user(user)
    temp_token.set_exp(lifetime=timezone.timedelta(minutes=5))
    temp_token["twofa_pending"] = True
    temp_token["auth_method"] = auth_method
    return str(temp_token)


def _attempt_cache_key(scope: str, user_id) -> str:
    return f"2fa_attempts:{scope}:{user_id}"


def _is_rate_limited(key: str) -> bool:
    return int(safe_cache_get(key, 0) or 0) >= TWOFA_ATTEMPT_LIMIT


def _record_failed_attempt(key: str) -> None:
    safe_cache_incr_with_ttl(key, timeout=TWOFA_ATTEMPT_WINDOW)


def _clear_failed_attempts(key: str) -> None:
    safe_cache_delete(key)


# ---------------------------------------------------------------------------
# 2FA Setup — POST /api/accounts/2fa/setup/
# ---------------------------------------------------------------------------
class TwoFactorSetupView(APIView):
    """
    Generate a new TOTP secret for the authenticated user and return:
      - secret       : base32-encoded string (for manual entry)
      - otpauth_uri  : URI for QR code scanning
      - qr_code      : base64-encoded PNG image of the QR code

    If the user already has a *confirmed* device, returns 400 — they
    must disable 2FA first before re-enrolling.
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AuthScopedRateThrottle]
    throttle_scope = "auth_2fa"

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
        device.save()

        return Response(
            {
                "secret": secret,
                "otpauth_uri": otpauth_uri,
                "qr_code": f"data:image/png;base64,{qr_b64}",
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# 2FA Verify Setup — POST /api/accounts/2fa/verify/
# ---------------------------------------------------------------------------
class TwoFactorConfirmView(APIView):
    """
    The user enters the first 6-digit code from their authenticator app
    to prove the secret was scanned/entered correctly. On success the
    device is marked ``confirmed`` and the user's ``is_2fa_enabled`` flag
    is set.
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AuthScopedRateThrottle]
    throttle_scope = "auth_2fa"

    def post(self, request):
        serializer = TwoFactorConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]

        user = request.user
        rate_key = _attempt_cache_key("setup", user.pk)
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

        if _is_rate_limited(rate_key):
            return Response(
                {"detail": "Too many invalid 2FA attempts. Please wait a few minutes and try again."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        # Verify once and store the accepted timestep to prevent replay.
        totp = pyotp.TOTP(device.get_secret())
        timestep = _matching_timestep(totp, code)
        if timestep is None:
            _record_failed_attempt(rate_key)
            return Response(
                {"detail": "Invalid code. Please try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Mark confirmed
        _clear_failed_attempts(rate_key)
        with transaction.atomic():
            device = TOTPDevice.objects.select_for_update().get(pk=device.pk)
            if device.last_timestep is not None and timestep <= device.last_timestep:
                _record_failed_attempt(rate_key)
                return Response(
                    {"detail": "This code was already used. Wait for a new code."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            recovery_codes = device.generate_recovery_codes()
            device.confirmed = True
            device.last_timestep = timestep
            device.save(update_fields=["confirmed", "last_timestep", "recovery_codes"])
            user.is_2fa_enabled = True
            user.save(update_fields=["is_2fa_enabled"])

        return Response(
            {
                "detail": "Two-factor authentication enabled successfully.",
                "recovery_codes": recovery_codes,
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# 2FA Verify (login step 2) — POST /api/accounts/2fa/login-verify/
# ---------------------------------------------------------------------------
class TwoFactorVerifyView(APIView):
    """
    Second step of the login flow when 2FA is enabled.

    Receives the *temporary token* (issued by LoginView) and a 6-digit
    TOTP code. If valid, returns the full JWT token pair + user profile.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthScopedRateThrottle]
    throttle_scope = "auth_2fa"

    def post(self, request):
        serializer = TwoFactorVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        temp_token = serializer.validated_data["temp_token"]
        code = serializer.validated_data["code"]

        session_user_id = request.session.get("2fa_user_id")
        if not session_user_id:
            return Response(
                {"detail": "2FA session expired. Please log in again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Resolve user from temp token
        token_context = _user_from_temp_token(temp_token)
        if token_context is None:
            return Response(
                {"detail": "Invalid or expired temporary token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user, token_jti = token_context
        if str(user.pk) != str(session_user_id):
            request.session.pop("2fa_user_id", None)
            return Response(
                {"detail": "2FA session mismatch. Please log in again."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        rate_key = _attempt_cache_key("login", user.pk)
        if _is_rate_limited(rate_key):
            return Response(
                {"detail": "Too many invalid 2FA attempts. Please wait a few minutes and try again."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        # Verify TOTP
        if not TOTPDevice.objects.filter(user=user, confirmed=True).exists():
            return Response(
                {"detail": "2FA is not set up for this account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        claim_key = f"2fa_temp_claim:{token_jti}"
        try:
            claimed = cache.add(claim_key, "claimed", timeout=300)
        except Exception:
            logger.exception("Unable to claim temporary 2FA token")
            return Response(
                {"detail": "2FA verification is temporarily unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        if not claimed:
            return Response(
                {"detail": "This temporary token is already being used or was consumed."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        verified = _consume_second_factor(user, code)
        if verified is None:
            safe_cache_delete(claim_key)
            _record_failed_attempt(rate_key)
            return Response(
                {"detail": "Invalid or already-used authentication code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Issue full JWT tokens
        _clear_failed_attempts(rate_key)
        tokens = get_tokens_for_user(user)
        profile = UserProfileSerializer(user).data

        # Track 2FA verification event (non-blocking)
        safe_track_2fa_verified(
            user.pk,
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
        )

        request.session.pop("2fa_user_id", None)
        response = Response(
            {"user": profile, "tokens": tokens},
            status=status.HTTP_200_OK,
        )
        return set_auth_cookies(response, tokens)


# ---------------------------------------------------------------------------
# 2FA Disable — POST /api/accounts/2fa/disable/
# ---------------------------------------------------------------------------
class TwoFactorDisableView(APIView):
    """
    Disable 2FA for the authenticated user. Requires a valid TOTP code
    to prevent accidental or malicious disabling.
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AuthScopedRateThrottle]
    throttle_scope = "auth_2fa"

    def post(self, request):
        serializer = TwoFactorDisableSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]

        user = request.user
        rate_key = _attempt_cache_key("disable", user.pk)
        try:
            device = TOTPDevice.objects.get(user=user, confirmed=True)
        except TOTPDevice.DoesNotExist:
            return Response(
                {"detail": "2FA is not enabled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if _is_rate_limited(rate_key):
            return Response(
                {"detail": "Too many invalid 2FA attempts. Please wait a few minutes and try again."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        verified = _consume_second_factor(user, code)
        if verified is None:
            _record_failed_attempt(rate_key)
            return Response(
                {"detail": "Invalid or already-used authentication code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Remove device and clear flag
        _clear_failed_attempts(rate_key)
        device.delete()
        user.is_2fa_enabled = False
        user.save(update_fields=["is_2fa_enabled"])

        return Response(
            {"detail": "Two-factor authentication disabled."},
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
                    "created_at": device.created_at.isoformat(),
                    "remaining_recovery_codes": device.remaining_recovery_codes,
                },
                status=status.HTTP_200_OK,
            )
        except TOTPDevice.DoesNotExist:
            return Response(
                {
                    "is_2fa_enabled": False,
                    "confirmed": False,
                    "created_at": None,
                    "remaining_recovery_codes": 0,
                },
                status=status.HTTP_200_OK,
            )


class TwoFactorRecoveryRegenerateView(APIView):
    """Replace all recovery codes after verifying a current second factor."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AuthScopedRateThrottle]
    throttle_scope = "auth_2fa"

    def post(self, request):
        serializer = TwoFactorRecoveryRegenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        rate_key = _attempt_cache_key("recovery", user.pk)
        if _is_rate_limited(rate_key):
            return Response(
                {"detail": "Too many invalid 2FA attempts. Please wait and try again."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        verified = _consume_second_factor(user, serializer.validated_data["code"])
        if verified is None:
            _record_failed_attempt(rate_key)
            return Response(
                {"detail": "Invalid or already-used authentication code."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        device, _ = verified
        with transaction.atomic():
            device = TOTPDevice.objects.select_for_update().get(pk=device.pk)
            recovery_codes = device.generate_recovery_codes()
            device.save(update_fields=["recovery_codes"])
        _clear_failed_attempts(rate_key)
        return Response({"recovery_codes": recovery_codes}, status=status.HTTP_200_OK)
