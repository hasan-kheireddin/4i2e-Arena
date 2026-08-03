"""
Django settings for ft_transcendence project.

Generated for Django 5.1 with Channels, DRF, JWT, CORS, and PostgreSQL.
"""

from __future__ import annotations
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse

import dj_database_url
from decouple import config

# ---------------------------------------------------------------------------
# Base paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent


def _split_csv(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def _normalise_origin(origin: str) -> str:
    return origin.strip().rstrip("/")


def _origin_host(origin: str) -> str:
    parsed = urlparse(origin)
    return parsed.hostname or ""

# ---------------------------------------------------------------------------
# Security
# ---------------------------------------------------------------------------
SECRET_KEY = config(
    "DJANGO_SECRET_KEY",
    default="change-me-in-production-very-secret-key",
)

DEBUG = config("DJANGO_DEBUG", default=False, cast=bool)
DEFAULT_PUBLIC_APP_ORIGIN = "https://localhost:8443"
PUBLIC_APP_ORIGIN = _normalise_origin(
    config("PUBLIC_APP_ORIGIN", default=DEFAULT_PUBLIC_APP_ORIGIN)
    or DEFAULT_PUBLIC_APP_ORIGIN
)
PUBLIC_APP_HOST = _origin_host(PUBLIC_APP_ORIGIN)

_allowed_hosts_default = "localhost,127.0.0.1,backend,host.docker.internal"
ALLOWED_HOSTS_RAW = config("DJANGO_ALLOWED_HOSTS", default=_allowed_hosts_default)
if ALLOWED_HOSTS_RAW.strip() == "*":
    ALLOWED_HOSTS = ["*"]
else:
    ALLOWED_HOSTS = _dedupe(
        _split_csv(ALLOWED_HOSTS_RAW)
        + ([PUBLIC_APP_HOST] if PUBLIC_APP_HOST else [])
    )

# ---------------------------------------------------------------------------
# Application definition
# ---------------------------------------------------------------------------
INSTALLED_APPS = [
    # Django built-ins
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "channels",

    # Local apps
    "apps.accounts",
    "apps.games",
    "apps.analytics",
    "apps.chat",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
_default_db_url = (
    "postgres://ft_user:ft_password@localhost:5432/ft_transcendence"
)
DATABASES = {
    "default": dj_database_url.config(
        env="DATABASE_URL",
        default=_default_db_url,
        conn_max_age=600,
        conn_health_checks=True,
    )
}

# ---------------------------------------------------------------------------
# Custom user model
# ---------------------------------------------------------------------------
AUTH_USER_MODEL = "accounts.User"

# ---------------------------------------------------------------------------
# Password validation
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "UserAttributeSimilarityValidator"
        ),
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ---------------------------------------------------------------------------
# Internationalisation
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# ---------------------------------------------------------------------------
# Default primary key
# ---------------------------------------------------------------------------
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.accounts.authentication.CookieOrHeaderJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
        "rest_framework.parsers.FormParser",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "auth_login": config("THROTTLE_AUTH_LOGIN", default="10/min"),
        "auth_register": config("THROTTLE_AUTH_REGISTER", default="5/min"),
        "auth_password_reset": config("THROTTLE_AUTH_PASSWORD_RESET", default="5/min"),
        "auth_otp": config("THROTTLE_AUTH_OTP", default="5/min"),
        "auth_2fa": config("THROTTLE_AUTH_2FA", default="10/min"),
    },
}

# ---------------------------------------------------------------------------
# Simple JWT
# ---------------------------------------------------------------------------
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": False,
    "BLACKLIST_AFTER_ROTATION": False,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

JWT_ACCESS_COOKIE_NAME = config("JWT_ACCESS_COOKIE_NAME", default="access_token")
JWT_REFRESH_COOKIE_NAME = config("JWT_REFRESH_COOKIE_NAME", default="refresh_token")
JWT_COOKIE_SECURE = config("JWT_COOKIE_SECURE", default=True, cast=bool)
JWT_COOKIE_SAMESITE = config("JWT_COOKIE_SAMESITE", default="Lax")

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
CORS_ALLOW_ALL_ORIGINS = config(
    "CORS_ALLOW_ALL_ORIGINS",
    default=DEBUG,
    cast=bool,
)
_default_trusted_origins = _dedupe(
    [
        PUBLIC_APP_ORIGIN,
        "https://127.0.0.1:8443",
        "https://host.docker.internal:8443",
    ]
)
_cors_raw = config("CORS_ALLOWED_ORIGINS", default="")
CORS_ALLOWED_ORIGINS: list[str] = (
    _dedupe(_split_csv(_cors_raw) or _default_trusted_origins)
    if not CORS_ALLOW_ALL_ORIGINS
    else []
)
CORS_ALLOW_CREDENTIALS = True
CORS_EXPOSE_HEADERS = ["Content-Disposition"]

_csrf_raw = config("CSRF_TRUSTED_ORIGINS", default="")
CSRF_TRUSTED_ORIGINS: list[str] = _dedupe(
    _split_csv(_csrf_raw) or _default_trusted_origins
)

# ---------------------------------------------------------------------------
# Channels / Redis
# ---------------------------------------------------------------------------
REDIS_URL = config("REDIS_URL", default="redis://localhost:6379/0")
USE_IN_MEMORY_SERVICES = config("USE_IN_MEMORY_SERVICES", default=False, cast=bool)

CHANNEL_LAYERS = (
    {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
    if USE_IN_MEMORY_SERVICES
    else {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [REDIS_URL]},
        },
    }
)

# ---------------------------------------------------------------------------
# Cache (Redis)
# ---------------------------------------------------------------------------
CACHES = (
    {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
    if USE_IN_MEMORY_SERVICES
    else {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
            "TIMEOUT": 300,
            "KEY_PREFIX": "ftt",
        }
    }
)

# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------
SESSION_ENGINE = "django.contrib.sessions.backends.cache"
SESSION_CACHE_ALIAS = "default"
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True

# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------
EMAIL_BACKEND = config(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.console.EmailBackend",
)
EMAIL_HOST = config("EMAIL_HOST", default="smtp.gmail.com")
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=True, cast=bool)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="noreply@4i2e-arena.com")
FRONTEND_URL = _normalise_origin(
    config("FRONTEND_URL", default=PUBLIC_APP_ORIGIN) or PUBLIC_APP_ORIGIN
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {process:d} {thread:d} {message}",
            "style": "{",
        },
        "simple": {
            "format": "{levelname} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "channels": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "analytics": {
            "handlers": ["console"],
            "level": "DEBUG",
            "propagate": False,
        },
        "games": {
            "handlers": ["console"],
            "level": "DEBUG",
            "propagate": False,
        },
    },
}
