from __future__ import annotations
import logging
from typing import Any
from apps.games.consumers import BaseConsumer

logger = logging.getLogger("analytics.notifications")


class NotificationConsumer(BaseConsumer):
    """
    WebSocket consumer that delivers real-time user notifications.

    On connect the user is added to their personal notification group.
    Achievement unlock events (and future notification types) are pushed
    from the service layer via the channel layer.
    """

    require_auth = True

    async def on_connect(self) -> None:
        """Join the user's personal notification group."""
        self._notification_group = f"notifications_{self.user.pk}"
        await self.join_group(self._notification_group)
        logger.info(
            "User %s connected to notifications channel",
            self.user.username,
        )
        # Send a welcome message so the client knows the channel is live
        await self.send_json({
            "type": "connected",
            "message": "Notification channel active.",
        })

    async def on_disconnect(self, code: int) -> None:
        """Leave the notification group."""
        group = getattr(self, "_notification_group", None)
        if group:
            await self.leave_group(group)

    async def on_message(self, content: dict[str, Any]) -> None:
        """
        Currently no client→server messages are handled.
        Future: acknowledge read notifications, etc.
        """
        msg_type = content.get("type")
        if msg_type == "ping":
            await self.send_json({"type": "pong"})
        else:
            await self.send_error(
                "unsupported",
                "Notification channel is receive-only",
            )

    async def achievement_unlocked(self, event: dict[str, Any]) -> None:
        """
        Forward achievement unlock events to the connected client.

        Payload structure:
        {
            "type": "achievement_unlocked",
            "achievement": {
                "achievement_id": "…",
                "key": "first_win",
                "name": "First Blood",
                "description": "Win your first game.",
                "tier": "bronze",
                "icon": "sword",
                "xp_reward": 50,
                "unlocked_at": "2026-03-03T12:00:00Z"
            }
        }
        """
        await self.send_json({
            "type": "achievement_unlocked",
            "achievement": event.get("achievement", {}),
        })
