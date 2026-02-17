from __future__ import annotations
import logging
import time
from typing import Any
import redis.asyncio as aioredis
from apps.games.session import GameType, generate_game_id

logger = logging.getLogger("games.matchmaking")

_KEY_PREFIX = "matchmaking"


def _queue_key(game_type: str) -> str:
    """Redis list key for a game-type queue."""
    return f"{_KEY_PREFIX}:queue:{game_type}"


def _player_key(user_id: int) -> str:
    """Redis hash key for a queued player's metadata."""
    return f"{_KEY_PREFIX}:player:{user_id}"


def _active_key() -> str:
    """Redis set key tracking all currently queued user IDs."""
    return f"{_KEY_PREFIX}:active"


def _all_game_types() -> list[str]:
    """Return all game-type values from the enum (single source of truth)."""
    return [gt.value for gt in GameType]


class MatchmakingService:
    """Redis-backed matchmaking queue.

    One instance per consumer is fine — the class is stateless aside
    from the Redis connection.

    Parameters
    ----------
    redis : aioredis.Redis
        An async Redis client instance.
    """

    def __init__(self, redis_client: aioredis.Redis) -> None:
        self._redis = redis_client

    async def enqueue(
        self,
        user_id: int,
        username: str,
        game_type: str,
    ) -> None:
        """Add a player to the matchmaking queue.

        If the player is already queued (for any game type), they are
        removed from the old queue first.

        Player metadata is stored in a hash with a 5-minute TTL as a
        safety net — ``dequeue()`` should be called explicitly on
        disconnect.
        """
        # Remove from any previous queue first
        await self._remove_from_all_queues(user_id)

        pipe = self._redis.pipeline(transaction=True)

        # Store player metadata
        player_key = _player_key(user_id)
        pipe.hset(player_key, mapping={
            "user_id": str(user_id),
            "username": username,
            "game_type": game_type,
            "enqueued_at": str(time.time()),
        })
        pipe.expire(player_key, 300)  # 5-min TTL safety net

        # Push into the game-type queue
        queue_key = _queue_key(game_type)
        pipe.rpush(queue_key, str(user_id))

        # Track in active set
        pipe.sadd(_active_key(), str(user_id))

        await pipe.execute()
        logger.info(
            "Player enqueued: user_id=%s game_type=%s", user_id, game_type,
        )

    async def dequeue(self, user_id: int) -> bool:
        """Remove a player from their queue.

        Returns ``True`` if the player was actually removed.
        """
        removed = await self._remove_from_all_queues(user_id)
        if removed:
            logger.info("Player dequeued: user_id=%s", user_id)
        return removed

    async def try_match(self, game_type: str) -> dict[str, Any] | None:
        """Attempt to pair two players from the queue.

        Returns a match dict ``{"game_id", "player1", "player2"}`` on
        success, or ``None`` if fewer than two players are queued.

        Uses ``LPOP key 2`` (positional count, Redis ≥ 6.2) which
        atomically pops up to *count* elements in a single command —
        no other worker can interleave between the two pops.
        """
        queue_key = _queue_key(game_type)

        # Atomic pop of up to 2 players in a single Redis command.
        # Positional count for redis-py async compatibility.
        popped: list[bytes] | None = await self._redis.lpop(queue_key, 2)
        if popped is None or len(popped) < 2:
            # 0 or 1 player available — re-queue to the back (fairness).
            if popped:
                await self._redis.rpush(queue_key, popped[0])
            return None

        p1_id = int(popped[0])
        p2_id = int(popped[1])

        # Fetch metadata
        p1_meta = await self._get_player_meta(p1_id)
        p2_meta = await self._get_player_meta(p2_id)

        if p1_meta is None or p2_meta is None:
            # Stale entry — re-queue valid player to the back (fairness),
            # clean up only the one whose metadata is missing.
            if p1_meta is not None:
                await self._redis.rpush(queue_key, str(p1_id))
            else:
                await self._cleanup_player_keys(p1_id)
            if p2_meta is not None:
                await self._redis.rpush(queue_key, str(p2_id))
            else:
                await self._cleanup_player_keys(p2_id)
            return None

        game_id = generate_game_id()

        # Clean up both players' metadata + active-set in one pipeline.
        pipe = self._redis.pipeline(transaction=True)
        pipe.delete(_player_key(p1_id))
        pipe.delete(_player_key(p2_id))
        pipe.srem(_active_key(), str(p1_id), str(p2_id))
        await pipe.execute()

        match = {
            "game_id": game_id,
            "game_type": game_type,
            "player1": p1_meta,
            "player2": p2_meta,
        }
        logger.info(
            "Match found: game_id=%s p1=%s p2=%s game_type=%s",
            game_id, p1_id, p2_id, game_type,
        )
        return match

    async def get_queue_info(
        self, user_id: int, game_type: str,
    ) -> dict[str, Any]:
        """Return the player's position and estimated wait time.

        Returns
        -------
        dict with keys:
            position : int       — 1-based position (0 if not queued)
            queue_length : int   — total players in this queue
            estimated_wait : float — very rough estimate in seconds
        """
        queue_key = _queue_key(game_type)
        uid_str = str(user_id)

        # LRANGE the full queue to find position (queues are small)
        queue: list[bytes] = await self._redis.lrange(queue_key, 0, -1)
        queue_strs = [q.decode() if isinstance(q, bytes) else str(q) for q in queue]

        position = 0
        for i, uid in enumerate(queue_strs):
            if uid == uid_str:
                position = i + 1  # 1-based
                break

        queue_length = len(queue_strs)

        # Rough estimate: assume average wait ~10s per position ahead
        estimated_wait = max(0.0, (position - 1) * 10.0) if position else 0.0

        return {
            "position": position,
            "queue_length": queue_length,
            "estimated_wait": round(estimated_wait, 1),
        }

    async def cleanup_disconnected(self) -> int:
        """Remove players whose metadata has expired (TTL elapsed).

        Iterates all queues and drops entries whose player hash is
        gone.  EXISTS checks are pipelined per queue to reduce
        round-trips.  Returns the count of cleaned-up entries.

        Call this periodically (e.g. every 30 s) from a background task.
        """
        cleaned = 0
        for gt in _all_game_types():
            queue_key = _queue_key(gt)
            entries: list[bytes] = await self._redis.lrange(queue_key, 0, -1)
            if not entries:
                continue

            # Pipeline all EXISTS checks in one round-trip.
            pipe = self._redis.pipeline(transaction=False)
            for raw_uid in entries:
                pipe.exists(_player_key(int(raw_uid)))
            results = await pipe.execute()

            # Collect stale entries, then pipeline all removals.
            stale = [
                raw_uid for raw_uid, exists in zip(entries, results)
                if not exists
            ]
            if stale:
                rm_pipe = self._redis.pipeline(transaction=True)
                for raw_uid in stale:
                    rm_pipe.lrem(queue_key, 1, raw_uid)
                    rm_pipe.srem(_active_key(), raw_uid)
                await rm_pipe.execute()
                cleaned += len(stale)

        if cleaned:
            logger.info("Cleaned up %d stale queue entries", cleaned)
        return cleaned

    async def is_queued(self, user_id: int) -> bool:
        """Check whether a user is currently in any queue."""
        return await self._redis.sismember(_active_key(), str(user_id))

    async def queue_length(self, game_type: str) -> int:
        """Return the number of players waiting in a queue."""
        return await self._redis.llen(_queue_key(game_type))

    async def _get_player_meta(self, user_id: int) -> dict[str, str] | None:
        """Fetch player metadata hash; returns None if expired/missing."""
        data = await self._redis.hgetall(_player_key(user_id))
        if not data:
            return None
        # Decode bytes → str
        return {
            (k.decode() if isinstance(k, bytes) else k):
            (v.decode() if isinstance(v, bytes) else v)
            for k, v in data.items()
        }

    async def _remove_from_all_queues(self, user_id: int) -> bool:
        """Remove user from every queue + metadata. Returns True if found."""
        uid_str = str(user_id)
        removed = False
        for gt in _all_game_types():
            count = await self._redis.lrem(_queue_key(gt), 0, uid_str)
            if count > 0:
                removed = True

        if removed or await self._redis.exists(_player_key(user_id)):
            await self._cleanup_player_keys(user_id)
            removed = True
        return removed

    async def _cleanup_player_keys(self, user_id: int) -> None:
        """Delete the player hash and remove from the active set."""
        pipe = self._redis.pipeline(transaction=True)
        pipe.delete(_player_key(user_id))
        pipe.srem(_active_key(), str(user_id))
        await pipe.execute()

def get_redis_client() -> aioredis.Redis:
    """Create an async Redis client from the CHANNEL_LAYERS config.

    Falls back to ``redis://localhost:6379/0`` if the setting is not
    available (e.g. in tests).
    """
    import os
    url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
    return aioredis.from_url(url, decode_responses=False)
