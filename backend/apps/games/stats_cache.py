from __future__ import annotations

from typing import Optional
from uuid import UUID

from django.core.cache import cache

STATS_CACHE_TTL = 300
LEADERBOARD_CACHE_TTL = 600
LEADERBOARD_VERSION_KEY = "stats:leaderboard:version"


def user_stats_key(
    user_id: UUID | int,
    game_type: Optional[str] = None,
    mode: Optional[str] = None,
) -> str:
    gt_suffix = game_type or "all"
    mode_suffix = mode or "all"
    return f"stats:user:{user_id}:{gt_suffix}:{mode_suffix}"


def h2h_key(user_id: UUID | int, opponent_id: UUID | int) -> str:
    return f"stats:h2h:{user_id}:vs:{opponent_id}"


def leaderboard_key(
    game_type: Optional[str],
    period: str,
    limit: int,
) -> str:
    version = leaderboard_version()
    gt = game_type or "all"
    return f"stats:leaderboard:v{version}:{gt}:{period}:{limit}:wins"


def leaderboard_version() -> int:
    version = cache.get(LEADERBOARD_VERSION_KEY)
    if version is None:
        cache.add(LEADERBOARD_VERSION_KEY, 1, timeout=None)
        version = cache.get(LEADERBOARD_VERSION_KEY, 1)
    return int(version)


def bump_leaderboard_version() -> int:
    try:
        cache.add(LEADERBOARD_VERSION_KEY, 1, timeout=None)
        return int(cache.incr(LEADERBOARD_VERSION_KEY))
    except ValueError:
        cache.set(LEADERBOARD_VERSION_KEY, 2, timeout=None)
        return 2


def invalidate_user_stats(user_id: UUID | int, *, include_leaderboard: bool = True) -> None:
    keys = [
        user_stats_key(user_id, game_type, mode)
        for game_type in [None, "pong", "tictactoe"]
        for mode in [None, "pvp", "local"]
    ]
    cache.delete_many(keys)

    if include_leaderboard:
        bump_leaderboard_version()


def invalidate_head_to_head_stats(user_ids: list[UUID | int]) -> None:
    unique_ids = list(dict.fromkeys(user_ids))
    if len(unique_ids) < 2:
        return

    keys = [
        h2h_key(user_id, opponent_id)
        for user_id in unique_ids
        for opponent_id in unique_ids
        if user_id != opponent_id
    ]
    cache.delete_many(keys)


def invalidate_match_stats(user_ids: list[UUID | int]) -> None:
    unique_ids = list(dict.fromkeys(user_ids))
    for user_id in unique_ids:
        invalidate_user_stats(user_id, include_leaderboard=False)
    invalidate_head_to_head_stats(unique_ids)
    bump_leaderboard_version()
