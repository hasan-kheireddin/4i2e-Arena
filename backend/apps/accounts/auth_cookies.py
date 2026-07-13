from __future__ import annotations

from datetime import timedelta
from typing import Mapping

from django.conf import settings
from django.http import HttpResponse


def _max_age(delta: timedelta) -> int:
    return int(delta.total_seconds())


def set_auth_cookies(response: HttpResponse, tokens: Mapping[str, str]) -> HttpResponse:
    access = tokens.get("access")
    refresh = tokens.get("refresh")
    jwt_settings = settings.SIMPLE_JWT
    cookie_kwargs = {
        "secure": getattr(settings, "JWT_COOKIE_SECURE", True),
        "httponly": True,
        "samesite": getattr(settings, "JWT_COOKIE_SAMESITE", "Lax"),
        "path": "/",
    }

    if access:
        response.set_cookie(
            getattr(settings, "JWT_ACCESS_COOKIE_NAME", "access_token"),
            access,
            max_age=_max_age(jwt_settings["ACCESS_TOKEN_LIFETIME"]),
            **cookie_kwargs,
        )
    if refresh:
        response.set_cookie(
            getattr(settings, "JWT_REFRESH_COOKIE_NAME", "refresh_token"),
            refresh,
            max_age=_max_age(jwt_settings["REFRESH_TOKEN_LIFETIME"]),
            **cookie_kwargs,
        )
    return response


def clear_auth_cookies(response: HttpResponse) -> HttpResponse:
    cookie_kwargs = {
        "path": "/",
        "samesite": getattr(settings, "JWT_COOKIE_SAMESITE", "Lax"),
    }
    response.delete_cookie(
        getattr(settings, "JWT_ACCESS_COOKIE_NAME", "access_token"),
        **cookie_kwargs,
    )
    response.delete_cookie(
        getattr(settings, "JWT_REFRESH_COOKIE_NAME", "refresh_token"),
        **cookie_kwargs,
    )
    return response
