from __future__ import annotations
import asyncio
import collections
import logging
import time
from typing import Any

from apps.games.consumers import BaseConsumer
from apps.games.finish_service import finalize_finished_session
from apps.games.session import (
    FinishReason,
    GameSession,
    GameType,
    PlayerSlot,
    SessionStatus,
    get_session_async,
    persist_session,
    remove_session_async,
)
from apps.games.tictactoe_engine import GameStatus as TTTStatus
from apps.games.tictactoe_engine import MoveResult

logger = logging.getLogger("games.tictactoe")

MOVE_RATE_LIMIT: int = 2
MOVE_RATE_WINDOW: float = 1.0
RECONNECT_GRACE_SECONDS: float = 12.0


class TicTacToeConsumer(BaseConsumer):
    """WebSocket consumer for turn-based Tic-Tac-Toe games (PvP only)."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._session: GameSession | None = None
        self._slot: int | None = None
        self._move_timestamps: collections.deque[float] = collections.deque()

    async def on_connect(self) -> None:
        """Connection accepted — wait for a join message."""

    async def on_disconnect(self, code: int) -> None:
        """Keep the session alive briefly so the player can reconnect."""
        session = self._session
        slot = self._slot
        if session is None or slot is None:
            return

        player = session.players.get(slot)
        if player is None or player.channel_name != self.channel_name:
            return

        if session.status in (SessionStatus.FINISHED, SessionStatus.ABANDONED):
            return

        session.mark_player_disconnected(slot)
        await self.broadcast(
            session.group_name,
            {
                "slot": slot,
                "connected": False,
                "game_info": session.to_info(),
            },
            handler="player.presence",
        )

        if session.status == SessionStatus.PLAYING:
            session.paused = True
            session.pause_reason = "player_disconnected"
            await self.broadcast(
                session.group_name,
                {
                    "slot": slot,
                    "reason": "player_disconnected",
                    "resume_deadline_seconds": RECONNECT_GRACE_SECONDS,
                },
                handler="game.paused",
            )

        await self._schedule_disconnect_resolution(session, slot)
        await persist_session(session)

    async def on_message(self, content: dict[str, Any]) -> None:
        msg_type = content.get("type", "")

        if msg_type == "join":
            await self._handle_join(content)
        elif msg_type == "ready":
            await self._handle_ready()
        elif msg_type == "move":
            await self._handle_move(content)
        elif msg_type == "forfeit":
            await self._handle_forfeit()
        elif msg_type == "ping":
            await self._handle_ping(content)
        else:
            await self.send_error("unknown_type", f"Unknown message type: {msg_type}")

    async def _handle_join(self, content: dict[str, Any]) -> None:
        if self._session is not None:
            await self.send_error("already_joined", "Already in a game session")
            return

        game_id = content.get("game_id")
        if not game_id or not isinstance(game_id, str):
            await self.send_error("invalid_game_id", "Missing or invalid game_id")
            return

        session = await get_session_async(game_id)
        if session is None:
            await self.send_error(
                "session_not_found",
                "Game session was not created by matchmaking or an invitation.",
            )
            return

        if session.game_type != GameType.TICTACTOE:
            await self.send_error(
                "invalid_game_type",
                "This game session does not belong to Tic-Tac-Toe.",
            )
            return

        if session.status in (SessionStatus.FINISHED, SessionStatus.ABANDONED):
            await self.send_error("game_over", "This game has already ended")
            return

        user_id: int = self.user.pk
        if not session.is_player_authorized(user_id):
            await self.send_error("forbidden", "You are not a player in this match")
            return
        existing_slot = session.get_player_slot(user_id)
        reconnected = False

        if existing_slot is not None:
            player = session.players.get(existing_slot)
            if player is None:
                await self.send_error("invalid_session", "Player slot is missing")
                return
            if player.connected:
                old_channel = player.channel_name
                if old_channel and old_channel != self.channel_name:
                    await self.channel_layer.send(old_channel, {"type": "force.disconnect"})
            slot = existing_slot
            reconnected = True
            await self._cancel_disconnect_task(session, slot)
            session.mark_player_connected(slot, channel_name=self.channel_name)
        elif session.is_full:
            await self.send_error("game_full", "Game is already full")
            return
        else:
            slot = 1 if 1 not in session.players else 2
            session.engine.set_player(str(user_id), slot)
            session.players[slot] = PlayerSlot(
                user_id=user_id,
                username=getattr(self.user, "username", "anon"),
                channel_name=self.channel_name,
                slot=slot,
            )

        self._session = session
        self._slot = slot

        await self.join_group(session.group_name)
        await self.send_json({
            "type": "game_joined",
            "slot": slot,
            "reconnected": reconnected,
            "game_info": session.to_info(),
        })
        await self.broadcast(
            session.group_name,
            {
                "slot": slot,
                "connected": True,
                "game_info": session.to_info(),
            },
            handler="player.presence",
        )
        await persist_session(session)

        if (
            session.is_full
            and session.status == SessionStatus.WAITING
            and not session.both_connected_sent
        ):
            session.both_connected_sent = True
            await persist_session(session)
            await self.broadcast(
                session.group_name,
                {"game_info": session.to_info()},
                handler="both.connected",
            )
        elif reconnected and session.status == SessionStatus.PLAYING:
            await self.send_json({
                "type": "game_state",
                "server_ts_ms": int(time.time() * 1000),
                **session.engine.get_state(),
            })
            if session.paused and session.all_players_connected:
                await self._resume_game(session)

        await self._restore_disconnect_tasks(session)

    async def _handle_ready(self) -> None:
        session = self._session
        if session is None or self._slot is None:
            await self.send_error("not_joined", "Not in a game session")
            return
        if session.status != SessionStatus.WAITING:
            return

        session.ready_slots.add(self._slot)
        await persist_session(session)
        await self.broadcast(
            session.group_name,
            {"slot": self._slot},
            handler="player.ready",
        )

        if session.ready_slots.issuperset({1, 2}) and session.is_full:
            await self._start_game(session)

    async def _start_game(self, session: GameSession) -> None:
        if session.status != SessionStatus.WAITING:
            return

        session.engine.start()
        session.status = SessionStatus.PLAYING
        session.paused = False
        session.pause_reason = None
        await persist_session(session)

        await self.broadcast(
            session.group_name,
            {"game_info": session.to_info()},
            handler="game.start",
        )
        await self._broadcast_state(session)

    async def _handle_move(self, content: dict[str, Any]) -> None:
        session = self._session
        if session is None or session.status != SessionStatus.PLAYING:
            await self.send_error("not_playing", "Game is not in progress")
            return
        if self._slot is None:
            return
        if session.paused:
            await self.send_error(
                "game_paused",
                "Game is paused while a player reconnects",
            )
            return
        if self._is_rate_limited():
            await self.send_error("rate_limited", "Too many moves — slow down")
            return

        cell = content.get("cell")
        if not isinstance(cell, int) or not (0 <= cell < 9):
            await self.send_error("invalid_cell", "Cell must be an integer 0–8")
            return

        result = session.engine.make_move(self._slot, cell)
        if result != MoveResult.OK:
            await self.send_json({
                "type": "move_error",
                "result": result.value,
            })
            return

        await persist_session(session)
        await self._broadcast_state(session)

        if session.engine.status == TTTStatus.FINISHED:
            reason = FinishReason.DRAW if session.engine.is_draw else FinishReason.SCORE
            winner_id = self._resolve_winner_id(session)
            session.mark_finished(reason=reason, winner_id=winner_id)
            await persist_session(session)
            await self._cancel_disconnect_tasks(session)
            await self._broadcast_game_over(
                session,
                reason="draw" if session.engine.is_draw else "win",
            )
            await finalize_finished_session(session)

    async def _handle_forfeit(self) -> None:
        session = self._session
        if session is None or self._slot is None:
            return
        if session.status != SessionStatus.PLAYING:
            await self.send_error("not_playing", "Game is not in progress")
            return

        session.engine.forfeit(self._slot)
        opp_slot = session.get_opponent_slot(self._slot)
        opp = session.players.get(opp_slot)
        winner_id = opp.user_id if opp else None
        session.mark_finished(
            reason=FinishReason.FORFEIT,
            winner_id=winner_id,
        )
        await persist_session(session)
        await self._cancel_disconnect_tasks(session)
        await self._broadcast_game_over(session, reason="forfeit")
        await finalize_finished_session(session)

    async def _handle_ping(self, content: dict[str, Any]) -> None:
        client_ts_ms = content.get("client_ts_ms")
        await self.send_json({
            "type": "pong",
            "client_ts_ms": (
                client_ts_ms
                if isinstance(client_ts_ms, (int, float))
                else None
            ),
            "server_ts_ms": int(time.time() * 1000),
        })

    def _resolve_winner_id(self, session: GameSession) -> int | None:
        if session.engine.is_draw or session.engine.winner is None:
            return None
        winner_slot = 1 if session.engine.winner.value == "X" else 2
        ps = session.players.get(winner_slot)
        return ps.user_id if ps is not None else None

    def _is_rate_limited(self) -> bool:
        now = time.monotonic()
        cutoff = now - MOVE_RATE_WINDOW
        while self._move_timestamps and self._move_timestamps[0] <= cutoff:
            self._move_timestamps.popleft()
        if len(self._move_timestamps) >= MOVE_RATE_LIMIT:
            return True
        self._move_timestamps.append(now)
        return False

    async def _broadcast_state(self, session: GameSession) -> None:
        await self.broadcast(
            session.group_name,
            {
                "state": session.engine.get_state(),
                "server_ts_ms": int(time.time() * 1000),
            },
            handler="game.state",
        )

    async def _broadcast_game_over(self, session: GameSession, reason: str) -> None:
        winner = session.engine.winner
        winner_val = winner.value if winner else None
        await self.broadcast(
            session.group_name,
            {
                "winner": winner_val,
                "is_draw": session.engine.is_draw,
                "reason": reason,
                "final_state": session.engine.get_state(),
            },
            handler="game.over",
        )

    async def _schedule_disconnect_resolution(
        self,
        session: GameSession,
        slot: int,
    ) -> None:
        await self._cancel_disconnect_task(session, slot)
        session.disconnect_tasks[slot] = asyncio.create_task(
            self._resolve_disconnect_after_grace(session.game_id, slot),
        )

    async def _restore_disconnect_tasks(self, session: GameSession) -> None:
        """Re-arm grace timers lost during process/session snapshot recovery."""
        now = time.time()
        for slot, player in session.players.items():
            if player.connected or slot in session.disconnect_tasks:
                continue
            elapsed = now - (player.disconnected_at or now)
            delay = max(0.0, RECONNECT_GRACE_SECONDS - elapsed)
            session.disconnect_tasks[slot] = asyncio.create_task(
                self._resolve_disconnect_after_grace(session.game_id, slot, delay)
            )

    async def _cancel_disconnect_task(
        self,
        session: GameSession,
        slot: int,
    ) -> None:
        task = session.disconnect_tasks.pop(slot, None)
        if task is None or task.done():
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    async def _cancel_disconnect_tasks(self, session: GameSession) -> None:
        for slot in list(session.disconnect_tasks):
            await self._cancel_disconnect_task(session, slot)

    async def _resolve_disconnect_after_grace(
        self, game_id: str, slot: int, delay: float = RECONNECT_GRACE_SECONDS,
    ) -> None:
        try:
            await asyncio.sleep(delay)
            session = await get_session_async(game_id)
            if session is None:
                return
            session.disconnect_tasks.pop(slot, None)

            player = session.players.get(slot)
            if player is None or player.connected:
                return

            if session.status == SessionStatus.PLAYING:
                session.engine.forfeit(slot)
                opp_slot = session.get_opponent_slot(slot)
                opp = session.players.get(opp_slot)
                winner_id = opp.user_id if opp else None
                session.mark_finished(
                    reason=FinishReason.DISCONNECT_FORFEIT,
                    winner_id=winner_id,
                )
                await persist_session(session)
                await self.broadcast(
                    session.group_name,
                    {"slot": slot},
                    handler="player.left",
                )
                await self._broadcast_game_over(session, reason="disconnect_forfeit")
                await self._cancel_disconnect_tasks(session)
                await finalize_finished_session(session)
            elif session.status == SessionStatus.WAITING:
                left_username = player.username
                session.mark_abandoned(reason=FinishReason.CANCELED)
                await persist_session(session)
                await self.broadcast(
                    session.group_name,
                    {"username": left_username},
                    handler="opponent.left.lobby",
                )
                await self._cancel_disconnect_tasks(session)
                await remove_session_async(session.game_id)
        except asyncio.CancelledError:
            return

    async def _resume_game(self, session: GameSession) -> None:
        session.paused = False
        session.pause_reason = None
        await persist_session(session)
        await self.broadcast(
            session.group_name,
            {
                "game_info": session.to_info(),
                "state": session.engine.get_state(),
                "server_ts_ms": int(time.time() * 1000),
            },
            handler="game.resumed",
        )

    async def game_state(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "game_state",
            "server_ts_ms": event.get("server_ts_ms"),
            **event.get("state", {}),
        })

    async def force_disconnect(self, event: dict[str, Any]) -> None:
        await self.close(code=4001)

    async def game_start(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "game_start",
            "game_info": event.get("game_info"),
        })

    async def game_over(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "game_over",
            "winner": event.get("winner"),
            "is_draw": event.get("is_draw"),
            "reason": event.get("reason"),
            "final_state": event.get("final_state"),
        })

    async def player_left(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "player_left",
            "slot": event.get("slot"),
        })

    async def player_presence(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "player_presence",
            "slot": event.get("slot"),
            "connected": event.get("connected", False),
            "game_info": event.get("game_info"),
        })

    async def both_connected(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "both_connected",
            "game_info": event.get("game_info"),
        })

    async def player_ready(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "player_ready",
            "slot": event.get("slot"),
        })

    async def opponent_left_lobby(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "opponent_left_lobby",
            "username": event.get("username", "Opponent"),
        })

    async def game_paused(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "game_paused",
            "slot": event.get("slot"),
            "reason": event.get("reason"),
            "resume_deadline_seconds": event.get("resume_deadline_seconds"),
        })

    async def game_resumed(self, event: dict[str, Any]) -> None:
        payload: dict[str, Any] = {
            "type": "game_resumed",
            "game_info": event.get("game_info"),
            "server_ts_ms": event.get("server_ts_ms"),
        }
        state = event.get("state")
        if isinstance(state, dict):
            payload.update(state)
        await self.send_json(payload)
