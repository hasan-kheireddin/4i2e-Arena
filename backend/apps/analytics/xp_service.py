from __future__ import annotations
from typing import Any

from asgiref.sync import sync_to_async
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model
from django.db.models import F

from apps.games.session import FinishReason, GameSession, GameType

# Base XP for completing a game (everyone gets this)
XP_GAME_PLAYED: int = 10

# Extra XP for winning
XP_WIN_BONUS: int = 25

# Per-point XP (Pong score-based)
XP_PER_POINT: int = 2

# Forfeit / disconnect: winner gets reduced bonus, loser gets nothing extra
XP_FORFEIT_WIN: int = 15

# Draw (TTT) — both players get a small bonus
XP_DRAW_BONUS: int = 10

# Achievement XP is defined per-achievement in achievement_definitions.py
# and passed via award_xp_for_achievement()

# Shutout bonus (Pong 11-0)
XP_SHUTOUT_BONUS: int = 20

# Quick win bonus (TTT in minimum moves)
XP_QUICK_WIN_BONUS: int = 15

# Uses a quadratic curve: XP_needed(level) = BASE * level^EXPONENT
# Level 1 = 0 XP, Level 2 = 100 XP, Level 3 = 250 XP, etc.
# The curve accelerates so higher levels take progressively more effort.

LEVEL_BASE_XP: int = 100        # XP to reach level 2
LEVEL_EXPONENT: float = 1.5     # growth rate
MAX_LEVEL: int = 100            # hard cap


def get_xp_for_level(level: int) -> int:
    """
    Return the **cumulative** XP required to reach *level*.

    Level 1 requires 0 XP (everyone starts there).
    """
    if level <= 1:
        return 0
    return int(LEVEL_BASE_XP * ((level - 1) ** LEVEL_EXPONENT))


def get_level_for_xp(xp: int) -> int:
    """
    Return the level a user should be at given *xp* total.

    Inverse of ``get_xp_for_level`` — finds the highest level whose
    threshold is <= xp.
    """
    if xp <= 0:
        return 1
    # Solve:  LEVEL_BASE_XP * (level - 1)^EXPONENT <= xp
    #   →  (level - 1) <= (xp / LEVEL_BASE_XP)^(1/EXPONENT)
    level = int((xp / LEVEL_BASE_XP) ** (1 / LEVEL_EXPONENT)) + 1
    # Clamp and verify (floating-point edge cases)
    level = max(1, min(level, MAX_LEVEL))
    # Walk back if we overshot
    while level > 1 and get_xp_for_level(level) > xp:
        level -= 1
    # Walk forward if we can
    while level < MAX_LEVEL and get_xp_for_level(level + 1) <= xp:
        level += 1
    return level


def get_xp_to_next_level(xp: int) -> dict[str, int]:
    """
    Return a dict with current level info.

    Keys: ``level``, ``current_xp``, ``xp_for_current_level``,
    ``xp_for_next_level``, ``xp_in_level``, ``xp_needed``.
    """
    level = get_level_for_xp(xp)
    xp_current_level = get_xp_for_level(level)
    xp_next_level = get_xp_for_level(min(level + 1, MAX_LEVEL))
    xp_in_level = xp - xp_current_level
    xp_needed = xp_next_level - xp_current_level

    return {
        "level": level,
        "current_xp": xp,
        "xp_for_current_level": xp_current_level,
        "xp_for_next_level": xp_next_level,
        "xp_in_level": xp_in_level,
        "xp_needed": xp_needed,
    }


def _is_non_game_session(session: GameSession) -> bool:
    return session.finish_reason in (
        FinishReason.CANCELED,
        FinishReason.SERVER_ERROR,
    )


async def _award_player_game_xp(
    *,
    user_id: Any,
    xp_amount: int,
    breakdown: dict[str, int],
) -> bool:
    if xp_amount <= 0:
        return False

    result = await _apply_xp(user_id, xp_amount)
    if not result:
        return False

    await _send_xp_notification(
        user_id=user_id,
        xp_gained=xp_amount,
        breakdown=breakdown,
        new_xp=result["new_xp"],
        new_level=result["new_level"],
        old_level=result["old_level"],
        leveled_up=result["leveled_up"],
    )
    return True

async def award_xp_after_game(session: GameSession) -> dict[Any, int]:
    """
    Calculate and award XP to all human players in the finished session.

    Called from game consumers after each match ends.
    Returns a map of ``user_id -> xp_awarded`` for this session.
    """
    if _is_non_game_session(session):
        return {}  # no XP for non-games

    awarded_xp: dict[Any, int] = {}

    for slot, player_slot in session.players.items():
        user_id = player_slot.user_id
        is_winner = (session.winner_id is not None and session.winner_id == user_id)
        xp_amount, breakdown = _calculate_game_xp(
            session=session,
            slot=slot,
            is_winner=is_winner,
        )
        awarded_xp[user_id] = xp_amount
        if await _award_player_game_xp(
            user_id=user_id,
            xp_amount=xp_amount,
            breakdown=breakdown,
        ):
            continue
        awarded_xp[user_id] = 0

    return awarded_xp


async def award_xp_for_achievement(user_id: int, xp_reward: int) -> None:
    """
    Award XP when an achievement is unlocked.

    Called from the achievement service.
    """
    if xp_reward <= 0:
        return

    breakdown = {"achievement_reward": xp_reward}
    result = await _apply_xp(user_id, xp_reward)
    if result:
        await _send_xp_notification(
            user_id=user_id,
            xp_gained=xp_reward,
            breakdown=breakdown,
            new_xp=result["new_xp"],
            new_level=result["new_level"],
            old_level=result["old_level"],
            leveled_up=result["leveled_up"],
        )


def _add_breakdown(
    breakdown: dict[str, int],
    key: str,
    value: int,
) -> int:
    breakdown[key] = value
    return value


def _base_game_xp(breakdown: dict[str, int]) -> int:
    return _add_breakdown(breakdown, "game_played", XP_GAME_PLAYED)


def _outcome_xp(
    *,
    is_winner: bool,
    is_forfeit: bool,
    is_draw: bool,
    breakdown: dict[str, int],
) -> int:
    if is_winner:
        key = "forfeit_win" if is_forfeit else "win"
        value = XP_FORFEIT_WIN if is_forfeit else XP_WIN_BONUS
        return _add_breakdown(breakdown, key, value)
    if is_draw:
        return _add_breakdown(breakdown, "draw", XP_DRAW_BONUS)
    return 0


def _pong_score_xp(
    session: GameSession,
    slot: int,
    breakdown: dict[str, int],
) -> int:
    score = _get_player_score(session, slot)
    if score <= 0:
        return 0

    score_xp = score * XP_PER_POINT
    return _add_breakdown(breakdown, "score_points", score_xp)


def _pong_bonus_xp(
    session: GameSession,
    slot: int,
    is_winner: bool,
    breakdown: dict[str, int],
) -> int:
    if not is_winner or not _is_shutout(session, slot):
        return 0
    return _add_breakdown(breakdown, "shutout_bonus", XP_SHUTOUT_BONUS)


def _ttt_bonus_xp(
    session: GameSession,
    is_winner: bool,
    breakdown: dict[str, int],
) -> int:
    if not is_winner or not _is_quick_win(session):
        return 0
    return _add_breakdown(breakdown, "quick_win_bonus", XP_QUICK_WIN_BONUS)


def _game_specific_xp(
    *,
    session: GameSession,
    slot: int,
    is_winner: bool,
    breakdown: dict[str, int],
) -> int:
    if session.game_type == GameType.PONG:
        return _pong_score_xp(session, slot, breakdown) + _pong_bonus_xp(
            session,
            slot,
            is_winner,
            breakdown,
        )
    if session.game_type == GameType.TICTACTOE:
        return _ttt_bonus_xp(session, is_winner, breakdown)
    return 0


def _calculate_game_xp(
    *,
    session: GameSession,
    slot: int,
    is_winner: bool,
) -> tuple[int, dict[str, int]]:
    """
    Calculate XP for a single player based on game outcome.

    Returns (total_xp, breakdown_dict).
    """
    breakdown: dict[str, int] = {}
    total = 0

    is_forfeit = session.finish_reason in (
        FinishReason.FORFEIT,
        FinishReason.DISCONNECT_FORFEIT,
    )
    is_draw = session.finish_reason == FinishReason.DRAW

    total += _base_game_xp(breakdown)
    total += _outcome_xp(
        is_winner=is_winner,
        is_forfeit=is_forfeit,
        is_draw=is_draw,
        breakdown=breakdown,
    )
    total += _game_specific_xp(
        session=session,
        slot=slot,
        is_winner=is_winner,
        breakdown=breakdown,
    )

    # 4) Streak bonus (requires checking current streak)
    # We'll read the streak from the achievement progress counter
    # Note: streak bonuses are applied in the async path, not here
    # (see _add_streak_bonus below)

    return max(total, 0), breakdown


def _get_player_score(session: GameSession, slot: int) -> int:
    """Extract the player's score from the Pong engine state."""
    try:
        state = session.engine.get_state()
        # Pong engine shape: {"player1": {"score": ...}, "player2": {"score": ...}}
        player_key = f"player{slot}"
        if isinstance(state.get(player_key), dict):
            return int(state[player_key].get("score", 0))

        # Fallback for alternate engine payloads that expose "scores".
        scores = state.get("scores", {})
        return int(scores.get(str(slot), scores.get(slot, 0)))
    except Exception:
        return 0


def _is_shutout(session: GameSession, winner_slot: int) -> bool:
    """Check if the winner achieved a shutout (opponent scored 0)."""
    try:
        state = session.engine.get_state()
        loser_slot = 2 if winner_slot == 1 else 1
        loser_key = f"player{loser_slot}"
        if isinstance(state.get(loser_key), dict):
            loser_score = int(state[loser_key].get("score", -1))
            return loser_score == 0

        scores = state.get("scores", {})
        loser_score = int(scores.get(str(loser_slot), scores.get(loser_slot, -1)))
        return loser_score == 0
    except Exception:
        return False


def _is_quick_win(session: GameSession) -> bool:
    """Check if a TTT game was won in the minimum number of moves (5)."""
    try:
        state = session.engine.get_state()
        board = state.get("board", [])
        filled = sum(1 for cell in board if cell is not None and cell != "")
        return filled == 5
    except Exception:
        return False


async def _apply_xp(user_id: int, xp_amount: int) -> dict[str, Any] | None:
    """
    Atomically add *xp_amount* to the user's XP and recalculate level.

    Returns a dict with new_xp, old_level, new_level, leveled_up.
    Returns None if user not found.
    """
    User = get_user_model()

    @sync_to_async
    def _do() -> dict[str, Any] | None:
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None

        old_level = user.level

        # Atomic increment
        User.objects.filter(pk=user_id).update(xp=F("xp") + xp_amount)
        user.refresh_from_db()

        new_xp = user.xp
        new_level = get_level_for_xp(new_xp)

        # Update level if changed
        if new_level != old_level:
            user.level = new_level
            user.save(update_fields=["level"])

        return {
            "new_xp": new_xp,
            "old_level": old_level,
            "new_level": new_level,
            "leveled_up": new_level > old_level,
        }

    return await _do()


async def _send_xp_notification(
    *,
    user_id: int,
    xp_gained: int,
    breakdown: dict[str, int],
    new_xp: int,
    new_level: int,
    old_level: int,
    leveled_up: bool,
) -> None:
    """
    Send XP gain and level-up notifications via the user's
    notification channel group.
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    group_name = f"notifications_{user_id}"
    level_info = get_xp_to_next_level(new_xp)

    # XP gained notification
    await channel_layer.group_send(
        group_name,
        {
            "type": "xp.gained",
            "xp_gained": xp_gained,
            "breakdown": breakdown,
            "new_xp": new_xp,
            "level_info": level_info,
        },
    )

    # Level-up notification (separate event)
    if leveled_up:
        await channel_layer.group_send(
            group_name,
            {
                "type": "level.up",
                "old_level": old_level,
                "new_level": new_level,
                "new_xp": new_xp,
                "level_info": level_info,
            },
        )
