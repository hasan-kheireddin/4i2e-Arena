from __future__ import annotations
import logging
import time
from typing import Any
import redis.asyncio as aioredis
from apps.games.session import GameType, generate_game_id

logger = logging.getLogger("games.matchmaking")

_KEY_PREFIX = "matchmaking"
QUEUE_METADATA_TTL_SECONDS: int = 300


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
    ) -> dict[str, bool]:
        """Add a player to the matchmaking queue.

        If the player is already queued for the same game, their slot is
        reused so reconnects keep queue position. If queued elsewhere, the
        old queue entry is removed first.

        Player metadata is stored in a hash with a 5-minute TTL as a
        safety net.

        Returns
        -------
        dict
            ``{"resumed": bool}`` where:
            - ``resumed=True`` means the user reclaimed an existing queue
              slot after a temporary disconnect.
            - ``resumed=False`` means a fresh queue entry was created.
        """
        uid_str = str(user_id)
        player_key = _player_key(user_id)

        existing_meta = await self._get_player_meta(user_id)
        if existing_meta is not None and existing_meta.get("game_type") == game_type:
            queue = await self._redis.lrange(_queue_key(game_type), 0, -1)
            in_queue = any(
                (q.decode() if isinstance(q, bytes) else str(q)) == uid_str
                for q in queue
            )
            if in_queue:
                was_connected = existing_meta.get("connected", "1") == "1"
                now = time.time()
                pipe = self._redis.pipeline(transaction=True)
                pipe.hset(player_key, mapping={
                    "user_id": uid_str,
                    "username": username,
                    "game_type": game_type,
                    "connected": "1",
                    "disconnected_at": "0",
                    "disconnect_deadline": "0",
                    "last_seen_at": str(now),
                })
                pipe.expire(player_key, QUEUE_METADATA_TTL_SECONDS)
                pipe.sadd(_active_key(), uid_str)
                await pipe.execute()
                return {"resumed": not was_connected}

        # Remove from any previous queue first
        await self._remove_from_all_queues(user_id)

        pipe = self._redis.pipeline(transaction=True)

        # Store player metadata
        now = time.time()
        pipe.hset(player_key, mapping={
            "user_id": uid_str,
            "username": username,
            "game_type": game_type,
            "enqueued_at": str(now),
            "connected": "1",
            "disconnected_at": "0",
            "disconnect_deadline": "0",
            "last_seen_at": str(now),
        })
        pipe.expire(player_key, QUEUE_METADATA_TTL_SECONDS)

        # Push into the game-type queue
        queue_key = _queue_key(game_type)
        pipe.rpush(queue_key, uid_str)

        # Track in active set
        pipe.sadd(_active_key(), uid_str)

        await pipe.execute()
        logger.info(
            "Player enqueued: user_id=%s game_type=%s", user_id, game_type,
        )
        return {"resumed": False}

    async def mark_disconnected(self, user_id: int, grace_seconds: float) -> bool:
        """Keep a queued player in-place briefly so they can resume."""
        meta = await self._get_player_meta(user_id)
        if meta is None:
            return False

        game_type = meta.get("game_type")
        if not game_type:
            await self._cleanup_player_keys(user_id)
            return False

        uid_str = str(user_id)
        queue = await self._redis.lrange(_queue_key(game_type), 0, -1)
        in_queue = any(
            (q.decode() if isinstance(q, bytes) else str(q)) == uid_str
            for q in queue
        )
        if not in_queue:
            return False

        now = time.time()
        deadline = now + max(1.0, float(grace_seconds))
        pipe = self._redis.pipeline(transaction=True)
        pipe.hset(_player_key(user_id), mapping={
            "connected": "0",
            "disconnected_at": str(now),
            "disconnect_deadline": str(deadline),
            "last_seen_at": str(now),
        })
        pipe.expire(_player_key(user_id), QUEUE_METADATA_TTL_SECONDS)
        pipe.sadd(_active_key(), uid_str)
        await pipe.execute()
        return True

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

        p1_id = popped[0].decode() if isinstance(popped[0], bytes) else str(popped[0])
        p2_id = popped[1].decode() if isinstance(popped[1], bytes) else str(popped[1])

        # Fetch metadata
        p1_meta = await self._get_player_meta(p1_id)
        p2_meta = await self._get_player_meta(p2_id)

        now = time.time()
        p1_status = self._candidate_status(p1_meta, now)
        p2_status = self._candidate_status(p2_meta, now)

        if p1_status != "ready" or p2_status != "ready":
            # Ready players are restored to the front; disconnected-but-valid
            # players are moved to the back so they don't block the queue head.
            restore_front_ids: list[str] = []
            restore_back_ids: list[str] = []

            if p1_status == "ready":
                restore_front_ids.append(str(p1_id))
            elif p1_status == "waiting":
                restore_back_ids.append(str(p1_id))
            else:
                await self._cleanup_player_keys(p1_id)

            if p2_status == "ready":
                restore_front_ids.append(str(p2_id))
            elif p2_status == "waiting":
                restore_back_ids.append(str(p2_id))
            else:
                await self._cleanup_player_keys(p2_id)

            if restore_front_ids:
                await self._redis.lpush(queue_key, *reversed(restore_front_ids))
            if restore_back_ids:
                await self._redis.rpush(queue_key, *restore_back_ids)
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
        """Remove queue entries that are stale or past reconnect grace.

        Iterates all queues and drops entries whose player hash is gone,
        or whose disconnect deadline has elapsed.

        Call this periodically (e.g. every 30 s) from a background task.
        """
        cleaned = 0
        now = time.time()
        for gt in _all_game_types():
            queue_key = _queue_key(gt)
            entries: list[bytes] = await self._redis.lrange(queue_key, 0, -1)
            if not entries:
                continue

            stale: list[bytes] = []
            for raw_uid in entries:
                uid_str = (
                    raw_uid.decode()
                    if isinstance(raw_uid, bytes)
                    else str(raw_uid)
                )
                meta = await self._get_player_meta(uid_str)
                status = self._candidate_status(meta, now)
                if status in ("stale", "expired"):
                    stale.append(raw_uid)

            if stale:
                rm_pipe = self._redis.pipeline(transaction=True)
                for raw_uid in stale:
                    uid_str = (
                        raw_uid.decode()
                        if isinstance(raw_uid, bytes)
                        else str(raw_uid)
                    )
                    rm_pipe.lrem(queue_key, 1, raw_uid)
                    rm_pipe.srem(_active_key(), uid_str)
                    rm_pipe.delete(_player_key(uid_str))
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

    @staticmethod
    def _candidate_status(
        meta: dict[str, str] | None,
        now: float,
    ) -> str:
        """Return candidate state used by matching/cleanup decisions."""
        if meta is None:
            return "stale"
        if meta.get("connected", "1") != "0":
            return "ready"
        deadline_raw = meta.get("disconnect_deadline")
        if deadline_raw:
            try:
                if float(deadline_raw) <= now:
                    return "expired"
            except ValueError:
                return "expired"
        return "waiting"


def get_redis_client() -> aioredis.Redis:
    """Create an async Redis client from the CHANNEL_LAYERS config.

    Falls back to ``redis://localhost:6379/0`` if the setting is not
    available (e.g. in tests).
    """
    import os
    url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
    return aioredis.from_url(url, decode_responses=False)
