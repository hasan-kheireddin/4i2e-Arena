from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from django.core.cache import cache

logger = logging.getLogger("games.stats")

STATS_CACHE_TTL = 300
LEADERBOARD_CACHE_TTL = 600


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
    gt = game_type or "all"
    return f"stats:leaderboard:{gt}:{period}:{limit}:wins"


def invalidate_user_stats(user_id: UUID | int) -> None:
    keys = [
        user_stats_key(user_id, game_type, mode)
        for game_type in [None, "pong", "tictactoe"]
        for mode in [None, "pvp", "pva", "local"]
    ]
    cache.delete_many(keys)

    for gt in [None, "pong", "tictactoe"]:
        for period in ["all", "daily", "weekly", "monthly"]:
            for limit in range(1, 101):
                cache.delete(leaderboard_key(gt, period, limit))

    logger.debug("Invalidated stats cache for user %s", user_id)


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
    logger.debug("Invalidated H2H stats cache for users %s", unique_ids)


def invalidate_match_stats(user_ids: list[UUID | int]) -> None:
    unique_ids = list(dict.fromkeys(user_ids))
    for user_id in unique_ids:
        invalidate_user_stats(user_id)
    invalidate_head_to_head_stats(unique_ids)
