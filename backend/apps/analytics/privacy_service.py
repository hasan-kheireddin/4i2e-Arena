from __future__ import annotations
import logging
from typing import Any
from uuid import UUID
from django.utils import timezone
from apps.analytics.models import ActivityEvent

logger = logging.getLogger("analytics.privacy")


def anonymise_user_events(user_id: UUID | int) -> int:
    """
    Anonymise all activity events for a user.

    Scrubs ``metadata``, ``ip_address``, and ``user_agent`` fields while
    preserving the aggregate row (category, event_type, created_at) for
    platform-wide analytics.

    Returns the number of events anonymised.
    """
    count = ActivityEvent.objects.filter(
        user_id=user_id,
        is_anonymised=False,
    ).update(
        metadata={},
        ip_address=None,
        user_agent="",
        is_anonymised=True,
    )

    logger.info(
        "Anonymised %d activity events for user %s",
        count, user_id,
    )
    return count


def delete_user_events(user_id: UUID | int) -> int:
    """
    Hard-delete all activity events for a user.

    Use when the user requests complete data erasure ("right to be
    forgotten").

    Returns the number of events deleted.
    """
    count, _ = ActivityEvent.objects.filter(user_id=user_id).delete()

    logger.info(
        "Deleted %d activity events for user %s",
        count, user_id,
    )
    return count


def export_user_events(user_id: UUID | int) -> list[dict[str, Any]]:
    """
    Export all activity events for a user in a portable format.

    Data portability — returns a list of dicts ready for JSON
    serialisation.
    """
    events = (
        ActivityEvent.objects
        .filter(user_id=user_id)
        .order_by("created_at")
        .values(
            "id",
            "category",
            "event_type",
            "metadata",
            "ip_address",
            "user_agent",
            "is_anonymised",
            "created_at",
        )
    )

    return [
        {
            "id": str(e["id"]),
            "category": e["category"],
            "event_type": e["event_type"],
            "metadata": e["metadata"],
            "ip_address": e["ip_address"],
            "user_agent": e["user_agent"],
            "is_anonymised": e["is_anonymised"],
            "created_at": e["created_at"].isoformat(),
        }
        for e in events
    ]
