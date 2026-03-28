from __future__ import annotations
import logging
from typing import Any, Optional
from uuid import UUID
from asgiref.sync import sync_to_async
from django.utils import timezone
from apps.analytics.models import ActivityEvent, EventCategory

logger = logging.getLogger("analytics.tracking")


def track_event(
    *,
    user_id: UUID | int,
    category: str,
    event_type: str,
    metadata: Optional[dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    user_agent: str = "",
) -> ActivityEvent:
    """
    Create a single activity event row.

    Parameters
    ----------
    user_id : UUID | int
        Foreign key to the User model.
    category : str
        One of ``EventCategory`` choices (auth, game, achievement, …).
    event_type : str
        Fine-grained action within the category.
    metadata : dict | None
        Arbitrary JSON payload.
    ip_address : str | None
        Client IP (extracted by the caller or middleware).
    user_agent : str
        Browser UA string.

    Returns
    -------
    ActivityEvent
        The newly created row.
    """
    event = ActivityEvent.objects.create(
        user_id=user_id,
        category=category,
        event_type=event_type,
        metadata=metadata or {},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    logger.debug(
        "Tracked %s:%s for user %s",
        category, event_type, user_id,
    )
    return event


atrack_event = sync_to_async(track_event)


def get_client_ip(request) -> Optional[str]:
    """
    Extract the client's IP address from a Django/DRF request.

    Respects ``X-Forwarded-For`` (first entry) when behind a reverse proxy.
    """
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def get_user_agent(request) -> str:
    """Extract the user-agent header from a request."""
    return request.META.get("HTTP_USER_AGENT", "")[:512]


def track_login(
    user_id: UUID | int,
    *,
    ip_address: Optional[str] = None,
    user_agent: str = "",
    method: str = "password",
) -> ActivityEvent:
    """Record a successful login."""
    return track_event(
        user_id=user_id,
        category=EventCategory.AUTH,
        event_type="login",
        metadata={"method": method},
        ip_address=ip_address,
        user_agent=user_agent,
    )


def track_logout(
    user_id: UUID | int,
    *,
    ip_address: Optional[str] = None,
    user_agent: str = "",
) -> ActivityEvent:
    """Record a logout."""
    return track_event(
        user_id=user_id,
        category=EventCategory.AUTH,
        event_type="logout",
        ip_address=ip_address,
        user_agent=user_agent,
    )


def track_registration(
    user_id: UUID | int,
    *,
    ip_address: Optional[str] = None,
    user_agent: str = "",
    method: str = "email",
) -> ActivityEvent:
    """Record a new account registration."""
    return track_event(
        user_id=user_id,
        category=EventCategory.AUTH,
        event_type="registration",
        metadata={"method": method},
        ip_address=ip_address,
        user_agent=user_agent,
    )


def track_oauth_login(
    user_id: UUID | int,
    *,
    provider: str,
    ip_address: Optional[str] = None,
    user_agent: str = "",
) -> ActivityEvent:
    """Record an OAuth provider login."""
    return track_event(
        user_id=user_id,
        category=EventCategory.AUTH,
        event_type="oauth_login",
        metadata={"provider": provider},
        ip_address=ip_address,
        user_agent=user_agent,
    )


def track_2fa_verified(
    user_id: UUID | int,
    *,
    ip_address: Optional[str] = None,
    user_agent: str = "",
) -> ActivityEvent:
    """Record a successful 2FA verification."""
    return track_event(
        user_id=user_id,
        category=EventCategory.AUTH,
        event_type="2fa_verified",
        ip_address=ip_address,
        user_agent=user_agent,
    )


def track_match_completed(
    user_id: UUID | int,
    *,
    match_id: Optional[str] = None,
    game_type: str = "",
    game_mode: str = "",
    outcome: str = "",
    duration_seconds: float = 0.0,
    score: int = 0,
) -> ActivityEvent:
    """Record a completed match for one participant."""
    return track_event(
        user_id=user_id,
        category=EventCategory.GAME,
        event_type="match_completed",
        metadata={
            "match_id": match_id,
            "game_type": game_type,
            "game_mode": game_mode,
            "outcome": outcome,
            "duration_seconds": round(duration_seconds, 2),
            "score": score,
        },
    )


def track_matchmaking_joined(
    user_id: UUID | int,
    *,
    game_type: str = "",
) -> ActivityEvent:
    """Record that a user joined the matchmaking queue."""
    return track_event(
        user_id=user_id,
        category=EventCategory.GAME,
        event_type="matchmaking_joined",
        metadata={"game_type": game_type},
    )


def track_achievement_unlocked(
    user_id: UUID | int,
    *,
    achievement_key: str = "",
    achievement_name: str = "",
    xp_reward: int = 0,
) -> ActivityEvent:
    """Record an achievement unlock."""
    return track_event(
        user_id=user_id,
        category=EventCategory.ACHIEVEMENT,
        event_type="achievement_unlocked",
        metadata={
            "achievement_key": achievement_key,
            "achievement_name": achievement_name,
            "xp_reward": xp_reward,
        },
    )


def track_profile_updated(
    user_id: UUID | int,
    *,
    fields_changed: Optional[list[str]] = None,
    ip_address: Optional[str] = None,
    user_agent: str = "",
) -> ActivityEvent:
    """Record a profile update."""
    return track_event(
        user_id=user_id,
        category=EventCategory.PROFILE,
        event_type="profile_updated",
        metadata={"fields_changed": fields_changed or []},
        ip_address=ip_address,
        user_agent=user_agent,
    )


def track_page_view(
    user_id: UUID | int,
    *,
    path: str = "",
    ip_address: Optional[str] = None,
    user_agent: str = "",
) -> ActivityEvent:
    """Record a page view (sent from the frontend via API)."""
    return track_event(
        user_id=user_id,
        category=EventCategory.NAVIGATION,
        event_type="page_view",
        metadata={"path": path},
        ip_address=ip_address,
        user_agent=user_agent,
    )
