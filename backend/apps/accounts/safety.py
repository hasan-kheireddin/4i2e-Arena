"""
It is used as protective layer around redis/django cache system.
It uses a decorator, decorator used to run a function and if the function fails,
it prevent breaking the application by exception.
"""
from __future__ import annotations

from functools import wraps
from typing import Any, Callable, TypeVar

from django.core.cache import cache

F = TypeVar("F", bound=Callable[..., Any])


def non_blocking(func: F) -> F:
    @wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return func(*args, **kwargs)
        except Exception:
            return None

    return wrapper  # type: ignore[return-value]


def safe_cache_get(key: str, default: Any = None) -> Any:
    try:
        return cache.get(key, default)
    except Exception:
        return default


def safe_cache_set(key: str, value: Any, timeout: int | None = None) -> bool:
    try:
        cache.set(key, value, timeout=timeout)
        return True
    except Exception:
        return False


def safe_cache_delete(key: str) -> bool:
    try:
        cache.delete(key)
        return True
    except Exception:
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
    except Exception:
        current = int(safe_cache_get(key, 0) or 0) + delta
        safe_cache_set(key, current, timeout=timeout)
        return current
