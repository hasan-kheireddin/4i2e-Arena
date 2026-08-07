"""
It is used to rate-limit sensetive auth endpoints.
It prevent calling /login or /register unlimited times.
"""
from __future__ import annotations

from rest_framework.throttling import ScopedRateThrottle


class AuthScopedRateThrottle(ScopedRateThrottle):
    pass
