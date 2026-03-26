# =============================================================================
# Games — Tic-Tac-Toe Engine
# =============================================================================
# Server-authoritative Tic-Tac-Toe game engine.
#
# The engine manages board state, turn enforcement, move validation,
# and win/draw detection. All game logic runs server-side — clients
# send move commands and receive the authoritative state.
#
# Board representation:
#   - 3×3 grid stored as a list of 9 cells (row-major order).
#   - Indices:  0 | 1 | 2
#               ---------
#               3 | 4 | 5
#               ---------
#               6 | 7 | 8
#   - Each cell is None (empty), "X", or "O".
#
# Player assignment:
#   - Player 1 is always "X" and moves first.
#   - Player 2 is always "O".
# =============================================================================

from __future__ import annotations

import enum
import time
from typing import Optional


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BOARD_SIZE: int = 3
TOTAL_CELLS: int = BOARD_SIZE * BOARD_SIZE

# All possible winning lines (indices into the flat board)
WIN_LINES: list[tuple[int, int, int]] = [
    # Rows
    (0, 1, 2),
    (3, 4, 5),
    (6, 7, 8),
    # Columns
    (0, 3, 6),
    (1, 4, 7),
    (2, 5, 8),
    # Diagonals
    (0, 4, 8),
    (2, 4, 6),
]


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

class GameStatus(str, enum.Enum):
    WAITING = "waiting"
    PLAYING = "playing"
    FINISHED = "finished"


class Mark(str, enum.Enum):
    X = "X"
    O = "O"


class MoveResult(str, enum.Enum):
    OK = "ok"
    NOT_YOUR_TURN = "not_your_turn"
    CELL_OCCUPIED = "cell_occupied"
    INVALID_CELL = "invalid_cell"
    INVALID_PLAYER = "invalid_player"
    GAME_NOT_PLAYING = "game_not_playing"


# ---------------------------------------------------------------------------
# TicTacToeEngine
# ---------------------------------------------------------------------------

class TicTacToeEngine:
    """
    Server-authoritative Tic-Tac-Toe game engine.

    Usage
    -----
    >>> engine = TicTacToeEngine()
    >>> engine.set_player("alice", 1)
    >>> engine.set_player("bob", 2)
    >>> engine.start()
    >>> result = engine.make_move(1, 4)   # Player 1 (X) plays centre
    >>> result = engine.make_move(2, 0)   # Player 2 (O) plays top-left
    """

    def __init__(self) -> None:
        # Board — flat list of 9 cells, None = empty
        self.board: list[Optional[Mark]] = [None] * TOTAL_CELLS

        # Players
        self.player1_id: Optional[str] = None  # Mark.X
        self.player2_id: Optional[str] = None  # Mark.O

        # Turn tracking — X always goes first
        self.current_turn: Mark = Mark.X
        self.move_count: int = 0

        # Game state
        self.status: GameStatus = GameStatus.WAITING
        self.winner: Optional[Mark] = None  # X, O, or None
        self.is_draw: bool = False
        self.winning_line: Optional[tuple[int, int, int]] = None

        # Timestamps
        self.started_at: Optional[float] = None
        self.finished_at: Optional[float] = None

    # ------------------------------------------------------------------
    # Player management
    # ------------------------------------------------------------------

    def set_player(self, player_id: str, slot: int) -> None:
        """Assign a player id to slot 1 (X) or 2 (O)."""
        if slot == 1:
            self.player1_id = player_id
        elif slot == 2:
            self.player2_id = player_id
        else:
            raise ValueError(f"Invalid slot {slot}. Must be 1 or 2.")

    def get_mark_for_slot(self, slot: int) -> Mark:
        """Return the mark (X or O) for a given slot."""
        if slot == 1:
            return Mark.X
        elif slot == 2:
            return Mark.O
        raise ValueError(f"Invalid slot {slot}. Must be 1 or 2.")

    # ------------------------------------------------------------------
    # Game lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Start the game. Both players must be assigned."""
        if self.status == GameStatus.FINISHED:
            raise RuntimeError("Cannot start a finished game.")
        if self.player1_id is None or self.player2_id is None:
            raise RuntimeError("Both players must be assigned before starting.")
        if self.status == GameStatus.WAITING:
            self.status = GameStatus.PLAYING
            if self.started_at is None:
                self.started_at = time.time()

    def forfeit(self, player_slot: int) -> None:
        """A player forfeits — the other player wins."""
        if self.status == GameStatus.FINISHED:
            return
        if player_slot not in (1, 2):
            raise ValueError(f"Invalid slot {player_slot}. Must be 1 or 2.")
        self.winner = Mark.O if player_slot == 1 else Mark.X
        self.status = GameStatus.FINISHED
        self.finished_at = time.time()

    # ------------------------------------------------------------------
    # Core: make a move
    # ------------------------------------------------------------------

    def make_move(self, player_slot: int, cell: int) -> MoveResult:
        """
        Attempt to place a mark on the board.

        Parameters
        ----------
        player_slot : int — 1 (X) or 2 (O)
        cell        : int — board index 0–8

        Returns
        -------
        MoveResult indicating success or the reason for rejection.
        """
        # Gate: game must be in PLAYING state
        if self.status != GameStatus.PLAYING:
            return MoveResult.GAME_NOT_PLAYING

        # Gate: player_slot must be valid and assigned
        if player_slot not in (1, 2):
            return MoveResult.INVALID_PLAYER
        if (
            (player_slot == 1 and self.player1_id is None)
            or (player_slot == 2 and self.player2_id is None)
        ):
            return MoveResult.INVALID_PLAYER

        # Gate: cell index must be valid
        if not (0 <= cell < TOTAL_CELLS):
            return MoveResult.INVALID_CELL

        # Gate: must be this player's turn
        mark = self.get_mark_for_slot(player_slot)
        if mark != self.current_turn:
            return MoveResult.NOT_YOUR_TURN

        # Gate: cell must be empty
        if self.board[cell] is not None:
            return MoveResult.CELL_OCCUPIED

        # --- Move is valid ---

        # Place the mark
        self.board[cell] = mark
        self.move_count += 1

        # Check for win
        winning = self._check_win(mark)
        if winning is not None:
            self.winner = mark
            self.winning_line = winning
            self.status = GameStatus.FINISHED
            self.finished_at = time.time()
            return MoveResult.OK

        # Check for draw (board full, no winner)
        if self.move_count >= TOTAL_CELLS:
            self.is_draw = True
            self.status = GameStatus.FINISHED
            self.finished_at = time.time()
            return MoveResult.OK

        # Switch turns
        self.current_turn = Mark.O if self.current_turn == Mark.X else Mark.X
        return MoveResult.OK

    # ------------------------------------------------------------------
    # Win detection
    # ------------------------------------------------------------------

    def _check_win(self, mark: Mark) -> Optional[tuple[int, int, int]]:
        """
        Check if the given mark has won.

        Returns the winning line (tuple of 3 indices) or None.
        """
        for line in WIN_LINES:
            if all(self.board[i] == mark for i in line):
                return line
        return None

    # ------------------------------------------------------------------
    # State serialisation
    # ------------------------------------------------------------------

    def get_state(self) -> dict:
        """Return the full game state as a JSON-serialisable dict."""
        # Convert board to 2D for the frontend (matches design spec)
        board_2d: list[list[Optional[str]]] = []
        for row in range(BOARD_SIZE):
            board_2d.append([
                self.board[row * BOARD_SIZE + col].value
                if self.board[row * BOARD_SIZE + col] is not None
                else None
                for col in range(BOARD_SIZE)
            ])

        state: dict = {
            "status": self.status.value,
            "board": board_2d,
            "current_player": self.current_turn.value,
            "move_count": self.move_count,
            "winner": self.winner.value if self.winner else None,
            "is_draw": self.is_draw,
            "player1_id": self.player1_id,
            "player2_id": self.player2_id,
        }

        # Include winning line coordinates if there's a winner
        if self.winning_line is not None:
            start_idx = self.winning_line[0]
            end_idx = self.winning_line[2]
            state["winning_line"] = {
                "start": [start_idx // BOARD_SIZE, start_idx % BOARD_SIZE],
                "end": [end_idx // BOARD_SIZE, end_idx % BOARD_SIZE],
            }

        return state

    # ------------------------------------------------------------------
    # Convenience
    # ------------------------------------------------------------------

    def reset(self) -> None:
        """Reset the engine for a rematch. Clears board and state."""
        self.board = [None] * TOTAL_CELLS
        self.current_turn = Mark.X
        self.move_count = 0
        self.status = GameStatus.WAITING
        self.winner = None
        self.is_draw = False
        self.winning_line = None
        self.started_at = None
        self.finished_at = None

    def get_board_display(self) -> str:
        """Return a human-readable board string (for debugging)."""
        rows = []
        for r in range(BOARD_SIZE):
            cells = []
            for c in range(BOARD_SIZE):
                val = self.board[r * BOARD_SIZE + c]
                cells.append(val.value if val else ".")
            rows.append(" | ".join(cells))
        return "\n---------\n".join(rows)

    @property
    def duration(self) -> Optional[float]:
        """Duration of the game in seconds, or None if not started."""
        if self.started_at is None:
            return None
        end = self.finished_at or time.time()
        return end - self.started_at

    def __repr__(self) -> str:
        winner_str = (
            self.winner.value if self.winner
            else ("draw" if self.is_draw else "none")
        )
        return (
            f"TicTacToeEngine("
            f"status={self.status.value}, "
            f"turn={self.current_turn.value}, "
            f"moves={self.move_count}, "
            f"winner={winner_str})"
        )
