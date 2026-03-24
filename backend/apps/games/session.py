from __future__ import annotations
import enum
import logging
import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger("games.session")


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
    status: SessionStatus = SessionStatus.WAITING
    group_name: str = ""
    created_at: float = field(default_factory=time.time)
    finished_at: float | None = None
    finish_reason: FinishReason | None = None
    winner_id: int | None = None

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

    def all_players_disconnected(self) -> bool:
        """True if every human player in the session is disconnected."""
        if not self.players:
            return False
        return all(not ps.connected for ps in self.players.values())

    def to_info(self) -> dict[str, Any]:
        """Lobby-safe summary (no engine internals)."""
        return {
            "game_id": self.game_id,
            "game_type": self.game_type.value,
            "status": self.status.value,
            "players": {
                str(slot): {
                    "user_id": ps.user_id,
                    "username": ps.username,
                    "connected": ps.connected,
                }
                for slot, ps in self.players.items()
            },
            "ai_difficulty": self.ai_difficulty,
        }

_sessions: dict[str, GameSession] = {}


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
