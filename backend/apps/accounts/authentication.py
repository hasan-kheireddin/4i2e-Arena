"""
It contain most important function, it is called for every API request that uses this authentication class,
It asks does the request contain a valid credentials?if so, which user is making the request?
"""
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

        try:
            validated_token = self.get_validated_token(raw_token)
            return self.get_user(validated_token), validated_token
        except AuthenticationFailed:
            # Cookies are ambient credentials and can outlive the database
            # they were issued against (for example after a local DB reset).
            # Treat a stale/invalid cookie as anonymous so AllowAny endpoints
            # such as register and login remain reachable. An explicit invalid
            # Authorization header is still rejected by the branch above.
            return None
