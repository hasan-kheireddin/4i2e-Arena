from __future__ import annotations
import logging
from datetime import timedelta
from typing import Any, Optional
from uuid import UUID
from django.core.cache import cache
from django.db.models import Count, Q
from django.db.models.functions import (
    ExtractHour,
    ExtractWeekDay,
    TruncDate,
)
from django.utils import timezone
from apps.analytics.models import ActivityEvent, EventCategory

logger = logging.getLogger("analytics.aggregation")

AGGREGATION_CACHE_TTL = 300  # 5 minutes

def _user_summary_key(user_id: UUID | int) -> str:
    return f"analytics:summary:{user_id}"


def _user_timeline_key(user_id: UUID | int, days: int) -> str:
    return f"analytics:timeline:{user_id}:{days}"


def _user_heatmap_key(user_id: UUID | int) -> str:
    return f"analytics:heatmap:{user_id}"


def invalidate_user_activity_cache(user_id: UUID | int) -> None:
    """Bust activity caches for a user (called after new events)."""
    keys = [
        _user_summary_key(user_id),
        _user_heatmap_key(user_id),
    ]
    # Timeline keys for common day ranges
    for days in [7, 14, 30, 90]:
        keys.append(_user_timeline_key(user_id, days))
    cache.delete_many(keys)

def get_user_activity_summary(user_id: UUID | int) -> dict[str, Any]:
    """
    High-level activity overview for a user:

    - Total events, events today, events this week
    - Breakdown by category (auth, game, achievement, …)
    - Most recent event timestamp
    - Most active day/hour
    """
    cache_key = _user_summary_key(user_id)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())

    base_qs = ActivityEvent.objects.filter(user_id=user_id)

    total = base_qs.count()
    today_count = base_qs.filter(created_at__gte=today_start).count()
    week_count = base_qs.filter(created_at__gte=week_start).count()

    # By category
    by_category = {}
    cat_qs = (
        base_qs.values("category")
        .annotate(count=Count("id"))
        .order_by("-count")
    )
    for row in cat_qs:
        by_category[row["category"]] = row["count"]

    # By event type (top 10)
    top_event_types = list(
        base_qs.values("event_type")
        .annotate(count=Count("id"))
        .order_by("-count")[:10]
    )

    # Most recent event
    latest = base_qs.order_by("-created_at").values("event_type", "created_at").first()

    # Most active hour (from last 90 days)
    ninety_days_ago = now - timedelta(days=90)
    hour_qs = (
        base_qs.filter(created_at__gte=ninety_days_ago)
        .annotate(hour=ExtractHour("created_at"))
        .values("hour")
        .annotate(count=Count("id"))
        .order_by("-count")
    )
    most_active_hour = hour_qs[0]["hour"] if hour_qs.exists() else None

    # Most active day of week (1=Sunday, 7=Saturday in Django)
    dow_qs = (
        base_qs.filter(created_at__gte=ninety_days_ago)
        .annotate(dow=ExtractWeekDay("created_at"))
        .values("dow")
        .annotate(count=Count("id"))
        .order_by("-count")
    )
    dow_map = {1: "Sunday", 2: "Monday", 3: "Tuesday", 4: "Wednesday",
               5: "Thursday", 6: "Friday", 7: "Saturday"}
    most_active_day = (
        dow_map.get(dow_qs[0]["dow"], "Unknown") if dow_qs.exists() else None
    )

    result = {
        "user_id": str(user_id),
        "total_events": total,
        "events_today": today_count,
        "events_this_week": week_count,
        "by_category": by_category,
        "top_event_types": [
            {"event_type": r["event_type"], "count": r["count"]}
            for r in top_event_types
        ],
        "latest_event": {
            "event_type": latest["event_type"],
            "created_at": latest["created_at"].isoformat(),
        } if latest else None,
        "most_active_hour": most_active_hour,
        "most_active_day": most_active_day,
    }

    cache.set(cache_key, result, AGGREGATION_CACHE_TTL)
    return result

def get_activity_timeline(
    user_id: UUID | int,
    days: int = 30,
    category: Optional[str] = None,
) -> list[dict[str, Any]]:
    """
    Daily event counts for the last *days* days.

    Optionally filter by ``category``.
    Returns a list of ``{"date": "2026-02-15", "count": 5}`` dicts.
    """
    cache_key = _user_timeline_key(user_id, days)
    if not category:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

    start = timezone.now() - timedelta(days=days)
    qs = ActivityEvent.objects.filter(user_id=user_id, created_at__gte=start)
    if category:
        qs = qs.filter(category=category)

    daily = (
        qs.annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(count=Count("id"))
        .order_by("day")
    )

    result = [
        {"date": row["day"].isoformat(), "count": row["count"]}
        for row in daily
    ]

    if not category:
        cache.set(cache_key, result, AGGREGATION_CACHE_TTL)
    return result

def get_activity_heatmap(user_id: UUID | int) -> list[dict[str, Any]]:
    """
    Returns a list of ``{"day": 0..6, "hour": 0..23, "count": N}`` dicts
    for building a heatmap visualisation.

    ``day`` 0 = Monday, 6 = Sunday (ISO convention).
    Only considers the last 90 days.
    """
    cache_key = _user_heatmap_key(user_id)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    start = timezone.now() - timedelta(days=90)
    qs = (
        ActivityEvent.objects
        .filter(user_id=user_id, created_at__gte=start)
        .annotate(
            hour=ExtractHour("created_at"),
            dow=ExtractWeekDay("created_at"),  # 1=Sun..7=Sat
        )
        .values("dow", "hour")
        .annotate(count=Count("id"))
        .order_by("dow", "hour")
    )

    # Convert Django's 1-based Sunday-start to ISO 0-based Monday-start
    django_to_iso = {2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 1: 6}

    result = [
        {
            "day": django_to_iso.get(row["dow"], row["dow"]),
            "hour": row["hour"],
            "count": row["count"],
        }
        for row in qs
    ]

    cache.set(cache_key, result, AGGREGATION_CACHE_TTL)
    return result

def get_recent_activity(
    user_id: UUID | int,
    limit: int = 20,
    category: Optional[str] = None,
) -> list[dict[str, Any]]:
    """
    Return the latest activity events for a user.

    Not cached — always fresh.
    """
    qs = ActivityEvent.objects.filter(user_id=user_id)
    if category:
        qs = qs.filter(category=category)

    events = qs.order_by("-created_at")[:limit].values(
        "id", "category", "event_type", "metadata", "created_at",
    )

    return [
        {
            "id": str(e["id"]),
            "category": e["category"],
            "event_type": e["event_type"],
            "metadata": e["metadata"],
            "created_at": e["created_at"].isoformat(),
        }
        for e in events
    ]

def get_global_activity_summary() -> dict[str, Any]:
    """
    Platform-wide activity statistics.

    - Total events, unique active users (last 24h, 7d, 30d)
    - Events per category
    - Top event types
    """
    cache_key = "analytics:global_summary"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    now = timezone.now()

    total_events = ActivityEvent.objects.count()

    # Active users by timeframe
    active_24h = (
        ActivityEvent.objects
        .filter(created_at__gte=now - timedelta(hours=24))
        .values("user_id").distinct().count()
    )
    active_7d = (
        ActivityEvent.objects
        .filter(created_at__gte=now - timedelta(days=7))
        .values("user_id").distinct().count()
    )
    active_30d = (
        ActivityEvent.objects
        .filter(created_at__gte=now - timedelta(days=30))
        .values("user_id").distinct().count()
    )

    # By category
    by_category = {}
    for row in (
        ActivityEvent.objects.values("category")
        .annotate(count=Count("id"))
        .order_by("-count")
    ):
        by_category[row["category"]] = row["count"]

    # Top event types
    top_types = list(
        ActivityEvent.objects.values("event_type")
        .annotate(count=Count("id"))
        .order_by("-count")[:10]
    )

    result = {
        "total_events": total_events,
        "active_users_24h": active_24h,
        "active_users_7d": active_7d,
        "active_users_30d": active_30d,
        "by_category": by_category,
        "top_event_types": [
            {"event_type": r["event_type"], "count": r["count"]}
            for r in top_types
        ],
    }

    cache.set(cache_key, result, AGGREGATION_CACHE_TTL)
    return result
