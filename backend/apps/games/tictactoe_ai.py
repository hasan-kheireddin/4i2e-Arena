# =============================================================================
# Games — Tic-Tac-Toe AI
# =============================================================================
# AI opponents for Tic-Tac-Toe with three difficulty levels.
#
# All AI players use the same interface as human players: they produce
# a cell index (0–8) that is fed into the engine via
# ``engine.make_move(slot, cell)``.
#
# Difficulty levels:
#   - Easy (random):          Picks a random empty cell.
#   - Medium (limited minimax): Uses minimax but limited to a shallow
#                               depth, mixing in some random moves.
#   - Hard (full minimax):    Full-depth minimax with board-state
#                             memoization.  Unbeatable — always wins
#                             or draws.
#
# Usage:
#   ai = TicTacToeAI(difficulty="hard", player_slot=2)
#   cell = ai.compute_move(engine)
#   engine.make_move(ai.player_slot, cell)
# =============================================================================

from __future__ import annotations

import enum
import math
import random
from typing import Optional

from apps.games.tictactoe_engine import (
    TOTAL_CELLS,
    WIN_LINES,
    Mark,
    TicTacToeEngine,
)


# ---------------------------------------------------------------------------
# Difficulty
# ---------------------------------------------------------------------------

class AIDifficulty(str, enum.Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


# ---------------------------------------------------------------------------
# Tuning
# ---------------------------------------------------------------------------

# Medium difficulty: probability of making a random move instead of minimax
MEDIUM_RANDOM_CHANCE: float = 0.35

# Medium difficulty: maximum minimax search depth
MEDIUM_MAX_DEPTH: int = 3


# ---------------------------------------------------------------------------
# TicTacToeAI
# ---------------------------------------------------------------------------

class TicTacToeAI:
    """
    AI opponent for Tic-Tac-Toe. Produces a cell index using the same
    interface as human players.

    Parameters
    ----------
    difficulty   : str or AIDifficulty — "easy", "medium", or "hard"
    player_slot  : int — 1 (X) or 2 (O)
    """

    def __init__(
        self,
        difficulty: str = "medium",
        player_slot: int = 2,
    ) -> None:
        if player_slot not in (1, 2):
            raise ValueError(f"player_slot must be 1 or 2, got {player_slot}")
        if isinstance(difficulty, str):
            difficulty = AIDifficulty(difficulty)
        self.difficulty: AIDifficulty = difficulty
        self.player_slot: int = player_slot

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def compute_move(self, engine: TicTacToeEngine) -> Optional[int]:
        """
        Compute the best cell to play.

        Returns a cell index (0–8), or None if no moves are available.
        """
        empty = self._get_empty_cells(engine)
        if not empty:
            return None

        if self.difficulty == AIDifficulty.EASY:
            return self._move_random(empty)
        elif self.difficulty == AIDifficulty.MEDIUM:
            return self._move_medium(engine, empty)
        else:
            return self._move_hard(engine, empty)

    # ------------------------------------------------------------------
    # Easy: random
    # ------------------------------------------------------------------

    def _move_random(self, empty: list[int]) -> int:
        """Pick a random empty cell."""
        return random.choice(empty)

    # ------------------------------------------------------------------
    # Medium: limited minimax with random fallback
    # ------------------------------------------------------------------

    def _move_medium(self, engine: TicTacToeEngine, empty: list[int]) -> int:
        """
        Sometimes plays randomly, sometimes uses shallow minimax.
        This creates an AI that plays decently but makes mistakes.
        """
        # Random move chance
        if random.random() < MEDIUM_RANDOM_CHANCE:
            return self._move_random(empty)

        # Use depth-limited minimax
        my_mark = engine.get_mark_for_slot(self.player_slot)
        opp_mark = Mark.O if my_mark == Mark.X else Mark.X
        board = list(engine.board)  # copy

        best_score = -math.inf
        best_cell = empty[0]

        for cell in empty:
            board[cell] = my_mark
            score = self._minimax(
                board, opp_mark, my_mark, opp_mark,
                depth=0,
                max_depth=MEDIUM_MAX_DEPTH,
                alpha=-math.inf,
                beta=math.inf,
            )
            board[cell] = None

            if score > best_score:
                best_score = score
                best_cell = cell

        return best_cell

    # ------------------------------------------------------------------
    # Hard: full minimax with alpha-beta pruning
    # ------------------------------------------------------------------

    def _move_hard(self, engine: TicTacToeEngine, empty: list[int]) -> int:
        """
        Full-depth minimax with board-state memoization.
        Unbeatable — always achieves the best possible outcome.
        """
        my_mark = engine.get_mark_for_slot(self.player_slot)
        board = list(engine.board)  # copy
        cache: dict[tuple[Optional[Mark], ...], float] = {}

        best_score = -math.inf
        best_cell = empty[0]

        for cell in empty:
            board[cell] = my_mark
            score = self._minimax_memo(board, my_mark, cache)
            board[cell] = None

            if score > best_score:
                best_score = score
                best_cell = cell

        return best_cell

    # ------------------------------------------------------------------
    # Minimax with alpha-beta pruning
    # ------------------------------------------------------------------

    def _minimax(
        self,
        board: list[Optional[Mark]],
        current_mark: Mark,
        ai_mark: Mark,
        opp_mark: Mark,
        *,
        depth: int,
        max_depth: int,
        alpha: float,
        beta: float,
    ) -> float:
        """
        Depth-limited minimax with alpha-beta pruning (used by medium AI).

        Parameters
        ----------
        board         : mutable board copy
        current_mark  : whose turn it is to play
        ai_mark       : the AI's mark (maximising player)
        opp_mark      : the opponent's mark (minimising player)
        depth         : current search depth
        max_depth     : maximum search depth
        alpha, beta   : pruning bounds
        """
        # Terminal checks
        winner = self._check_winner(board)
        if winner is not None:
            if winner == ai_mark:
                return 10 - depth  # prefer faster wins
            else:
                return depth - 10  # prefer slower losses

        empty = [i for i in range(TOTAL_CELLS) if board[i] is None]
        if not empty:
            return 0  # draw
        if depth >= max_depth:
            return self._heuristic(board, ai_mark, opp_mark)

        # Derive maximising from who is playing, not a separate flag
        is_maximising = (current_mark == ai_mark)
        next_mark = opp_mark if is_maximising else ai_mark

        if is_maximising:
            max_eval = -math.inf
            for cell in empty:
                board[cell] = current_mark
                eval_score = self._minimax(
                    board, next_mark, ai_mark, opp_mark,
                    depth=depth + 1,
                    max_depth=max_depth,
                    alpha=alpha,
                    beta=beta,
                )
                board[cell] = None
                max_eval = max(max_eval, eval_score)
                alpha = max(alpha, eval_score)
                if beta <= alpha:
                    break
            return max_eval
        else:
            min_eval = math.inf
            for cell in empty:
                board[cell] = current_mark
                eval_score = self._minimax(
                    board, next_mark, ai_mark, opp_mark,
                    depth=depth + 1,
                    max_depth=max_depth,
                    alpha=alpha,
                    beta=beta,
                )
                board[cell] = None
                min_eval = min(min_eval, eval_score)
                beta = min(beta, eval_score)
                if beta <= alpha:
                    break
            return min_eval

    # ------------------------------------------------------------------
    # Hard AI: full minimax with memoization
    # ------------------------------------------------------------------

    def _minimax_memo(
        self,
        board: list[Optional[Mark]],
        ai_mark: Mark,
        cache: dict[tuple[Optional[Mark], ...], float],
    ) -> float:
        """
        Full-depth minimax with board-state memoization (used by hard AI).

        Derives whose turn it is from the board contents (X count vs O
        count), so the cache key is just ``tuple(board)``.  No alpha-beta
        pruning — the memo table makes it unnecessary for a 9-cell game.
        """
        key = tuple(board)
        if key in cache:
            return cache[key]

        winner = self._check_winner(board)
        if winner is not None:
            empty_count = sum(1 for c in board if c is None)
            if winner == ai_mark:
                result = 1.0 + empty_count   # faster wins score higher
            else:
                result = -(1.0 + empty_count)
            cache[key] = result
            return result

        empty = [i for i in range(TOTAL_CELLS) if board[i] is None]
        if not empty:
            cache[key] = 0.0
            return 0.0

        # Derive current player from piece counts (X always moves first)
        x_count = sum(1 for c in board if c == Mark.X)
        o_count = sum(1 for c in board if c == Mark.O)
        current_mark = Mark.X if x_count <= o_count else Mark.O
        is_maximising = (current_mark == ai_mark)

        if is_maximising:
            best = -math.inf
            for cell in empty:
                board[cell] = current_mark
                score = self._minimax_memo(board, ai_mark, cache)
                board[cell] = None
                best = max(best, score)
        else:
            best = math.inf
            for cell in empty:
                board[cell] = current_mark
                score = self._minimax_memo(board, ai_mark, cache)
                board[cell] = None
                best = min(best, score)

        cache[key] = best
        return best

    # ------------------------------------------------------------------
    # Board evaluation helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _heuristic(
        board: list[Optional[Mark]],
        ai_mark: Mark,
        opp_mark: Mark,
    ) -> float:
        """
        Static evaluation used when the medium AI hits its depth limit.

        Scores each of the 8 win lines:
          +1  for a line open only to the AI  (no opponent marks)
          -1  for a line open only to the opponent  (no AI marks)
          +3  for a line with 2 AI marks and 1 empty  (near-win)
          -3  for a line with 2 opponent marks and 1 empty  (near-loss)
        Lines containing marks from both players are dead and score 0.
        """
        score = 0.0
        for line in WIN_LINES:
            vals = [board[i] for i in line]
            ai_count = vals.count(ai_mark)
            opp_count = vals.count(opp_mark)
            if ai_count > 0 and opp_count > 0:
                continue  # dead line
            if ai_count == 2:
                score += 3
            elif ai_count == 1:
                score += 1
            if opp_count == 2:
                score -= 3
            elif opp_count == 1:
                score -= 1
        return score

    @staticmethod
    def _check_winner(board: list[Optional[Mark]]) -> Optional[Mark]:
        """
        Check if either player has won on the given board.

        Returns the winning Mark, or None.
        """
        for line in WIN_LINES:
            vals = [board[i] for i in line]
            if vals[0] is not None and vals[0] == vals[1] == vals[2]:
                return vals[0]
        return None

    @staticmethod
    def _get_empty_cells(engine: TicTacToeEngine) -> list[int]:
        """Return indices of all empty cells."""
        return [i for i in range(TOTAL_CELLS) if engine.board[i] is None]

    # ------------------------------------------------------------------
    # Convenience
    # ------------------------------------------------------------------

    def reset(self) -> None:
        """Reset AI state (no-op for stateless AI, kept for interface parity)."""
        pass

    def __repr__(self) -> str:
        return (
            f"TicTacToeAI(difficulty={self.difficulty.value}, "
            f"slot={self.player_slot})"
        )
