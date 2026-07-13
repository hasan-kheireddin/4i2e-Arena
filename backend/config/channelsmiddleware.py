from __future__ import annotations
import logging
from typing import Any
from urllib.parse import parse_qs, urlencode
from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import AccessToken

logger = logging.getLogger("channels.jwt")

User = get_user_model()


class JWTAuthMiddleware(BaseMiddleware):
    """
    ASGI middleware that authenticates WebSocket connections via a JWT
    access token supplied in the Secure HttpOnly cookie. Query-string tokens
    are accepted only as a backward-compatible fallback and are scrubbed before
    downstream handling.

    Sets ``scope["user"]`` to the authenticated user on success, or
    ``AnonymousUser`` on failure (missing / invalid / expired token).

    Origin validation is **not** handled here — use Channels'
    ``OriginValidator`` in ``asgi.py`` instead.
    """

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        # Only intercept WebSocket connections
        if scope["type"] != "websocket":
            await super().__call__(scope, receive, send)
            return

        scope["user"] = await self._authenticate(scope)
        await super().__call__(scope, receive, send)

    @staticmethod
    def _extract_cookie_token(scope: dict[str, Any]) -> str | None:
        headers = dict(scope.get("headers", []))
        raw_cookie = headers.get(b"cookie")
        if not raw_cookie:
            return None

        cookie_name = getattr(settings, "JWT_ACCESS_COOKIE_NAME", "access_token")
        try:
            cookie_header = raw_cookie.decode("latin1")
        except UnicodeDecodeError:
            return None

        for chunk in cookie_header.split(";"):
            name, _, value = chunk.strip().partition("=")
            if name == cookie_name and value:
                return value
        return None

    @staticmethod
    def _extract_token(scope: dict[str, Any]) -> str | None:
        """
        Pull the legacy ``token`` parameter from the query string.

        ``scope["query_string"]`` is a raw ``bytes`` object, e.g.
        ``b"token=eyJ…&other=value"``.

        After extraction the token is **scrubbed** from the query string
        so that it does not leak to downstream middleware or logging.

        Malformed (non-UTF-8) query strings are handled gracefully.
        """
        raw_qs: bytes = scope.get("query_string", b"")

        try:
            qs = parse_qs(raw_qs.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            logger.debug("Unparseable query string on WebSocket connection")
            return None

        tokens = qs.get("token")
        if not tokens:
            return None

        qs.pop("token", None)
        scope["query_string"] = urlencode(qs, doseq=True).encode("utf-8")

        return tokens[0]

    @classmethod
    async def _authenticate(
        cls, scope: dict[str, Any],
    ) -> AnonymousUser | Any:
        """
        Validate the JWT and return the authenticated user, or
        ``AnonymousUser`` if the token is missing / invalid / expired
        or the user account is inactive.
        """
        raw_token = cls._extract_cookie_token(scope) or cls._extract_token(scope)
        if raw_token is None:
            logger.debug("WebSocket connection without JWT token")
            return AnonymousUser()

        try:
            validated = AccessToken(raw_token)
        except (InvalidToken, TokenError) as exc:
            logger.debug("JWT validation failed: %s", exc)
            return AnonymousUser()

        user_id = validated.get("user_id")
        if user_id is None:
            logger.debug("JWT payload missing user_id claim")
            return AnonymousUser()

        user = await cls._get_user(user_id)
        if user is None:
            logger.debug("No user found for user_id=%s", user_id)
            return AnonymousUser()

        if not getattr(user, "is_active", True):
            logger.debug("Inactive user attempted WebSocket auth user_id=%s", user_id)
            return AnonymousUser()

        return user

    @staticmethod
    @database_sync_to_async
    def _get_user(user_id: int | str) -> Any | None:
        """Fetch the user from the database (runs in a thread)."""
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None
