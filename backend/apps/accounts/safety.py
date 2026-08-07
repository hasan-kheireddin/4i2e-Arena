"""
It is used as protective layer around redis/django cache system.
It uses a decorator, decorator used to run a function and if the function fails,
it prevent breaking the application by exception.
"""
from __future__ import annotations

import logging
from functools import wraps
from typing import Any, Callable, TypeVar

from django.core.cache import cache

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])


def non_blocking(func: F) -> F:
    @wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return func(*args, **kwargs)
        except Exception as exc:
            logger.warning("%s failed: %s", func.__name__, exc, exc_info=True)
            return None

    return wrapper  # type: ignore[return-value]


def safe_cache_get(key: str, default: Any = None) -> Any:
    try:
        return cache.get(key, default)
    except Exception as exc:
        logger.warning("cache.get failed for key=%s: %s", key, exc, exc_info=True)
        return default


def safe_cache_set(key: str, value: Any, timeout: int | None = None) -> bool:
    try:
        cache.set(key, value, timeout=timeout)
        return True
    except Exception as exc:
        logger.warning("cache.set failed for key=%s: %s", key, exc, exc_info=True)
        return False


def safe_cache_delete(key: str) -> bool:
    try:
        cache.delete(key)
        return True
    except Exception as exc:
        logger.warning("cache.delete failed for key=%s: %s", key, exc, exc_info=True)
        return False


def safe_cache_incr_with_ttl(
    key: str,
    *,
    delta: int = 1,
    timeout: int | None = None,
) -> int:
    try:
        if cache.add(key, 0, timeout=timeout):
            return cache.incr(key, delta)
        return cache.incr(key, delta)
    except Exception as exc:
        logger.warning("cache.incr failed for key=%s: %s", key, exc, exc_info=True)
        current = int(safe_cache_get(key, 0) or 0) + delta
        safe_cache_set(key, current, timeout=timeout)
        return current
