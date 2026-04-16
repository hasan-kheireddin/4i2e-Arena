import hashlib
import logging
import secrets
from urllib.parse import urlencode
import requests
from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import OAuthAccount, TOTPDevice
from .oauth_serializers import OAuthCallbackSerializer
from .oauth_providers import get_provider
from .serializers import UserProfileSerializer, get_tokens_for_user
from .twofa_views import _issue_temp_token
from apps.analytics.tracking_service import (
    get_client_ip,
    get_user_agent,
    track_oauth_login,
)

logger = logging.getLogger(__name__)
User = get_user_model()

class OAuthInitiateView(APIView):
    """
    GET /api/accounts/oauth/<provider>/initiate/

    Returns the authorization URL that the frontend should redirect the
    browser to. A cryptographically random ``state`` token is generated
    and stored server-side (in Django session) to prevent CSRF attacks.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request, provider):
        try:
            cfg = get_provider(provider)
        except ValueError:
            return Response(
                {"detail": f"Unknown OAuth provider: {provider}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not cfg.client_id:
            return Response(
                {"detail": f"OAuth provider '{provider}' is not configured."},
                status=status.HTTP_501_NOT_IMPLEMENTED,
            )

        # Generate a random state token for CSRF protection
        state = secrets.token_urlsafe(32)
        request.session[f"oauth_state_{provider}"] = state
        request.session.modified = True

        # Build the authorization URL
        params = {
            "client_id": cfg.client_id,
            "redirect_uri": cfg.redirect_uri,
            "response_type": "code",
            "scope": " ".join(cfg.scopes),
            "state": state,
        }
        authorize_url = f"{cfg.authorize_url}?{urlencode(params)}"

        return Response({"authorize_url": authorize_url})

class OAuthCallbackView(APIView):
    """
    POST /api/accounts/oauth/<provider>/callback/

    Receives the authorization ``code`` and ``state`` from the OAuth
    provider callback. The flow:

    1. Validate the state token against the session (CSRF check).
    2. Exchange the authorization code for an access token.
    3. Fetch the user profile from the provider.
    4. Find or create the local User + OAuthAccount link.
    5. Return a JWT token pair + user profile.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request, provider):
        # ---- Validate provider ------------------------------------------------
        try:
            cfg = get_provider(provider)
        except ValueError:
            return Response(
                {"detail": f"Unknown OAuth provider: {provider}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ---- Validate code & state --------------------------------------------
        serializer = OAuthCallbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]
        state = serializer.validated_data["state"]

        # CSRF: compare with session state
        expected_state = request.session.pop(f"oauth_state_{provider}", None)
        if not expected_state or not secrets.compare_digest(expected_state, state):
            return Response(
                {"detail": "Invalid or expired state parameter."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # ---- Exchange code for access token -----------------------------------
        token_data = self._exchange_code(cfg, code)
        if token_data is None:
            return Response(
                {"detail": "Failed to exchange authorization code."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        access_token = token_data.get("access_token", "")

        # ---- Fetch provider user profile --------------------------------------
        profile = self._fetch_profile(cfg, access_token)
        if profile is None:
            return Response(
                {"detail": "Failed to fetch user profile from provider."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # ---- Map provider data to normalised dict -----------------------------
        mapped = cfg.profile_mapper(profile)
        provider_user_id = mapped["provider_user_id"]

        # ---- Find or create User + OAuthAccount -------------------------------
        user = self._get_or_create_user(provider, provider_user_id, mapped, access_token)

        # ---- Enforce 2FA before issuing final JWTs ----------------------------
        if user.is_2fa_enabled:
            has_confirmed_device = TOTPDevice.objects.filter(
                user=user,
                confirmed=True,
            ).exists()
            if has_confirmed_device:
                return Response(
                    {
                        "requires_2fa": True,
                        "temp_token": _issue_temp_token(
                            user,
                            auth_method="oauth",
                            provider=provider,
                        ),
                        "user_id": str(user.id),
                    },
                    status=status.HTTP_200_OK,
                )

            logger.warning(
                "User %s has is_2fa_enabled=True but no confirmed TOTP device during OAuth login",
                user.pk,
            )
            user.is_2fa_enabled = False
            user.save(update_fields=["is_2fa_enabled"])

        # ---- Issue JWT tokens -------------------------------------------------
        tokens = get_tokens_for_user(user)
        user_data = UserProfileSerializer(user).data

        # Track OAuth login event
        track_oauth_login(
            user.pk,
            provider=provider,
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
        )
        
        return Response(
            {"user": user_data, "tokens": tokens},
            status=status.HTTP_200_OK,
        )

    # -----------------------------------------------------------------------
    # Private helpers
    # -----------------------------------------------------------------------

    @staticmethod
    def _exchange_code(cfg, code: str) -> dict | None:
        """POST to the token endpoint to swap the auth code for tokens."""
        try:
            resp = requests.post(
                cfg.token_url,
                data={
                    "grant_type": "authorization_code",
                    "client_id": cfg.client_id,
                    "client_secret": cfg.client_secret,
                    "redirect_uri": cfg.redirect_uri,
                    "code": code,
                },
                headers={"Accept": "application/json"},
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException:
            logger.exception("OAuth token exchange failed for %s", cfg.name)
            return None

    @staticmethod
    def _fetch_profile(cfg, access_token: str) -> dict | None:
        """GET the user-info endpoint using the access token."""
        try:
            resp = requests.get(
                cfg.user_info_url,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json",
                },
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException:
            logger.exception("OAuth profile fetch failed for %s", cfg.name)
            return None

    @staticmethod
    def _get_or_create_user(
        provider: str,
        provider_user_id: str,
        mapped: dict,
        access_token: str,
    ) -> User:
        """
        Locate or create the local User linked to this OAuth identity.

        Priority:
        1. Existing OAuthAccount link → return the linked user.
        2. Existing User with matching email → create OAuthAccount link.
        3. No match → create brand-new User + OAuthAccount.
        """
        # 1. Already linked?
        try:
            oauth = OAuthAccount.objects.select_related("user").get(
                provider=provider,
                provider_user_id=provider_user_id,
            )
            # Update stored access token (may have been rotated)
            if access_token and oauth.access_token != access_token:
                oauth.access_token = access_token
                oauth.save(update_fields=["access_token"])
            OAuthCallbackView._sync_oauth_user(oauth.user, mapped)
            return oauth.user
        except OAuthAccount.DoesNotExist:
            pass

        email = mapped.get("email", "").strip().lower()

        # 2. Same email exists? Link the OAuth account to that user.
        if email:
            try:
                existing_user = User.objects.get(email=email)
                OAuthAccount.objects.create(
                    user=existing_user,
                    provider=provider,
                    provider_user_id=provider_user_id,
                    access_token=access_token,
                )
                existing_user.set_unusable_password()
                existing_user.save(update_fields=["password"])
                OAuthCallbackView._sync_oauth_user(existing_user, mapped)
                return existing_user
            except User.DoesNotExist:
                pass

        # 3. Brand-new user
        username = _unique_username(mapped.get("username", "user"))
        user = User.objects.create_user(
            username=username,
            email=email,
            display_name=mapped.get("display_name", username),
            avatar_url=mapped.get("avatar_url", ""),
        )
        user.set_unusable_password()
        user.save(update_fields=["password"])
        OAuthAccount.objects.create(
            user=user,
            provider=provider,
            provider_user_id=provider_user_id,
            access_token=access_token,
        )
        OAuthCallbackView._sync_oauth_user(user, mapped)
        return user

    @staticmethod
    def _sync_oauth_user(user: User, mapped: dict) -> None:
        """
        Keep OAuth-managed fields aligned with provider data on login.

        Email is treated as provider-owned and is only updated from the
        OAuth profile when the new value does not collide with another user.
        """
        update_fields: list[str] = []

        provider_email = mapped.get("email", "").strip().lower()
        if (
            provider_email
            and user.email != provider_email
            and not User.objects.filter(email__iexact=provider_email).exclude(pk=user.pk).exists()
        ):
            user.email = provider_email
            update_fields.append("email")

        if user.has_usable_password():
            user.set_unusable_password()
            update_fields.append("password")

        if update_fields:
            user.save(update_fields=update_fields)

def _unique_username(base: str) -> str:
    """
    Generate a unique username from a base string.

    If ``base`` is taken, append a short random suffix until a free slot is
    found (practically always on the first try).
    """
    # Sanitise: keep only alphanumerics and underscores, truncate
    clean = "".join(c for c in base if c.isalnum() or c == "_")[:20] or "user"

    if not User.objects.filter(username=clean).exists():
        return clean

    for _ in range(10):
        suffix = secrets.token_hex(3)  # 6 hex chars
        candidate = f"{clean}_{suffix}"
        if not User.objects.filter(username=candidate).exists():
            return candidate

    # Absolute fallback — hash-based
    return f"user_{hashlib.sha256(secrets.token_bytes(16)).hexdigest()[:10]}"
