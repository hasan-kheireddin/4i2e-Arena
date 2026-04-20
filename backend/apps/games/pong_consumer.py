from __future__ import annotations
import asyncio
import collections
import logging
import time
from typing import Any

from apps.analytics.achievement_service import check_achievements_after_game
from apps.analytics.xp_service import award_xp_after_game
from apps.games.consumers import BaseConsumer
from apps.games.match_recording_service import record_match
from apps.games.pong_engine import GameStatus as PongStatus
from apps.games.pong_engine import PongEngine
from apps.games.session import (
    FinishReason,
    GameSession,
    GameType,
    PlayerSlot,
    SessionStatus,
    create_session_async,
    get_session_async,
    persist_session,
    remove_session_async,
)

logger = logging.getLogger("games.pong")

TICK_RATE: int = 60
TICK_INTERVAL: float = 1.0 / TICK_RATE
RECONNECT_GRACE_SECONDS: float = 12.0
SESSION_SNAPSHOT_INTERVAL_TICKS: int = 15

INPUT_RATE_LIMIT: int = 120
INPUT_RATE_WINDOW: float = 1.0

_VALID_DIRECTIONS: frozenset[str] = frozenset({"up", "down", "stop"})


class PongConsumer(BaseConsumer):
    """WebSocket consumer for real-time Pong games."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._session: GameSession | None = None
        self._slot: int | None = None
        self._input_timestamps: collections.deque[float] = collections.deque()

    async def on_connect(self) -> None:
        """Connection accepted — wait for a join message."""

    async def on_disconnect(self, code: int) -> None:
        """Pause the match and allow a short reconnection grace period."""
        session = self._session
        slot = self._slot
        if session is None or slot is None:
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
            await self._stop_tick_loop(session, force=True)
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
        elif msg_type == "input":
            await self._handle_input(content)
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
            session = await create_session_async(
                game_type=GameType.PONG,
                engine=PongEngine(),
                game_id=game_id,
            )

        if session.status in (SessionStatus.FINISHED, SessionStatus.ABANDONED):
            await self.send_error("game_over", "This game has already ended")
            return

        user_id: int = self.user.pk
        existing_slot = session.get_player_slot(user_id)
        reconnected = False

        if existing_slot is not None:
            player = session.players.get(existing_slot)
            if player is None:
                await self.send_error("invalid_session", "Player slot is missing")
                return
            if player.connected:
                await self.send_error(
                    "already_joined",
                    "This player is already connected to the session",
                )
                return
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
        if session.tick_task is not None:
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

        session.tick_task = asyncio.create_task(self._tick_loop(session))
        session.tick_owner = self.user.pk

    async def _handle_input(self, content: dict[str, Any]) -> None:
        session = self._session
        if session is None or session.status != SessionStatus.PLAYING:
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
            await self.send_error(
                "rate_limited",
                "Too many input messages — slow down",
            )
            return

        direction = content.get("direction")
        if direction not in _VALID_DIRECTIONS:
            await self.send_error(
                "invalid_direction",
                f"Direction must be one of: {', '.join(sorted(_VALID_DIRECTIONS))}",
            )
            return

        session.engine.handle_input(self._slot, direction)

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

    def _is_rate_limited(self) -> bool:
        now = time.monotonic()
        cutoff = now - INPUT_RATE_WINDOW
        while self._input_timestamps and self._input_timestamps[0] <= cutoff:
            self._input_timestamps.popleft()

        if len(self._input_timestamps) >= INPUT_RATE_LIMIT:
            return True

        self._input_timestamps.append(now)
        return False

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

        await self._stop_tick_loop(session)
        await self._cancel_disconnect_tasks(session)
        await self._broadcast_game_over(session, reason="forfeit")
        xp_awards = await award_xp_after_game(session)
        await record_match(session, xp_awards=xp_awards)
        await check_achievements_after_game(session)

    async def _tick_loop(self, session: GameSession) -> None:
        """Run the game engine at TICK_RATE Hz and broadcast snapshots."""
        try:
            while session.status == SessionStatus.PLAYING:
                if session.paused:
                    await asyncio.sleep(0.1)
                    continue

                tick_start = time.monotonic()
                state = session.engine.tick()

                await self.broadcast(
                    session.group_name,
                    {
                        "state": state,
                        "server_ts_ms": int(time.time() * 1000),
                    },
                    handler="game.state",
                )
                if session.engine.tick_count % SESSION_SNAPSHOT_INTERVAL_TICKS == 0:
                    await persist_session(session)

                if state.get("status") == PongStatus.FINISHED.value:
                    winner_id = self._resolve_winner_id(session)
                    session.mark_finished(
                        reason=FinishReason.SCORE,
                        winner_id=winner_id,
                    )
                    await persist_session(session)
                    await self._cancel_disconnect_tasks(session)
                    await self._broadcast_game_over(session, reason="score")
                    xp_awards = await award_xp_after_game(session)
                    await record_match(session, xp_awards=xp_awards)
                    await check_achievements_after_game(session)
                    break

                elapsed = time.monotonic() - tick_start
                sleep_time = TICK_INTERVAL - elapsed
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)

        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Tick loop crashed for game_id=%s", session.game_id)
            session.mark_finished(reason=FinishReason.SERVER_ERROR)
            await persist_session(session)
            await self._cancel_disconnect_tasks(session)
            await self.broadcast(
                session.group_name,
                {
                    "winner": None,
                    "reason": "server_error",
                    "final_state": session.engine.get_state(),
                },
                handler="game.over",
            )
        finally:
            session.tick_task = None
            session.tick_owner = None

    def _resolve_winner_id(self, session: GameSession) -> int | None:
        winner_slot = session.engine.winner
        if winner_slot not in (1, 2):
            return None
        winner_player = session.players.get(winner_slot)
        return winner_player.user_id if winner_player is not None else None

    async def _broadcast_game_over(self, session: GameSession, reason: str) -> None:
        await self.broadcast(
            session.group_name,
            {
                "winner": session.engine.winner,
                "reason": reason,
                "final_state": session.engine.get_state(),
            },
            handler="game.over",
        )

    async def _stop_tick_loop(
        self,
        session: GameSession,
        *,
        force: bool = False,
    ) -> None:
        task: asyncio.Task[None] | None = session.tick_task
        if task is None or task.done():
            return

        if not force:
            owner_id = session.tick_owner
            is_owner = owner_id is not None and owner_id == self.user.pk
            if not is_owner:
                owner_slot = session.get_player_slot(owner_id) if owner_id else None
                owner_connected = (
                    owner_slot is not None
                    and session.players.get(owner_slot) is not None
                    and session.players[owner_slot].connected
                )
                if owner_connected:
                    return

        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    async def _schedule_disconnect_resolution(
        self,
        session: GameSession,
        slot: int,
    ) -> None:
        await self._cancel_disconnect_task(session, slot)
        session.disconnect_tasks[slot] = asyncio.create_task(
            self._resolve_disconnect_after_grace(session.game_id, slot),
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

    async def _resolve_disconnect_after_grace(self, game_id: str, slot: int) -> None:
        try:
            await asyncio.sleep(RECONNECT_GRACE_SECONDS)
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
                await self._stop_tick_loop(session, force=True)
                await self.broadcast(
                    session.group_name,
                    {"slot": slot},
                    handler="player.left",
                )
                await self._broadcast_game_over(session, reason="disconnect_forfeit")
                await self._cancel_disconnect_tasks(session)
                xp_awards = await award_xp_after_game(session)
                await record_match(session, xp_awards=xp_awards)
                await check_achievements_after_game(session)
            elif session.status == SessionStatus.WAITING:
                session.mark_abandoned(reason=FinishReason.CANCELED)
                await persist_session(session)
                await self.broadcast(
                    session.group_name,
                    {"slot": slot},
                    handler="player.left",
                )
                await self._broadcast_game_over(session, reason="canceled")
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
        if session.tick_task is None:
            session.tick_task = asyncio.create_task(self._tick_loop(session))
            session.tick_owner = self.user.pk

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
