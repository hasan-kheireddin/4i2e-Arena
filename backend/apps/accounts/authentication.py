from __future__ import annotations

from django.conf import settings
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication


class CookieOrHeaderJWTAuthentication(JWTAuthentication):
    """
    Authenticate with the standard Authorization header first, then fall back
    to the Secure HttpOnly access-token cookie set by the auth endpoints.
    """

    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            raw_token = self.get_raw_token(header)
            if raw_token is not None:
                validated_token = self.get_validated_token(raw_token)
                return self.get_user(validated_token), validated_token

        cookie_name = getattr(settings, "JWT_ACCESS_COOKIE_NAME", "access_token")
        raw_token = request.COOKIES.get(cookie_name)
        if not raw_token:
            return None

        # Cookie credentials are ambient, unlike an explicit Authorization
        # header. Require unsafe browser requests to originate from this app.
        if request.method not in {"GET", "HEAD", "OPTIONS", "TRACE"}:
            origin = request.headers.get("Origin", "").rstrip("/")
            allowed = {
                f"{request.scheme}://{request.get_host()}".rstrip("/"),
                *(value.rstrip("/") for value in settings.CSRF_TRUSTED_ORIGINS),
            }
            if not origin or origin not in allowed:
                raise AuthenticationFailed("Untrusted request origin.")

        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token
