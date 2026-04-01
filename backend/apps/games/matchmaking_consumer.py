from __future__ import annotations
import asyncio
import logging
import time
from typing import Any

from apps.games.consumers import BaseConsumer
from apps.games.matchmaking import MatchmakingService, get_redis_client
from apps.games.session import GameType

logger = logging.getLogger("gamesmatchmaking")

# How often the consumer polls for a match and sends position updates.
MATCH_POLL_INTERVAL: float = 2.0  # seconds

# How often we run the disconnected-player cleanup sweep.
CLEANUP_INTERVAL: float = 30.0  # seconds

# Redis lock for single-leader cleanup (TTL must exceed CLEANUP_INTERVAL).
CLEANUP_LOCK_KEY: str = "matchmaking:cleanup_lock"
CLEANUP_LOCK_TTL: int = 45  # seconds

# Valid game types for matchmaking.
_VALID_GAME_TYPES: frozenset[str] = frozenset(
    gt.value for gt in GameType
)

class MatchmakingConsumer(BaseConsumer):
    """WebSocket consumer for the matchmaking queue."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._redis = get_redis_client()
        self._service = MatchmakingService(self._redis)
        self._game_type: str | None = None
        self._match_task: asyncio.Task[None] | None = None
        self._cleanup_task: asyncio.Task[None] | None = None

    async def on_connect(self) -> None:
        """Start the leader-election cleanup sweep on connect."""
        self._cleanup_task = asyncio.create_task(
            self._cleanup_loop_leader(),
        )

    async def on_disconnect(self, code: int) -> None:
        """Dequeue the player and cancel background tasks."""
        # Stop the match-polling loop
        await self._cancel_match_task()

        # Stop the cleanup loop
        if self._cleanup_task is not None and not self._cleanup_task.done():
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None

        # Remove from queue
        user_id: int = self.user.pk
        was_queued = await self._service.dequeue(user_id)

        # Leave the matchmaking notification group
        await self.leave_group(self._user_group_name)

        if was_queued:
            logger.info(
                "Player dequeued on disconnect: user_id=%s", user_id,
            )

        # Close Redis connection
        await self._redis.aclose()

    async def on_message(self, content: dict[str, Any]) -> None:
        msg_type = content.get("type", "")

        if msg_type == "find_match":
            await self._handle_find_match(content)
        elif msg_type == "cancel":
            await self._handle_cancel()
        elif msg_type == "status":
            await self._handle_status()
        else:
            await self.send_error(
                "unknown_type", f"Unknown message type: {msg_type}",
            )

    async def _handle_find_match(self, content: dict[str, Any]) -> None:
        # Already in a queue?
        if self._game_type is not None:
            await self.send_error(
                "already_queued",
                "You are already in a matchmaking queue. "
                "Send 'cancel' first to leave.",
            )
            return

        game_type = content.get("game_type", "")
        if game_type not in _VALID_GAME_TYPES:
            await self.send_error(
                "invalid_game_type",
                f"game_type must be one of: {', '.join(sorted(_VALID_GAME_TYPES))}",
            )
            return

        user_id: int = self.user.pk
        username: str = getattr(self.user, "username", "anon")

        # Join a per-user channel-layer group so match_found can reach
        # us even if the pairing happens from a different consumer's
        # try_match call.
        await self.join_group(self._user_group_name)

        # Enqueue
        await self._service.enqueue(
            user_id=user_id,
            username=username,
            game_type=game_type,
        )
        self._game_type = game_type

        # Immediate match attempt — the only moment a match becomes
        # possible is when someone joins, so we try right away rather
        # than polling.
        match = await self._service.try_match(game_type)
        if match is not None:
            await self._notify_match(match)

        # Send initial queue info (may already be 0 if we just matched)
        info = await self._service.get_queue_info(user_id, game_type)
        await self.send_json({
            "type": "queue_joined",
            "game_type": game_type,
            **info,
        })

        # Start the position-update loop (no try_match inside)
        self._match_task = asyncio.create_task(
            self._queue_update_loop(game_type),
        )

    async def _handle_cancel(self) -> None:
        if self._game_type is None:
            await self.send_error("not_queued", "You are not in a queue")
            return

        await self._cancel_match_task()
        await self._service.dequeue(self.user.pk)
        self._game_type = None

        await self.send_json({
            "type": "queue_left",
            "reason": "canceled",
        })

        await self.leave_group(self._user_group_name)


    async def _handle_status(self) -> None:
        if self._game_type is None:
            await self.send_json({
                "type": "queue_update",
                "position": 0,
                "queue_length": 0,
                "estimated_wait": 0,
            })
            return

        info = await self._service.get_queue_info(
            self.user.pk, self._game_type,
        )
        await self.send_json({
            "type": "queue_update",
            **info,
        })

    async def _queue_update_loop(self, game_type: str) -> None:
        """Send periodic position updates while the player is queued."""
        try:
            while True:
                still_queued = await self._service.is_queued(self.user.pk)
                if not still_queued:
                    break  # matched or dequeued

                info = await self._service.get_queue_info(
                    self.user.pk, game_type,
                )
                await self.send_json({
                    "type": "queue_update",
                    **info,
                })

                await asyncio.sleep(MATCH_POLL_INTERVAL)

        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Queue update loop crashed for user=%s", self.user.pk)

    async def _notify_match(self, match: dict[str, Any]) -> None:
        """Send ``match_found`` to both matched players via channel layer."""
        p1 = match["player1"]
        p2 = match["player2"]
        game_id = match["game_id"]
        game_type = match["game_type"]

        # Notify player 1
        p1_group = f"matchmaking_user_{p1['user_id']}"
        await self.channel_layer.group_send(p1_group, {
            "type": "match.found",
            "game_id": game_id,
            "game_type": game_type,
            "opponent": {
                "user_id": p2["user_id"],
                "username": p2["username"],
            },
        })

        # Notify player 2
        p2_group = f"matchmaking_user_{p2['user_id']}"
        await self.channel_layer.group_send(p2_group, {
            "type": "match.found",
            "game_id": game_id,
            "game_type": game_type,
            "opponent": {
                "user_id": p1["user_id"],
                "username": p1["username"],
            },
        })


    async def _cleanup_loop_leader(self) -> None:
        """Run cleanup only if we hold the Redis leader lock.

        Uses ``SET key NX EX`` so that across all workers / connections
        only **one** consumer runs ``cleanup_disconnected()`` per
        interval.
        """
        try:
            while True:
                acquired = await self._redis.set(
                    CLEANUP_LOCK_KEY,
                    f"{self.channel_name}:{time.time():.0f}",
                    nx=True,
                    ex=CLEANUP_LOCK_TTL,
                )
                if acquired:
                    await self._service.cleanup_disconnected()

                await asyncio.sleep(CLEANUP_INTERVAL)
        except asyncio.CancelledError:
            pass

    async def match_found(self, event: dict[str, Any]) -> None:
        """Receive match notification from the channel layer."""
        # Clean up local state — we've been matched.
        await self._cancel_match_task()
        self._game_type = None

        await self.send_json({
            "type": "match_found",
            "game_id": event.get("game_id"),
            "game_type": event.get("game_type"),
            "opponent": event.get("opponent"),
        })

        await self.leave_group(self._user_group_name)

    @property
    def _user_group_name(self) -> str:
        """Channel-layer group name unique to this user."""
        return f"matchmaking_user_{self.user.pk}"

    async def _cancel_match_task(self) -> None:
        """Cancel the match-polling task if running."""
        if self._match_task is not None and not self._match_task.done():
            self._match_task.cancel()
            try:
                await self._match_task
            except asyncio.CancelledError:
                pass
        self._match_task = None
