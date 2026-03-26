from __future__ import annotations
import collections
import logging
import time
from typing import Any
from apps.games.consumers import BaseConsumer
from apps.games.tictactoe_engine import (
    MoveResult,
    TicTacToeEngine,
)
from apps.games.tictactoe_engine import GameStatus as TTTStatus
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
from apps.games.match_recording_service import record_match

logger = logging.getLogger("games.tictactoe")

# Rate limiting: max moves per second
MOVE_RATE_LIMIT: int = 2
MOVE_RATE_WINDOW: float = 1.0  # seconds


class TicTacToeConsumer(BaseConsumer):
    """WebSocket consumer for turn-based Tic-Tac-Toe games (PvP only)."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._session: GameSession | None = None
        self._slot: int | None = None
        self._move_timestamps: collections.deque[float] = collections.deque()

    async def on_connect(self) -> None:
        """Connection accepted — wait for a 'join' message."""

    async def on_disconnect(self, code: int) -> None:
        """Handle player disconnect — immediate forfeit, no reconnection."""
        session = self._session
        if session is None:
            return

        slot = self._slot

        if session.status == SessionStatus.PLAYING:
            if slot is not None:
                session.engine.forfeit(slot)
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
            await self.broadcast(
                session.group_name,
                {"slot": slot},
                handler="player.left",
            )
            await self._broadcast_game_over(session, reason="disconnect_forfeit")
            await record_match(session)

        elif session.status == SessionStatus.WAITING:
            session.mark_abandoned(reason=FinishReason.CANCELED)
            if slot is not None:
                await self.broadcast(
                    session.group_name,
                    {"slot": slot},
                    handler="player.left",
                )
            await self._broadcast_game_over(session, reason="canceled")

        remove_session(session.game_id)
        await self.leave_group(session.group_name)

    async def on_message(self, content: dict[str, Any]) -> None:
        msg_type = content.get("type", "")

        if msg_type == "join":
            await self._handle_join(content)
        elif msg_type == "move":
            await self._handle_move(content)
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

        session = get_session(game_id)
        if session is None:
            session = create_session(
                game_type=GameType.TICTACTOE,
                engine=TicTacToeEngine(),
                game_id=game_id,
            )

        if session.status in (SessionStatus.FINISHED, SessionStatus.ABANDONED):
            await self.send_error("game_over", "This game has already ended")
            return

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
            "game_info": session.to_info(),
        })

        if session.is_full and session.status == SessionStatus.WAITING:
            await self._start_game(session)

    async def _start_game(self, session: GameSession) -> None:
        if session.status != SessionStatus.WAITING:
            return

        session.engine.start()
        session.status = SessionStatus.PLAYING

        await self.broadcast(session.group_name, {
            "game_info": session.to_info(),
        }, handler="game.start")

        await self._broadcast_state(session)

    async def _handle_move(self, content: dict[str, Any]) -> None:
        session = self._session
        if session is None or session.status != SessionStatus.PLAYING:
            await self.send_error("not_playing", "Game is not in progress")
            return
        if self._slot is None:
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

        await self._broadcast_state(session)

        if session.engine.status == TTTStatus.FINISHED:
            reason = FinishReason.DRAW if session.engine.is_draw else FinishReason.SCORE
            winner_id = self._resolve_winner_id(session)
            session.mark_finished(reason=reason, winner_id=winner_id)
            reason_str = "draw" if session.engine.is_draw else "win"
            await self._broadcast_game_over(session, reason=reason_str)
            await record_match(session)

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
        await self._broadcast_game_over(session, reason="forfeit")
        await record_match(session)

    def _resolve_winner_id(self, session: GameSession) -> int | None:
        """Derive winner user_id from the engine's winner symbol (X=slot1, O=slot2)."""
        if session.engine.is_draw or session.engine.winner is None:
            return None
        winner_slot = 1 if session.engine.winner.value == "X" else 2
        ps = session.players.get(winner_slot)
        return ps.user_id if ps is not None else None

    def _is_rate_limited(self) -> bool:
        """Sliding-window rate limiter."""
        now = time.monotonic()
        cutoff = now - MOVE_RATE_WINDOW
        while self._move_timestamps and self._move_timestamps[0] <= cutoff:
            self._move_timestamps.popleft()
        if len(self._move_timestamps) >= MOVE_RATE_LIMIT:
            return True
        self._move_timestamps.append(now)
        return False

    async def _broadcast_state(self, session: GameSession) -> None:
        state = session.engine.get_state()
        await self.broadcast(session.group_name, {"state": state}, handler="game.state")

    async def _broadcast_game_over(self, session: GameSession, reason: str) -> None:
        winner = session.engine.winner
        winner_val = winner.value if winner else None
        await self.broadcast(session.group_name, {
            "winner": winner_val,
            "is_draw": session.engine.is_draw,
            "reason": reason,
            "final_state": session.engine.get_state(),
        }, handler="game.over")

    async def game_state(self, event: dict[str, Any]) -> None:
        await self.send_json({"type": "game_state", **event.get("state", {})})

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
