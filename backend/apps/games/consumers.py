
from __future__ import annotation
import json
import logging
import time
from typing import Any

from channels.generic.websocket import AsyncWebSocketConsumer

logger = logging.getLogger("channels.consumer")

MAX_MESSAGE_SIZE: int = 65_536


class BaseConsumer(AsyncWebSocketConsumer):
    """
    Abstract base consumer with lifecycle hooks, auth gating, group
    management, and structured JSON messaging.

    Subclasses override *only* the ``on_*`` hooks they need:

    - ``on_connect()``    — called after the connection is accepted.
    - ``on_disconnect(code)`` — called when the client disconnects.
    - ``on_message(content)`` — called for every inbound JSON message.
    - ``on_error(exc, context)`` — called when an unhandled exception
      occurs during message processing.

    Set ``require_auth = False`` on a subclass to allow anonymous
    connections (e.g. a public spectator feed).
    """

    # Subclasses may override
    require_auth: bool = True

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._groups: set[str] = set()
        self._connected_at: float | None = None
        self._accepted: bool = False

    async def connect(self) -> None:
        """
        Handle initial WebSocket handshake.

        Rejects the connection if authentication is required but the
        scope user is anonymous.
        """
        self.user = self.scope.get("user")

        if self.require_auth and (
            self.user is None or not getattr(self.user, "is_authenticated", False)
        ):
            logger.info(
                "Rejected unauthenticated WebSocket from %s",
                self.scope.get("client", ("?", 0))[0],
            )
            await self.close(code=4401)
            return

        await self.accept()
        self._accepted = True
        self._connected_at = time.monotonic()
        logger.info(
            "WebSocket connected: user=%s channel=%s",
            getattr(self.user, "username", "anon"),
            self.channel_name,
        )
        await self.on_connect()

    async def disconnect(self, code: int) -> None:
        """Leave all groups and invoke the subclass hook."""
        duration = (
            round(time.monotonic() - self._connected_at, 1)
            if self._connected_at is not None
            else 0
        )
        logger.info(
            "WebSocket disconnected: user=%s code=%s duration=%.1fs",
            getattr(self.user, "username", "anon"),
            code,
            duration,
        )
        # Clean up all groups — tolerate individual failures so that
        # on_disconnect is always reached.
        for group in list(self._groups):
            try:
                await self.leave_group(group)
            except Exception:  # noqa: BLE001
                logger.warning(
                    "Failed to leave group %s during disconnect", group,
                    exc_info=True,
                )
                self._groups.discard(group)

        await self.on_disconnect(code)

    async def receive(self, text_data: str | None = None, **kwargs: Any) -> None:
        """
        Decode the incoming JSON message and delegate to ``on_message``.

        Malformed JSON or exceptions during handling are routed to
        ``on_error`` and a structured error is sent back to the client.
        """
        if text_data is None:
            return

        # Guard against oversized messages before parsing.
        # Check byte length, not character count — a single Unicode
        # character can be multiple bytes in UTF-8.
        if len(text_data.encode("utf-8")) > MAX_MESSAGE_SIZE:
            await self.send_error(
                "message_too_large",
                f"Message exceeds {MAX_MESSAGE_SIZE} byte limit",
            )
            return

        try:
            content = json.loads(text_data)
        except json.JSONDecodeError as exc:
            await self.on_error(exc, "invalid_json")
            await self.send_error("invalid_json", "Malformed JSON payload")
            return

        if not isinstance(content, dict):
            await self.send_error(
                "invalid_message",
                "Message must be a JSON object",
            )
            return

        msg_type = content.get("type", "<unknown>")

        try:
            await self.on_message(content)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "Error processing message type=%s: %s", msg_type, exc,
            )
            await self.on_error(exc, msg_type)
            await self.send_error(
                "internal_error",
                "An error occurred while processing your message",
            )

    async def on_connect(self) -> None:
        """Called after the connection has been accepted."""

    async def on_disconnect(self, code: int) -> None:
        """Called after the client disconnects."""

    async def on_message(self, content: dict[str, Any]) -> None:
        """
        Called for every inbound message.

        ``content`` is the parsed JSON dict.  Subclasses should dispatch
        on ``content["type"]`` (or whatever key convention they choose).
        """

    async def on_error(self, exc: Exception, context: str) -> None:
        """
        Called when an unhandled exception occurs during message
        processing, or when a malformed message is received.

        Override to add custom error tracking / metrics.
        """

    async def send_json(self, data: dict[str, Any]) -> None:
        """Send a JSON-serialisable dict to the client."""
        await self.send(text_data=json.dumps(data))

    async def send_error(
        self,
        error_code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        """Send a structured error message."""
        payload: dict[str, Any] = {
            "type": "error",
            "error": error_code,
            "message": message,
        }
        if details is not None:
            payload["details"] = details
        await self.send_json(payload)

    async def broadcast(
        self,
        group: str,
        data: dict[str, Any],
        handler: str = "group.message",
    ) -> None:
        """
        Send *data* to every member of *group* via the channel layer.

        The receiving consumers need a method matching *handler* (dots
        replaced with underscores by Channels).

        A ``type`` key in *data* is stripped to prevent it from
        overwriting the internal handler routing key.
        """
        self._require_channel_layer()
        payload = {k: v for k, v in data.items() if k != "type"}
        payload["type"] = handler
        await self.channel_layer.group_send(group, payload)

    async def group_message(self, event: dict[str, Any]) -> None:
        """
        Default handler for messages arriving through ``broadcast()``.

        Strips the internal ``type`` key and forwards the rest to the
        client as JSON.
        """
        payload = {k: v for k, v in event.items() if k != "type"}
        await self.send_json(payload)

    async def join_group(self, group: str) -> None:
        """Join a channel-layer group and track it for cleanup."""
        if not self._accepted:
            raise RuntimeError(
                "Cannot join a group before the connection is accepted"
            )
        self._require_channel_layer()
        await self.channel_layer.group_add(group, self.channel_name)
        self._groups.add(group)
        logger.debug(
            "Channel %s joined group %s", self.channel_name, group,
        )

    async def leave_group(self, group: str) -> None:
        """Leave a channel-layer group and stop tracking it."""
        self._require_channel_layer()
        await self.channel_layer.group_discard(group, self.channel_name)
        self._groups.discard(group)
        logger.debug(
            "Channel %s left group %s", self.channel_name, group,
        )

    @property
    def groups_joined(self) -> frozenset[str]:
        """Read-only snapshot of group memberships."""
        return frozenset(self._groups)

    @property
    def connection_duration(self) -> float:
        """Seconds since the connection was accepted (0 if not yet)."""
        if self._connected_at is None:
            return 0.0
        return time.monotonic() - self._connected_at

    def _require_channel_layer(self) -> None:
        """Raise a clear error if no channel layer is configured."""
        if self.channel_layer is None:
            raise RuntimeError(
                "No channel layer configured. Set CHANNEL_LAYERS in "
                "settings or use the InMemoryChannelLayer for testing."
            )
