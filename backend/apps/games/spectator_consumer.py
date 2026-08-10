from __future__ import annotations
import logging
from typing import Any

from apps.games.consumers import BaseConsumer, _channel_safe
from apps.games.session import SpectatorSlot, get_session_async

logger = logging.getLogger("games.spectator")


class SpectatorConsumer(BaseConsumer):
    """Read-only spectator WebSocket for live games."""

    require_auth = True

    async def on_connect(self) -> None:
        self._game_id: str | None = None
        self._session = None

    async def on_disconnect(self, code: int) -> None:
        await self._leave_spectating()

    async def on_message(self, content: dict[str, Any]) -> None:
        msg_type = content.get("type")

        if msg_type == "join":
            await self._handle_join(content)
        elif msg_type == "emote":
            await self._handle_emote(content)
        elif msg_type == "ping":
            await self.send_json({"type": "pong"})
        else:
            await self.send_error("unsupported", f"Unknown type: {msg_type}")

    async def _handle_join(self, content: dict[str, Any]) -> None:
        game_id = content.get("game_id", "")

        if not game_id:
            await self.send_error("no_game_id", "Missing game_id")
            return

        session = await get_session_async(game_id)
        if session is None:
            await self.send_error("not_found", "Game session not found")
            return

        self._game_id = game_id
        self._session = session

        spec = SpectatorSlot(
            user_id=str(self.user.pk),
            username=self.user.username,
            channel_name=self.channel_name,
        )
        session.spectators[self.channel_name] = spec

        await self.join_group(session.group_name)

        await self.send_json({
            "type": "joined",
            "game_id": game_id,
            "game_info": session.to_info(),
        })

        await self._broadcast_spectator_count(session)

    async def _handle_emote(self, content: dict[str, Any]) -> None:
        session = self._session
        if session is None:
            return
        emote_id = content.get("emote_id", "")
        if not emote_id:
            return
        payload = _channel_safe({
            "type": "spectator_emote",
            "emote_id": emote_id,
            "sender_username": self.user.username,
        })
        await self.channel_layer.group_send(session.group_name, payload)

    async def _leave_spectating(self) -> None:
        session = self._session
        if session is None:
            return
        session.spectators.pop(self.channel_name, None)
        if self._game_id:
            await self.leave_group(session.group_name)
        await self._broadcast_spectator_count(session)
        self._session = None
        self._game_id = None

    async def _broadcast_spectator_count(self, session) -> None:
        await self.channel_layer.group_send(
            session.group_name,
            _channel_safe({
                "type": "spectator_count",
                "total": session.spectator_count,
            }),
        )

    async def group_message(self, event: dict[str, Any]) -> None:
        """Forward game state to spectating client."""
        payload = {k: v for k, v in event.items() if k != "type"}
        await self.send_json(payload)

    async def spectator_count(self, event: dict[str, Any]) -> None:
        await self.send_json(event)

    async def spectator_emote(self, event: dict[str, Any]) -> None:
        await self.send_json(event)

    async def emote(self, event: dict[str, Any]) -> None:
        """Forward player emotes to spectators."""
        await self.send_json(event)

    async def game_state(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "game_state",
            "server_ts_ms": event.get("server_ts_ms"),
            **event.get("state", {}),
        })

    async def game_start(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "game_start",
            "game_info": event.get("game_info"),
        })

    async def game_over(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "game_over",
            "winner": event.get("winner"),
            "reason": event.get("reason"),
            "final_state": event.get("final_state"),
        })

    async def player_left(self, event: dict[str, Any]) -> None:
        await self.send_json({"type": "player_left"})

    async def player_presence(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "player_presence",
            "slot": event.get("slot"),
            "connected": event.get("connected"),
        })

    async def player_ready(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "player_ready",
            "slot": event.get("slot"),
        })

    async def both_connected(self, event: dict[str, Any]) -> None:
        pass

    async def game_paused(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "game_paused",
            "reason": event.get("reason"),
        })

    async def game_resumed(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "game_resumed",
            **event,
        })
