from __future__ import annotations
import asyncio
import collections
import logging
import time
from typing import Any
from apps.games.consumers import BaseConsumer
from apps.games.pong_ai import AIDifficulty, PongAI
from apps.games.pong_engine import PongEngine
from apps.games.pong_engine import GameStatus as PongStatus
from apps.games.session import (
    FinishReason,
    GameSession,
    GameType,
    PlayerSlot,
    SessionStatus,
    create_session,
    get_session,
    remove_session,
)
from apps.analytics.achievement_service import check_achievements_after_game
from apps.analytics.xp_service import award_xp_after_game
from apps.tournaments.tournament_service import is_tournament_game, on_game_finished

logger = logging.getLogger("games.pong")

TICK_RATE: int = 60                     # Hz
TICK_INTERVAL: float = 1.0 / TICK_RATE  # ~16.67 ms

# Rate limiting: max paddle-input messages per second per player.
INPUT_RATE_LIMIT: int = 120
INPUT_RATE_WINDOW: float = 1.0  # seconds

# Valid paddle directions
_VALID_DIRECTIONS: frozenset[str] = frozenset({"up", "down", "stop"})


class PongConsumer(BaseConsumer):
    """WebSocket consumer for real-time Pong games."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._session: GameSession | None = None
        self._slot: int | None = None

        # Per-connection rate limiter — deque is O(1) popleft.
        self._input_timestamps: collections.deque[float] = collections.deque()


    async def on_connect(self) -> None:
        """Connection accepted — wait for a 'join' message."""

    async def on_disconnect(self, code: int) -> None:
        """Handle player disconnect — immediate forfeit, no reconnection.

        The session is removed outright; there is no grace period.
        """
        session = self._session
        if session is None:
            return

        slot = self._slot

        if session.status == SessionStatus.PLAYING:
            # Forfeit + game over
            if slot is not None:
                session.engine.forfeit(slot)
            # Determine the winner (the opponent of the disconnecting player)
            winner_id: int | None = None
            if slot is not None:
                opp_slot = session.get_opponent_slot(slot)
                opp = session.players.get(opp_slot)
                if opp is not None:
                    winner_id = opp.user_id
            session.mark_finished(
                reason=FinishReason.DISCONNECT_FORFEIT,
                winner_id=winner_id,
            )
            await self._stop_tick_loop(session, force=True)
            await self.broadcast(
                session.group_name,
                {"slot": slot},
                handler="player.left",
            )
            await self._broadcast_game_over(
                session, reason="disconnect_forfeit",
            )
            # Notify tournament system (bracket advancement)
            await on_game_finished(session)
            # Check achievements for all players
            await check_achievements_after_game(session)
            # Award XP to participants
            await award_xp_after_game(session)
        elif session.status == SessionStatus.WAITING:
            # Nobody started yet — abandon
            session.mark_abandoned(reason=FinishReason.CANCELED)
            if slot is not None:
                await self.broadcast(
                    session.group_name,
                    {"slot": slot},
                    handler="player.left",
                )
            # Let the remaining client know the match is canceled.
            await self._broadcast_game_over(session, reason="canceled")

        remove_session(session.game_id)
        await self.leave_group(session.group_name)

    async def on_message(self, content: dict[str, Any]) -> None:
        msg_type = content.get("type", "")

        if msg_type == "join":
            await self._handle_join(content)
        elif msg_type == "input":
            await self._handle_input(content)
        elif msg_type == "forfeit":
            await self._handle_forfeit()
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

        # Look up or create session
        session = get_session(game_id)

        # Check for AI game request
        ai_difficulty = content.get("ai_difficulty")
        if session is None and ai_difficulty:
            session = self._create_ai_session(game_id, ai_difficulty)
        elif session is None:
            # Create a new PvP session
            session = create_session(
                game_type=GameType.PONG,
                engine=PongEngine(),
                game_id=game_id,
            )

        # Already finished?
        if session.status in (SessionStatus.FINISHED, SessionStatus.ABANDONED):
            await self.send_error("game_over", "This game has already ended")
            return

        # Duplicate join (no reconnection allowed)
        user_id: int = self.user.pk
        existing_slot = session.get_player_slot(user_id)

        if existing_slot is not None:
            await self.send_error(
                "rejoin_denied",
                "Cannot rejoin — disconnection forfeits the match",
            )
            return
        elif session.is_full:
            await self.send_error("game_full", "Game is already full")
            return
        else:
            # Assign to next free human slot (skip AI-occupied slot)
            if session.ai_slot == 1:
                slot = 2
            elif 1 not in session.players:
                slot = 1
            else:
                slot = 2
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
            "game_info": session.to_info(),
        })

        # If session is now full → start the game (only if no one else has)
        if (
            session.is_full
            and session.status == SessionStatus.WAITING
        ):
            await self._start_game(session)

    def _create_ai_session(
        self, game_id: str, difficulty: str,
    ) -> GameSession:
        """Create a single-player session with an AI opponent."""
        try:
            diff = AIDifficulty(difficulty)
        except ValueError:
            diff = AIDifficulty.MEDIUM

        engine = PongEngine()
        ai_slot = 2  # AI is always player 2
        ai = PongAI(difficulty=diff.value, player_slot=ai_slot)
        engine.set_player("ai", ai_slot)

        return create_session(
            game_type=GameType.PONG,
            engine=engine,
            game_id=game_id,
            ai=ai,
            ai_slot=ai_slot,
            ai_difficulty=diff.value,
        )

    async def _start_game(self, session: GameSession) -> None:
        # Guard: only one consumer should start the game / tick loop.
        if session.status != SessionStatus.WAITING:
            return
        if getattr(session, "_tick_task", None) is not None:
            return

        session.engine.start()
        session.status = SessionStatus.PLAYING

        await self.broadcast(session.group_name, {
            "game_info": session.to_info(),
        }, handler="game.start")

        # Start the tick loop — store on the session so any consumer
        # can cancel it, but track the owner for safe cleanup.
        session._tick_task = asyncio.create_task(  # type: ignore[attr-defined]
            self._tick_loop(session),
        )
        session._tick_owner = self.user.pk  # type: ignore[attr-defined]

    async def _handle_input(self, content: dict[str, Any]) -> None:
        session = self._session
        if session is None or session.status != SessionStatus.PLAYING:
            return
        if self._slot is None:
            return

        # Rate limit check
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

    def _is_rate_limited(self) -> bool:
        """Sliding-window rate limiter using a deque (no list copy)."""
        now = time.monotonic()
        cutoff = now - INPUT_RATE_WINDOW

        # Drop expired timestamps from the front
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
        # Determine the winner (the opponent)
        opp_slot = session.get_opponent_slot(self._slot)
        opp = session.players.get(opp_slot)
        winner_id = opp.user_id if opp else None
        session.mark_finished(
            reason=FinishReason.FORFEIT,
            winner_id=winner_id,
        )

        await self._stop_tick_loop(session)
        await self._broadcast_game_over(session, reason="forfeit")
        # Notify tournament system (bracket advancement)
        await on_game_finished(session)
        # Check achievements for all players
        await check_achievements_after_game(session)
        # Award XP to participants
        await award_xp_after_game(session)


    async def _tick_loop(self, session: GameSession) -> None:
        """Run the game engine at TICK_RATE Hz, broadcasting state."""
        try:
            while session.status == SessionStatus.PLAYING:
                tick_start = time.monotonic()

                # AI move (if applicable)
                if session.ai is not None:
                    direction = session.ai.compute_move(session.engine)
                    session.engine.handle_input(session.ai_slot, direction)

                # Advance engine
                state = session.engine.tick()

                # Broadcast state to all watchers
                await self.broadcast(session.group_name, {
                    "state": state,
                }, handler="game.state")

                # Check for game over
                if state.get("status") == PongStatus.FINISHED.value:
                    session.mark_finished(
                        reason=FinishReason.SCORE,
                    )
                    await self._broadcast_game_over(session, reason="score")
                    # Notify tournament system (bracket advancement)
                    await on_game_finished(session)
                    # Check achievements for all players
                    await check_achievements_after_game(session)
                    # Award XP to participants
                    await award_xp_after_game(session)
                    break

                # Sleep until next tick
                elapsed = time.monotonic() - tick_start
                sleep_time = TICK_INTERVAL - elapsed
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)

        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Tick loop crashed for game_id=%s", session.game_id)
            session.mark_finished(reason=FinishReason.SERVER_ERROR)
            await self.broadcast(session.group_name, {
                "winner": None,
                "reason": "server_error",
            }, handler="game.over")

    async def _broadcast_game_over(
        self, session: GameSession, reason: str,
    ) -> None:
        winner = session.engine.winner
        await self.broadcast(session.group_name, {
            "winner": winner,
            "reason": reason,
            "final_state": session.engine.get_state(),
        }, handler="game.over")

    async def _stop_tick_loop(
        self, session: GameSession, *, force: bool = False,
    ) -> None:
        """Cancel the tick loop.

        Ownership is checked by ``user_id`` (stable across reconnects).
        If the owner's slot is disconnected, any consumer may take over
        cancellation to avoid orphaned loops.

        Pass ``force=True`` to skip the ownership check entirely (used
        when the game is definitively over, e.g. disconnect forfeit).
        """
        task: asyncio.Task[None] | None = getattr(session, "_tick_task", None)
        if task is None or task.done():
            return

        if not force:
            owner_id: int | None = getattr(session, "_tick_owner", None)
            is_owner = owner_id is not None and owner_id == self.user.pk

            if not is_owner:
                # Allow takeover only when the owner's slot is disconnected.
                owner_slot = session.get_player_slot(owner_id) if owner_id else None
                owner_connected = (
                    owner_slot is not None
                    and session.players.get(owner_slot, None) is not None
                    and session.players[owner_slot].connected
                )
                if owner_connected:
                    return  # owner is still around — let them handle it

        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        session._tick_task = None  # type: ignore[attr-defined]
        session._tick_owner = None  # type: ignore[attr-defined]

    async def game_state(self, event: dict[str, Any]) -> None:
        """Forward game_state events from channel layer to client."""
        await self.send_json({
            "type": "game_state",
            **event.get("state", {}),
        })

    async def game_start(self, event: dict[str, Any]) -> None:
        """Forward game_start events."""
        await self.send_json({
            "type": "game_start",
            "game_info": event.get("game_info"),
        })

    async def game_over(self, event: dict[str, Any]) -> None:
        """Forward game_over events."""
        await self.send_json({
            "type": "game_over",
            "winner": event.get("winner"),
            "reason": event.get("reason"),
            "final_state": event.get("final_state"),
        })

    async def player_left(self, event: dict[str, Any]) -> None:
        """Forward player_left events."""
        await self.send_json({
            "type": "player_left",
            "slot": event.get("slot"),
        })
