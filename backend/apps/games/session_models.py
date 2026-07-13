from __future__ import annotations

import enum
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional


class GameType(str, enum.Enum):
    PONG = "pong"
    TICTACTOE = "tictactoe"


class FinishReason(str, enum.Enum):
    SCORE = "score"
    DRAW = "draw"
    FORFEIT = "forfeit"
    DISCONNECT_FORFEIT = "disconnect_forfeit"
    CANCELED = "canceled"
    SERVER_ERROR = "server_error"


class SessionStatus(str, enum.Enum):
    WAITING = "waiting"
    PLAYING = "playing"
    FINISHED = "finished"
    ABANDONED = "abandoned"


@dataclass
class PlayerSlot:
    """Tracks a player connected to a session."""

    user_id: int | str | uuid.UUID
    username: str
    channel_name: str
    slot: int
    connected: bool = True
    disconnected_at: float | None = None


@dataclass
class SpectatorSlot:
    """Tracks a spectator connected to a session."""

    user_id: int | str | uuid.UUID
    username: str
    channel_name: str
    side: int | None
    joined_at: float = field(default_factory=time.time)


@dataclass
class GameSession:
    """
    Holds all runtime state for a single game.

    Attributes
    ----------
    game_id : str
        Unique session identifier.
    game_type : GameType
        Pong or TicTacToe.
    engine : Any
        The game engine instance.
    ai : Any | None
        AI opponent instance (None for PvP).
    ai_slot : int | None
        Which slot the AI occupies (1 or 2).
    ai_difficulty : str | None
        Difficulty label.
    players : dict[int, PlayerSlot]
        Slot to player info.
    status : SessionStatus
    group_name : str
        Channel-layer group for broadcasting.
    created_at : float
    finished_at : float | None
        Timestamp when game ended.
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
    winner_id: int | str | uuid.UUID | None = None
    paused: bool = False
    pause_reason: str | None = None
    tick_task: Any = None
    tick_owner: int | None = None
    disconnect_tasks: dict[int, Any] = field(default_factory=dict, repr=False)
    spectators: dict[str, SpectatorSlot] = field(default_factory=dict)
    # For remote PvP sessions, only identities selected by matchmaking or a
    # validated invitation may occupy player slots.  An empty set is reserved
    # for explicitly-created local/AI sessions.
    authorized_player_ids: set[str] = field(default_factory=set)

    def __post_init__(self) -> None:
        if not self.group_name:
            self.group_name = f"game_{self.game_id}"

    @property
    def player_count(self) -> int:
        return len(self.players)

    @property
    def is_full(self) -> bool:
        required = 1 if self.ai is not None else 2
        return self.player_count >= required

    def get_player_slot(self, user_id: int | str | uuid.UUID) -> Optional[int]:
        for slot, player in self.players.items():
            if player.user_id == user_id:
                return slot
        return None

    def is_player_authorized(self, user_id: int | str | uuid.UUID) -> bool:
        return self.ai is not None or str(user_id) in self.authorized_player_ids

    def get_opponent_slot(self, slot: int) -> int:
        return 2 if slot == 1 else 1

    def mark_finished(
        self,
        reason: FinishReason | None = None,
        winner_id: int | str | uuid.UUID | None = None,
    ) -> None:
        self.status = SessionStatus.FINISHED
        self.finished_at = time.time()
        self.finish_reason = reason
        self.winner_id = winner_id

    def mark_abandoned(self, reason: FinishReason | None = None) -> None:
        self.status = SessionStatus.ABANDONED
        self.finished_at = time.time()
        self.finish_reason = reason

    def mark_player_disconnected(self, slot: int) -> None:
        if slot in self.players:
            self.players[slot].connected = False
            self.players[slot].disconnected_at = time.time()

    def mark_player_connected(
        self,
        slot: int,
        *,
        channel_name: str | None = None,
    ) -> None:
        if slot in self.players:
            self.players[slot].connected = True
            self.players[slot].disconnected_at = None
            if channel_name is not None:
                self.players[slot].channel_name = channel_name

    def all_players_disconnected(self) -> bool:
        if not self.players:
            return False
        return all(not player.connected for player in self.players.values())

    @property
    def all_players_connected(self) -> bool:
        if not self.players:
            return False
        return all(player.connected for player in self.players.values())

    @property
    def spectator_count(self) -> int:
        return len(self.spectators)

    @property
    def spectator_count_side1(self) -> int:
        return sum(1 for spectator in self.spectators.values() if spectator.side == 1)

    @property
    def spectator_count_side2(self) -> int:
        return sum(1 for spectator in self.spectators.values() if spectator.side == 2)

    def to_info(self) -> dict[str, Any]:
        return {
            "game_id": self.game_id,
            "game_type": self.game_type.value,
            "status": self.status.value,
            "players": {
                str(slot): {
                    "user_id": str(player.user_id),
                    "username": player.username,
                    "connected": player.connected,
                }
                for slot, player in self.players.items()
            },
            "ai_difficulty": self.ai_difficulty,
        }
