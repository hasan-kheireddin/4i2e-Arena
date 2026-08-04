from __future__ import annotations

import json
import logging
import os
import secrets
import time
from typing import Any, Optional

import redis.asyncio as aioredis
from apps.games.session_models import (
    FinishReason,
    GameSession,
    GameType,
    PlayerSlot,
    SessionStatus,
    SpectatorSlot,
)
from apps.games.session_snapshot import (
    deserialize_session as _deserialize_session,
    prepare_recovered_session as _prepare_recovered_session,
    serialize_session as _serialize_session,
)

__all__ = [
    "FinishReason",
    "GameSession",
    "GameType",
    "PlayerSlot",
    "SessionStatus",
    "SpectatorSlot",
    "persist_session",
    "create_session_async",
    "get_session_async",
    "remove_session_async",
    "generate_game_id",
    "create_session",
    "get_session",
    "remove_session",
    "active_sessions",
    "cleanup_stale_sessions",
]

logger = logging.getLogger("games.session")

_SESSION_KEY_PREFIX = "games:session"
_SESSION_STORE_TTL_SECONDS = int(os.environ.get("GAME_SESSION_TTL_SECONDS", "1800"))
_SESSION_STORE_ENABLED = os.environ.get("GAME_SESSION_STORE_ENABLED", "1") != "0"
_REDIS_CLIENT: aioredis.Redis | None = None

_sessions: dict[str, GameSession] = {}


def _session_key(game_id: str) -> str:
    return f"{_SESSION_KEY_PREFIX}:{game_id}"


def _get_redis_client() -> aioredis.Redis | None:
    global _REDIS_CLIENT
    if not _SESSION_STORE_ENABLED:
        return None
    if _REDIS_CLIENT is None:
        redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
        _REDIS_CLIENT = aioredis.from_url(redis_url, decode_responses=True)
    return _REDIS_CLIENT


async def persist_session(session: GameSession) -> None:
    redis_client = _get_redis_client()
    if redis_client is None:
        return

    try:
        raw = json.dumps(_serialize_session(session))
        await redis_client.set(
            _session_key(session.game_id),
            raw,
            ex=_SESSION_STORE_TTL_SECONDS,
        )
    except Exception:
        logger.exception(
            "Failed to persist session snapshot: game_id=%s",
            session.game_id,
        )


async def create_session_async(
    game_type: GameType,
    engine: Any,
    game_id: str | None = None,
    authorized_player_ids: set[str] | list[str] | tuple[str, ...] | None = None,
) -> GameSession:
    session = create_session(
        game_type=game_type,
        engine=engine,
        game_id=game_id,
        authorized_player_ids=authorized_player_ids,
    )
    await persist_session(session)
    return session


async def get_session_async(game_id: str) -> Optional[GameSession]:
    local = get_session(game_id)
    if local is not None:
        return local

    redis_client = _get_redis_client()
    if redis_client is None:
        return None

    try:
        raw = await redis_client.get(_session_key(game_id))
    except Exception:
        logger.exception("Failed to load session snapshot: game_id=%s", game_id)
        return None

    if not raw:
        return None

    try:
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("session snapshot must be a JSON object")

        recovered = _prepare_recovered_session(_deserialize_session(payload))
        _sessions[game_id] = recovered
        logger.info("Recovered session snapshot: game_id=%s", game_id)
        return recovered
    except Exception:
        logger.exception("Invalid session snapshot payload: game_id=%s", game_id)
        return None


async def remove_session_async(game_id: str) -> Optional[GameSession]:
    session = remove_session(game_id)
    redis_client = _get_redis_client()
    if redis_client is None:
        return session

    try:
        await redis_client.delete(_session_key(game_id))
    except Exception:
        logger.exception("Failed to delete session snapshot: game_id=%s", game_id)
    return session


def generate_game_id() -> str:
    """Generate a URL-safe unique game id."""

    return secrets.token_urlsafe(12)


def create_session(
    game_type: GameType,
    engine: Any,
    game_id: str | None = None,
    authorized_player_ids: set[str] | list[str] | tuple[str, ...] | None = None,
) -> GameSession:
    """Create and register a new game session."""

    gid = game_id or generate_game_id()
    if gid in _sessions:
        raise ValueError(f"Session with game_id '{gid}' already exists")

    session = GameSession(
        game_id=gid,
        game_type=game_type,
        engine=engine,
        authorized_player_ids={str(value) for value in (authorized_player_ids or ())},
    )
    _sessions[gid] = session
    logger.info("Session created: game_id=%s type=%s", gid, game_type.value)
    return session


def get_session(game_id: str) -> Optional[GameSession]:
    return _sessions.get(game_id)


def remove_session(game_id: str) -> Optional[GameSession]:
    session = _sessions.pop(game_id, None)
    if session:
        logger.info("Session removed: game_id=%s", game_id)
    return session


def active_sessions() -> dict[str, GameSession]:
    return dict(_sessions)


def _is_terminal_session(session: GameSession) -> bool:
    return session.status in (SessionStatus.FINISHED, SessionStatus.ABANDONED)


def _is_expired_terminal_session(
    session: GameSession,
    *,
    now: float,
    ttl_seconds: float,
) -> bool:
    if not _is_terminal_session(session):
        return False
    if session.finished_at is not None:
        return (now - session.finished_at) >= ttl_seconds
    return (now - session.created_at) >= ttl_seconds


def _should_abandon_empty_waiting_session(
    session: GameSession,
    *,
    now: float,
    ttl_seconds: float,
) -> bool:
    return (
        session.status == SessionStatus.WAITING
        and session.player_count == 0
        and (now - session.created_at) >= ttl_seconds
    )


def _latest_disconnect_at(session: GameSession) -> float | None:
    return max(
        (
            player.disconnected_at
            for player in session.players.values()
            if player.disconnected_at is not None
        ),
        default=None,
    )


def _should_abandon_disconnected_pvp_session(
    session: GameSession,
    *,
    now: float,
    ttl_seconds: float,
) -> bool:
    if not session.all_players_disconnected():
        return False

    latest_disconnect_at = _latest_disconnect_at(session)
    if latest_disconnect_at is None:
        return False
    return (now - latest_disconnect_at) >= ttl_seconds


def cleanup_stale_sessions(ttl_seconds: float = 300.0) -> list[str]:
    """Remove or abandon stale sessions based on terminal age and disconnect TTL."""

    now = time.time()
    to_remove: list[str] = []

    for game_id, session in list(_sessions.items()):
        if _is_expired_terminal_session(session, now=now, ttl_seconds=ttl_seconds):
            to_remove.append(game_id)
            continue

        if _should_abandon_empty_waiting_session(
            session,
            now=now,
            ttl_seconds=ttl_seconds,
        ):
            session.mark_abandoned()
            continue

        if _should_abandon_disconnected_pvp_session(
            session,
            now=now,
            ttl_seconds=ttl_seconds,
        ):
            session.mark_abandoned()

    removed: list[str] = []
    for game_id in to_remove:
        if remove_session(game_id):
            removed.append(game_id)

    if removed:
        logger.info("Cleaned up %d stale session(s): %s", len(removed), removed)
    return removed
