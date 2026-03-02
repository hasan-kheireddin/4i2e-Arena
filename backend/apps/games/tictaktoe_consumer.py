from __future__ import annotations
import asyncio
import collections
import logging
import time
from typing import Any
from apps.games.consumers import BaseConsumer
from apps.games.tictactoe_ai import AIDifficulty, TicTacToeAI
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
from apps.tournaments.tournament_service import is_tournament_game, on_game_finished

logger = logging.getLogger("games.tictactoe")


# Rate limiting: max moves per second (generous for TTT)
MOVE_RATE_LIMIT: int = 10
MOVE_RATE_WINDOW: float = 1.0  # seconds

# Brief delay before AI responds (feels more natural)
AI_MOVE_DELAY: float = 0.6  # seconds

class TicTacToeConsumer(BaseConsumer):
    """WebSocket consumer for turn-based Tic-Tac-Toe games."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._session: GameSession | None = None
        self._slot: int | None = None

        # Per-connection rate limiter — deque is O(1) popleft.
        self._move_timestamps: collections.deque[float] = collections.deque()

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

        # Check for AI game request
        ai_difficulty = content.get("ai_difficulty")
        if session is None and ai_difficulty:
            session = self._create_ai_session(game_id, ai_difficulty)
        elif session is None:
            session = create_session(
                game_type=GameType.TICTACTOE,
                engine=TicTacToeEngine(),
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

        # If session is now full → start the game
        if session.is_full and session.status == SessionStatus.WAITING:
            await self._start_game(session)

    def _create_ai_session(
        self, game_id: str, difficulty: str,
    ) -> GameSession:
        """Create a single-player session with an AI opponent."""
        try:
            diff = AIDifficulty(difficulty)
        except ValueError:
            diff = AIDifficulty.MEDIUM

        engine = TicTacToeEngine()
        ai_slot = 2
        ai = TicTacToeAI(difficulty=diff.value, player_slot=ai_slot)
        engine.set_player("ai", ai_slot)

        return create_session(
            game_type=GameType.TICTACTOE,
            engine=engine,
            game_id=game_id,
            ai=ai,
            ai_slot=ai_slot,
            ai_difficulty=diff.value,
        )

    async def _start_game(self, session: GameSession) -> None:
        # Guard: only one consumer should start the game.
        if session.status != SessionStatus.WAITING:
            return

        session.engine.start()
        session.status = SessionStatus.PLAYING

        await self.broadcast(session.group_name, {
            "game_info": session.to_info(),
        }, handler="game.start")

        # Send initial board state
        await self._broadcast_state(session)


    async def _handle_move(self, content: dict[str, Any]) -> None:
        session = self._session
        if session is None or session.status != SessionStatus.PLAYING:
            await self.send_error("not_playing", "Game is not in progress")
            return
        if self._slot is None:
            return

        # Rate limit
        if self._is_rate_limited():
            await self.send_error("rate_limited", "Too many moves — slow down")
            return

        # Validate cell
        cell = content.get("cell")
        if not isinstance(cell, int) or not (0 <= cell < 9):
            await self.send_error("invalid_cell", "Cell must be an integer 0–8")
            return

        # Attempt the move
        result = session.engine.make_move(self._slot, cell)

        if result != MoveResult.OK:
            await self.send_json({
                "type": "move_error",
                "result": result.value,
            })
            return

        # Broadcast updated state
        await self._broadcast_state(session)

        # Check if the game ended
        if session.engine.status == TTTStatus.FINISHED:
            reason = FinishReason.DRAW if session.engine.is_draw else FinishReason.SCORE
            session.mark_finished(reason=reason)
            reason_str = "draw" if session.engine.is_draw else "win"
            await self._broadcast_game_over(session, reason=reason_str)
            # Notify tournament system (bracket advancement)
            await on_game_finished(session)
            return

        # AI move (if it's the AI's turn)
        if session.ai is not None and session.status == SessionStatus.PLAYING:
            await self._do_ai_move(session)

    async def _do_ai_move(self, session: GameSession) -> None:
        """Let the AI make its move after a brief delay."""
        await asyncio.sleep(AI_MOVE_DELAY)

        # Re-check: game may have ended during the sleep
        if session.status != SessionStatus.PLAYING:
            return
        if session.engine.status != TTTStatus.PLAYING:
            return

        cell = session.ai.compute_move(session.engine)
        result = session.engine.make_move(session.ai_slot, cell)

        if result != MoveResult.OK:
            logger.error(
                "AI produced invalid move cell=%s result=%s game_id=%s",
                cell, result.value, session.game_id,
            )
            return

        await self._broadcast_state(session)

        if session.engine.status == TTTStatus.FINISHED:
            reason = FinishReason.DRAW if session.engine.is_draw else FinishReason.SCORE
            session.mark_finished(reason=reason)
            reason_str = "draw" if session.engine.is_draw else "win"
            await self._broadcast_game_over(session, reason=reason_str)
            # Notify tournament system (bracket advancement)
            await on_game_finished(session)

    def _is_rate_limited(self) -> bool:
        """Sliding-window rate limiter using a deque (no list copy)."""
        now = time.monotonic()
        cutoff = now - MOVE_RATE_WINDOW

        # Drop expired timestamps from the front
        while self._move_timestamps and self._move_timestamps[0] <= cutoff:
            self._move_timestamps.popleft()

        if len(self._move_timestamps) >= MOVE_RATE_LIMIT:
            return True

        self._move_timestamps.append(now)
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
        await self._broadcast_game_over(session, reason="forfeit")
        # Notify tournament system (bracket advancement)
        await on_game_finished(session)


    async def _broadcast_state(self, session: GameSession) -> None:
        state = session.engine.get_state()
        await self.broadcast(session.group_name, {
            "state": state,
        }, handler="game.state")

    async def _broadcast_game_over(
        self, session: GameSession, reason: str,
    ) -> None:
        winner = session.engine.winner
        winner_val = winner.value if winner else None
        await self.broadcast(session.group_name, {
            "winner": winner_val,
            "is_draw": session.engine.is_draw,
            "reason": reason,
            "final_state": session.engine.get_state(),
        }, handler="game.over")

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
            "is_draw": event.get("is_draw"),
            "reason": event.get("reason"),
            "final_state": event.get("final_state"),
        })

    async def player_left(self, event: dict[str, Any]) -> None:
        """Forward player_left events."""
        await self.send_json({
            "type": "player_left",
            "slot": event.get("slot"),
        })
