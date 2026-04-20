from __future__ import annotations
import enum
import json
import logging
import os
import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Optional

import redis.asyncio as aioredis
from apps.games.pong_engine import PaddleDirection, PongEngine
from apps.games.tictactoe_engine import Mark, TicTacToeEngine

logger = logging.getLogger("games.session")

_SESSION_KEY_PREFIX = "games:session"
_SESSION_STORE_TTL_SECONDS = int(os.environ.get("GAME_SESSION_TTL_SECONDS", "1800"))
_SESSION_STORE_ENABLED = os.environ.get("GAME_SESSION_STORE_ENABLED", "1") != "0"
_REDIS_CLIENT: aioredis.Redis | None = None


class GameType(str, enum.Enum):
    PONG = "pong"
    TICTACTOE = "tictactoe"


class FinishReason(str, enum.Enum):
    SCORE = "score"                          # Normal win by score / move
    DRAW = "draw"                            # Draw (no winner)
    FORFEIT = "forfeit"                      # Explicit forfeit
    DISCONNECT_FORFEIT = "disconnect_forfeit"  # Forfeit due to disconnect
    CANCELED = "canceled"                    # Game canceled before start
    SERVER_ERROR = "server_error"            # Internal error


class SessionStatus(str, enum.Enum):
    WAITING = "waiting"         # Waiting for second player
    PLAYING = "playing"         # Game in progress
    FINISHED = "finished"       # Game over (completed / forfeit)
    ABANDONED = "abandoned"     # Both players disconnected


@dataclass
class PlayerSlot:
    """Tracks a player connected to a session."""
    user_id: int
    username: str
    channel_name: str
    slot: int                           # 1 or 2
    connected: bool = True
    disconnected_at: float | None = None    # timestamp of last disconnect


@dataclass
class GameSession:
    """
    Holds all runtime state for a single game.

    Attributes
    ----------
    game_id : str           — unique session identifier.
    game_type : GameType    — pong or tictactoe.
    engine : Any            — the game engine instance.
    ai : Any | None         — AI opponent instance (None for PvP).
    ai_slot : int | None    — which slot the AI occupies (1 or 2).
    ai_difficulty : str | None — difficulty label.
    players : dict[int, PlayerSlot]  — slot → player info.
    status : SessionStatus
    group_name : str        — channel-layer group for broadcasting.
    created_at : float
    finished_at : float | None — timestamp when game ended.
    """
    game_id: str
    game_type: GameType
    engine: Any
    ai: Any = None
    ai_slot: int | None = None
    ai_difficulty: str | None = None
    players: dict[int, PlayerSlot] = field(default_factory=dict)
    ready_slots: set = field(default_factory=set)
    both_connected_sent: bool = False
    status: SessionStatus = SessionStatus.WAITING
    group_name: str = ""
    created_at: float = field(default_factory=time.time)
    finished_at: float | None = None
    finish_reason: FinishReason | None = None
    winner_id: int | None = None
    paused: bool = False
    pause_reason: str | None = None
    tick_task: Any = None
    tick_owner: int | None = None
    disconnect_tasks: dict[int, Any] = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        if not self.group_name:
            self.group_name = f"game_{self.game_id}"

    # Convenience ----------------------------------------------------------

    @property
    def player_count(self) -> int:
        """Number of human players in the session."""
        return len(self.players)

    @property
    def is_full(self) -> bool:
        """Whether the session has all required human players.

        For PvE (AI present), only 1 human is needed.
        For PvP, 2 humans are needed.
        """
        required = 1 if self.ai is not None else 2
        return self.player_count >= required

    def get_player_slot(self, user_id: int) -> Optional[int]:
        """Return the slot number for a given user, or ``None``."""
        for slot, ps in self.players.items():
            if ps.user_id == user_id:
                return slot
        return None

    def get_opponent_slot(self, slot: int) -> int:
        return 2 if slot == 1 else 1

    def mark_finished(
        self,
        reason: FinishReason | None = None,
        winner_id: int | None = None,
    ) -> None:
        """Transition status to FINISHED and record timestamp."""
        self.status = SessionStatus.FINISHED
        self.finished_at = time.time()
        self.finish_reason = reason
        self.winner_id = winner_id

    def mark_abandoned(self, reason: FinishReason | None = None) -> None:
        """Transition status to ABANDONED and record timestamp."""
        self.status = SessionStatus.ABANDONED
        self.finished_at = time.time()
        self.finish_reason = reason

    def mark_player_disconnected(self, slot: int) -> None:
        """Mark a player slot as disconnected and record timestamp.

        Does **not** transition the session status — callers are
        responsible for deciding when to abandon (e.g. after a
        reconnect grace period or via ``cleanup_stale_sessions``).
        """
        if slot in self.players:
            self.players[slot].connected = False
            self.players[slot].disconnected_at = time.time()

    def mark_player_connected(
        self,
        slot: int,
        *,
        channel_name: str | None = None,
    ) -> None:
        """Mark a player slot as connected again and refresh metadata."""
        if slot in self.players:
            self.players[slot].connected = True
            self.players[slot].disconnected_at = None
            if channel_name is not None:
                self.players[slot].channel_name = channel_name

    def all_players_disconnected(self) -> bool:
        """True if every human player in the session is disconnected."""
        if not self.players:
            return False
        return all(not ps.connected for ps in self.players.values())

    @property
    def all_players_connected(self) -> bool:
        """True if every human player in the session is currently connected."""
        if not self.players:
            return False
        return all(ps.connected for ps in self.players.values())

    def to_info(self) -> dict[str, Any]:
        """Lobby-safe summary (no engine internals)."""
        return {
            "game_id": self.game_id,
            "game_type": self.game_type.value,
            "status": self.status.value,
            "players": {
                str(slot): {
                    "user_id": str(ps.user_id),
                    "username": ps.username,
                    "connected": ps.connected,
                }
                for slot, ps in self.players.items()
            },
            "ai_difficulty": self.ai_difficulty,
        }


_sessions: dict[str, GameSession] = {}


def _session_key(game_id: str) -> str:
    return f"{_SESSION_KEY_PREFIX}:{game_id}"


def _get_redis_client() -> aioredis.Redis | None:
    global _REDIS_CLIENT
    if not _SESSION_STORE_ENABLED:
        return None
    if _REDIS_CLIENT is None:
        redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
        _REDIS_CLIENT = aioredis.from_url(redis_url, decode_responses=True)
    return _REDIS_CLIENT


def _serialize_engine(game_type: GameType, engine: Any) -> dict[str, Any]:
    if game_type == GameType.PONG and isinstance(engine, PongEngine):
        return {
            "status": engine.status.value,
            "tick_count": engine.tick_count,
            "serve_cooldown": engine.serve_cooldown,
            "winner": engine.winner,
            "last_scorer": engine.last_scorer,
            "started_at": engine.started_at,
            "finished_at": engine.finished_at,
            "ball": {
                "x": engine.ball.x,
                "y": engine.ball.y,
                "vx": engine.ball.vx,
                "vy": engine.ball.vy,
                "speed": engine.ball.speed,
            },
            "player1": {
                "score": engine.player1.score,
                "paddle_y": engine.player1.paddle.y,
                "direction": engine.player1.paddle.direction.value,
                "player_id": engine.player1.player_id,
            },
            "player2": {
                "score": engine.player2.score,
                "paddle_y": engine.player2.paddle.y,
                "direction": engine.player2.paddle.direction.value,
                "player_id": engine.player2.player_id,
            },
            "stats": {
                "current_rally_hits": engine.current_rally_hits,
                "max_rally_hits": engine.max_rally_hits,
                "player_hits": engine.player_hits,
                "player_current_consecutive_blocks": engine.player_current_consecutive_blocks,
                "player_max_consecutive_blocks": engine.player_max_consecutive_blocks,
                "player_misses": engine.player_misses,
                "player_max_deficit": engine.player_max_deficit,
                "player_scored_three_under_ten": engine.player_scored_three_under_ten,
                "player_point_timestamps": engine.player_point_timestamps,
            },
        }
    if game_type == GameType.TICTACTOE and isinstance(engine, TicTacToeEngine):
        return {
            "status": engine.status.value,
            "board": [
                cell.value if cell is not None else None
                for cell in engine.board
            ],
            "current_turn": engine.current_turn.value,
            "move_count": engine.move_count,
            "winner": engine.winner.value if engine.winner is not None else None,
            "is_draw": engine.is_draw,
            "winning_line": (
                list(engine.winning_line)
                if engine.winning_line is not None
                else None
            ),
            "player1_id": engine.player1_id,
            "player2_id": engine.player2_id,
            "started_at": engine.started_at,
            "finished_at": engine.finished_at,
            "stats": {
                "player_block_counts": engine.player_block_counts,
            },
        }
    raise ValueError(f"Unsupported game engine for serialization: {game_type}")


def _deserialize_pong_engine(payload: dict[str, Any]) -> PongEngine:
    engine = PongEngine()
    try:
        status_raw = payload.get("status")
        if isinstance(status_raw, str):
            engine.status = engine.status.__class__(status_raw)
    except ValueError:
        pass

    engine.tick_count = int(payload.get("tick_count", 0))
    engine.serve_cooldown = int(payload.get("serve_cooldown", 0))
    winner_raw = payload.get("winner")
    engine.winner = winner_raw if winner_raw in (1, 2) else None
    scorer_raw = payload.get("last_scorer")
    engine.last_scorer = scorer_raw if scorer_raw in (1, 2) else None
    engine.started_at = payload.get("started_at")
    engine.finished_at = payload.get("finished_at")

    ball = payload.get("ball", {})
    if isinstance(ball, dict):
        engine.ball.x = float(ball.get("x", engine.ball.x))
        engine.ball.y = float(ball.get("y", engine.ball.y))
        engine.ball.vx = float(ball.get("vx", engine.ball.vx))
        engine.ball.vy = float(ball.get("vy", engine.ball.vy))
        engine.ball.speed = float(ball.get("speed", engine.ball.speed))

    p1 = payload.get("player1", {})
    if isinstance(p1, dict):
        engine.player1.score = int(p1.get("score", engine.player1.score))
        engine.player1.paddle.y = float(
            p1.get("paddle_y", engine.player1.paddle.y),
        )
        direction_raw = p1.get("direction")
        if isinstance(direction_raw, str):
            try:
                engine.player1.paddle.direction = PaddleDirection(direction_raw)
            except ValueError:
                pass
        player_id = p1.get("player_id")
        engine.player1.player_id = str(player_id) if player_id is not None else None

    p2 = payload.get("player2", {})
    if isinstance(p2, dict):
        engine.player2.score = int(p2.get("score", engine.player2.score))
        engine.player2.paddle.y = float(
            p2.get("paddle_y", engine.player2.paddle.y),
        )
        direction_raw = p2.get("direction")
        if isinstance(direction_raw, str):
            try:
                engine.player2.paddle.direction = PaddleDirection(direction_raw)
            except ValueError:
                pass
        player_id = p2.get("player_id")
        engine.player2.player_id = str(player_id) if player_id is not None else None

    stats = payload.get("stats", {})
    if isinstance(stats, dict):
        engine.current_rally_hits = int(stats.get("current_rally_hits", 0))
        engine.max_rally_hits = int(stats.get("max_rally_hits", 0))

        def _deserialize_int_dict(raw: Any) -> dict[int, int]:
            if not isinstance(raw, dict):
                return {}
            out: dict[int, int] = {}
            for key, value in raw.items():
                try:
                    out[int(key)] = int(value)
                except (TypeError, ValueError):
                    continue
            return out

        def _deserialize_bool_dict(raw: Any) -> dict[int, bool]:
            if not isinstance(raw, dict):
                return {}
            out: dict[int, bool] = {}
            for key, value in raw.items():
                try:
                    out[int(key)] = bool(value)
                except (TypeError, ValueError):
                    continue
            return out

        def _deserialize_float_list_dict(raw: Any) -> dict[int, list[float]]:
            if not isinstance(raw, dict):
                return {}
            out: dict[int, list[float]] = {}
            for key, value in raw.items():
                try:
                    slot = int(key)
                except (TypeError, ValueError):
                    continue
                if isinstance(value, list):
                    out[slot] = [
                        float(v)
                        for v in value
                        if isinstance(v, (int, float))
                    ]
            return out

        engine.player_hits = {1: 0, 2: 0, **_deserialize_int_dict(stats.get("player_hits"))}
        engine.player_current_consecutive_blocks = {
            1: 0,
            2: 0,
            **_deserialize_int_dict(stats.get("player_current_consecutive_blocks")),
        }
        engine.player_max_consecutive_blocks = {
            1: 0,
            2: 0,
            **_deserialize_int_dict(stats.get("player_max_consecutive_blocks")),
        }
        engine.player_misses = {1: 0, 2: 0, **_deserialize_int_dict(stats.get("player_misses"))}
        engine.player_max_deficit = {
            1: 0,
            2: 0,
            **_deserialize_int_dict(stats.get("player_max_deficit")),
        }
        engine.player_scored_three_under_ten = {
            1: False,
            2: False,
            **_deserialize_bool_dict(stats.get("player_scored_three_under_ten")),
        }
        engine.player_point_timestamps = {
            1: [],
            2: [],
            **_deserialize_float_list_dict(stats.get("player_point_timestamps")),
        }

    return engine


def _deserialize_ttt_engine(payload: dict[str, Any]) -> TicTacToeEngine:
    engine = TicTacToeEngine()
    status_raw = payload.get("status")
    if isinstance(status_raw, str):
        try:
            engine.status = engine.status.__class__(status_raw)
        except ValueError:
            pass

    board_raw = payload.get("board")
    if isinstance(board_raw, list) and len(board_raw) == 9:
        board: list[Mark | None] = []
        for cell in board_raw:
            if cell in ("X", "O"):
                board.append(Mark(cell))
            else:
                board.append(None)
        engine.board = board

    turn_raw = payload.get("current_turn")
    if turn_raw in ("X", "O"):
        engine.current_turn = Mark(turn_raw)
    engine.move_count = int(payload.get("move_count", engine.move_count))

    winner_raw = payload.get("winner")
    if winner_raw in ("X", "O"):
        engine.winner = Mark(winner_raw)
    else:
        engine.winner = None
    engine.is_draw = bool(payload.get("is_draw", False))

    winning_line = payload.get("winning_line")
    if (
        isinstance(winning_line, list)
        and len(winning_line) == 3
        and all(isinstance(n, int) for n in winning_line)
    ):
        engine.winning_line = (winning_line[0], winning_line[1], winning_line[2])
    else:
        engine.winning_line = None

    player1_id = payload.get("player1_id")
    player2_id = payload.get("player2_id")
    engine.player1_id = str(player1_id) if player1_id is not None else None
    engine.player2_id = str(player2_id) if player2_id is not None else None
    engine.started_at = payload.get("started_at")
    engine.finished_at = payload.get("finished_at")
    stats = payload.get("stats", {})
    if isinstance(stats, dict):
        raw_blocks = stats.get("player_block_counts")
        if isinstance(raw_blocks, dict):
            block_counts: dict[int, int] = {1: 0, 2: 0}
            for key, value in raw_blocks.items():
                try:
                    block_counts[int(key)] = int(value)
                except (TypeError, ValueError):
                    continue
            engine.player_block_counts = block_counts
    return engine


def _serialize_session(session: GameSession) -> dict[str, Any]:
    return {
        "version": 1,
        "game_id": session.game_id,
        "game_type": session.game_type.value,
        "status": session.status.value,
        "group_name": session.group_name,
        "created_at": session.created_at,
        "finished_at": session.finished_at,
        "finish_reason": (
            session.finish_reason.value
            if session.finish_reason is not None
            else None
        ),
        "winner_id": session.winner_id,
        "paused": session.paused,
        "pause_reason": session.pause_reason,
        "both_connected_sent": session.both_connected_sent,
        "ready_slots": sorted(int(slot) for slot in session.ready_slots),
        "players": {
            str(slot): {
                "user_id": ps.user_id,
                "username": ps.username,
                "channel_name": ps.channel_name,
                "slot": ps.slot,
                "connected": ps.connected,
                "disconnected_at": ps.disconnected_at,
            }
            for slot, ps in session.players.items()
        },
        "engine": _serialize_engine(session.game_type, session.engine),
    }


def _deserialize_session(payload: dict[str, Any]) -> GameSession:
    game_id = str(payload["game_id"])
    game_type = GameType(str(payload["game_type"]))
    engine_payload = payload.get("engine", {})

    if game_type == GameType.PONG:
        engine = _deserialize_pong_engine(
            engine_payload if isinstance(engine_payload, dict) else {},
        )
    elif game_type == GameType.TICTACTOE:
        engine = _deserialize_ttt_engine(
            engine_payload if isinstance(engine_payload, dict) else {},
        )
    else:
        raise ValueError(f"Unsupported game type in snapshot: {game_type}")

    session = GameSession(
        game_id=game_id,
        game_type=game_type,
        engine=engine,
    )
    session.group_name = str(payload.get("group_name", f"game_{game_id}"))
    status_raw = payload.get("status")
    if isinstance(status_raw, str):
        try:
            session.status = SessionStatus(status_raw)
        except ValueError:
            session.status = SessionStatus.WAITING
    session.created_at = float(payload.get("created_at", session.created_at))

    finished_at = payload.get("finished_at")
    session.finished_at = (
        float(finished_at)
        if isinstance(finished_at, (int, float))
        else None
    )

    reason_raw = payload.get("finish_reason")
    if isinstance(reason_raw, str):
        try:
            session.finish_reason = FinishReason(reason_raw)
        except ValueError:
            session.finish_reason = None
    session.winner_id = (
        int(payload["winner_id"])
        if isinstance(payload.get("winner_id"), int)
        else None
    )
    session.paused = bool(payload.get("paused", False))
    pause_reason = payload.get("pause_reason")
    session.pause_reason = str(pause_reason) if isinstance(pause_reason, str) else None
    session.both_connected_sent = bool(payload.get("both_connected_sent", False))

    ready_slots_raw = payload.get("ready_slots")
    if isinstance(ready_slots_raw, list):
        session.ready_slots = {
            int(slot)
            for slot in ready_slots_raw
            if isinstance(slot, int)
        }

    players_raw = payload.get("players")
    if isinstance(players_raw, dict):
        players: dict[int, PlayerSlot] = {}
        for slot_key, value in players_raw.items():
            if not isinstance(value, dict):
                continue
            try:
                slot = int(slot_key)
            except ValueError:
                continue
            user_id_raw = value.get("user_id")
            if not isinstance(user_id_raw, int):
                continue
            username = value.get("username")
            if not isinstance(username, str):
                continue
            channel_name = value.get("channel_name")
            connected = bool(value.get("connected", False))
            disconnected_at_raw = value.get("disconnected_at")
            disconnected_at = (
                float(disconnected_at_raw)
                if isinstance(disconnected_at_raw, (int, float))
                else None
            )
            players[slot] = PlayerSlot(
                user_id=user_id_raw,
                username=username,
                channel_name=(
                    str(channel_name)
                    if isinstance(channel_name, str)
                    else ""
                ),
                slot=slot,
                connected=connected,
                disconnected_at=disconnected_at,
            )
        session.players = players

    return session


def _prepare_recovered_session(session: GameSession) -> GameSession:
    if session.status in (SessionStatus.WAITING, SessionStatus.PLAYING):
        now = time.time()
        for ps in session.players.values():
            ps.connected = False
            ps.channel_name = ""
            if ps.disconnected_at is None:
                ps.disconnected_at = now
        if session.status == SessionStatus.PLAYING:
            session.paused = True
            if session.pause_reason is None:
                session.pause_reason = "server_recovery"
    session.tick_task = None
    session.tick_owner = None
    session.disconnect_tasks = {}
    return session


async def persist_session(session: GameSession) -> None:
    redis_client = _get_redis_client()
    if redis_client is None:
        return
    try:
        raw = json.dumps(_serialize_session(session))
        await redis_client.set(
            _session_key(session.game_id),
            raw,
            ex=_SESSION_STORE_TTL_SECONDS,
        )
    except Exception:
        logger.exception(
            "Failed to persist session snapshot: game_id=%s",
            session.game_id,
        )


async def create_session_async(
    game_type: GameType,
    engine: Any,
    game_id: str | None = None,
    ai: Any = None,
    ai_slot: int | None = None,
    ai_difficulty: str | None = None,
) -> GameSession:
    session = create_session(
        game_type=game_type,
        engine=engine,
        game_id=game_id,
        ai=ai,
        ai_slot=ai_slot,
        ai_difficulty=ai_difficulty,
    )
    await persist_session(session)
    return session


async def get_session_async(game_id: str) -> Optional[GameSession]:
    local = get_session(game_id)
    if local is not None:
        return local

    redis_client = _get_redis_client()
    if redis_client is None:
        return None

    try:
        raw = await redis_client.get(_session_key(game_id))
    except Exception:
        logger.exception("Failed to load session snapshot: game_id=%s", game_id)
        return None
    if not raw:
        return None

    try:
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("session snapshot must be a JSON object")
        recovered = _prepare_recovered_session(_deserialize_session(payload))
        _sessions[game_id] = recovered
        logger.info("Recovered session snapshot: game_id=%s", game_id)
        return recovered
    except Exception:
        logger.exception("Invalid session snapshot payload: game_id=%s", game_id)
        return None


async def remove_session_async(game_id: str) -> Optional[GameSession]:
    session = remove_session(game_id)
    redis_client = _get_redis_client()
    if redis_client is None:
        return session
    try:
        await redis_client.delete(_session_key(game_id))
    except Exception:
        logger.exception("Failed to delete session snapshot: game_id=%s", game_id)
    return session


def generate_game_id() -> str:
    """Generate a URL-safe unique game id."""
    return secrets.token_urlsafe(12)


def create_session(
    game_type: GameType,
    engine: Any,
    game_id: str | None = None,
    ai: Any = None,
    ai_slot: int | None = None,
    ai_difficulty: str | None = None,
) -> GameSession:
    """Create and register a new game session.

    Raises
    ------
    ValueError
        If ``game_id`` already exists in the session store, or if AI
        slot invariants are violated.
    """
    gid = game_id or generate_game_id()

    # --- collision guard --------------------------------------------------
    if gid in _sessions:
        raise ValueError(f"Session with game_id '{gid}' already exists")

    # --- AI slot invariants -----------------------------------------------
    if ai is not None:
        if ai_slot not in (1, 2):
            raise ValueError(f"ai_slot must be 1 or 2, got {ai_slot!r}")
    elif ai_slot is not None:
        raise ValueError("ai_slot set without an AI instance")

    session = GameSession(
        game_id=gid,
        game_type=game_type,
        engine=engine,
        ai=ai,
        ai_slot=ai_slot,
        ai_difficulty=ai_difficulty,
    )
    _sessions[gid] = session
    logger.info("Session created: game_id=%s type=%s", gid, game_type.value)
    return session


def get_session(game_id: str) -> Optional[GameSession]:
    """Look up an active session by id."""
    return _sessions.get(game_id)


def remove_session(game_id: str) -> Optional[GameSession]:
    """Remove and return a session (returns ``None`` if not found)."""
    session = _sessions.pop(game_id, None)
    if session:
        logger.info("Session removed: game_id=%s", game_id)
    return session


def active_sessions() -> dict[str, GameSession]:
    """Return a **shallow copy** of the sessions dict.

    Callers cannot accidentally mutate the internal store.
    """
    return dict(_sessions)


def cleanup_stale_sessions(ttl_seconds: float = 300.0) -> list[str]:
    """Remove sessions that have been FINISHED / ABANDONED longer than *ttl*.

    Also marks sessions as ABANDONED when all human players have been
    disconnected for longer than *ttl* and the game has no AI.

    Returns the list of removed game ids.
    """
    now = time.time()
    to_remove: list[str] = []

    for gid, session in list(_sessions.items()):
        # 1) Already terminal — check age since finished
        if session.status in (SessionStatus.FINISHED, SessionStatus.ABANDONED):
            if session.finished_at and (now - session.finished_at) >= ttl_seconds:
                to_remove.append(gid)
            elif not session.finished_at:
                # Legacy session without finished_at — use created_at
                if (now - session.created_at) >= ttl_seconds:
                    to_remove.append(gid)
            continue

        # 2) WAITING with no players for too long — mark abandoned but
        #    don't remove yet; the terminal-status branch above will
        #    remove it on a subsequent pass once the TTL elapses.
        if (
            session.status == SessionStatus.WAITING
            and session.player_count == 0
            and (now - session.created_at) >= ttl_seconds
        ):
            session.mark_abandoned()
            continue

        # 3) All human players disconnected (PvP) — use the *latest*
        #    disconnect so we wait for the full grace period after the
        #    last player left.
        if session.ai is None and session.all_players_disconnected():
            latest_dc = max(
                (ps.disconnected_at for ps in session.players.values()
                 if ps.disconnected_at is not None),
                default=None,
            )
            if latest_dc and (now - latest_dc) >= ttl_seconds:
                session.mark_abandoned()
                continue

    removed: list[str] = []
    for gid in to_remove:
        if remove_session(gid):
            removed.append(gid)

    if removed:
        logger.info("Cleaned up %d stale session(s): %s", len(removed), removed)
    return removed
