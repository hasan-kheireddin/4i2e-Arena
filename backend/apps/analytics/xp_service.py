from __future__ import annotations
import logging
import math
from typing import Any

from asgiref.sync import sync_to_async
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model
from django.db.models import F

from apps.games.session import FinishReason, GameSession, GameType

logger = logging.getLogger("analytics.xp")

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

# AI game modifier (reduced XP for AI games)
AI_XP_MULTIPLIER: float = 0.5

# Streak bonuses — extra XP on top of the win bonus
STREAK_BONUSES: dict[int, int] = {
    3: 10,   # 3-game streak bonus
    5: 25,   # 5-game streak bonus
    10: 50,  # 10-game streak bonus
}

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

async def award_xp_after_game(session: GameSession) -> None:
    """
    Calculate and award XP to all human players in the finished session.

    Called from game consumers after each match ends.
    """
    if session.finish_reason in (FinishReason.CANCELED, FinishReason.SERVER_ERROR):
        return  # no XP for non-games

    for slot, player_slot in session.players.items():
        user_id = player_slot.user_id
        is_winner = (session.winner_id is not None and session.winner_id == user_id)

        xp_amount, breakdown = _calculate_game_xp(
            session=session,
            slot=slot,
            is_winner=is_winner,
        )

        if xp_amount > 0:
            result = await _apply_xp(user_id, xp_amount)
            if result:
                await _send_xp_notification(
                    user_id=user_id,
                    xp_gained=xp_amount,
                    breakdown=breakdown,
                    new_xp=result["new_xp"],
                    new_level=result["new_level"],
                    old_level=result["old_level"],
                    leveled_up=result["leveled_up"],
                )

                # Check level-based achievements if leveled up
                if result["leveled_up"]:
                    from apps.analytics.achievement_service import (
                        check_level_achievements,
                    )
                    await check_level_achievements(user_id, result["new_level"])


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

        if result["leveled_up"]:
            from apps.analytics.achievement_service import check_level_achievements
            await check_level_achievements(user_id, result["new_level"])


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

    is_ai_game = session.ai is not None
    is_forfeit = session.finish_reason in (
        FinishReason.FORFEIT,
        FinishReason.DISCONNECT_FORFEIT,
    )
    is_draw = session.finish_reason == FinishReason.DRAW

    # 1) Base XP for participating
    base_xp = XP_GAME_PLAYED
    breakdown["game_played"] = base_xp
    total += base_xp

    # 2) Win / draw bonus
    if is_winner:
        if is_forfeit:
            win_xp = XP_FORFEIT_WIN
            breakdown["forfeit_win"] = win_xp
        else:
            win_xp = XP_WIN_BONUS
            breakdown["win"] = win_xp
        total += win_xp
    elif is_draw:
        breakdown["draw"] = XP_DRAW_BONUS
        total += XP_DRAW_BONUS

    # 3) Score-based XP (Pong)
    if session.game_type == GameType.PONG:
        score = _get_player_score(session, slot)
        if score > 0:
            score_xp = score * XP_PER_POINT
            breakdown["score_points"] = score_xp
            total += score_xp

        # Shutout bonus
        if is_winner and _is_shutout(session, slot):
            breakdown["shutout_bonus"] = XP_SHUTOUT_BONUS
            total += XP_SHUTOUT_BONUS

    # 4) Quick win bonus (TTT)
    if session.game_type == GameType.TICTACTOE and is_winner:
        if _is_quick_win(session):
            breakdown["quick_win_bonus"] = XP_QUICK_WIN_BONUS
            total += XP_QUICK_WIN_BONUS

    # 5) Streak bonus (requires checking current streak)
    # We'll read the streak from the achievement progress counter
    # Note: streak bonuses are applied in the async path, not here
    # (see _add_streak_bonus below)

    # 6) AI game modifier — reduce XP for AI games
    if is_ai_game:
        ai_reduction = total - int(total * AI_XP_MULTIPLIER)
        if ai_reduction > 0:
            breakdown["ai_modifier"] = -ai_reduction
            total = int(total * AI_XP_MULTIPLIER)

    return max(total, 0), breakdown


def _get_player_score(session: GameSession, slot: int) -> int:
    """Extract the player's score from the Pong engine state."""
    try:
        state = session.engine.get_state()
        scores = state.get("scores", {})
        return scores.get(str(slot), scores.get(slot, 0))
    except Exception:
        return 0


def _is_shutout(session: GameSession, winner_slot: int) -> bool:
    """Check if the winner achieved a shutout (opponent scored 0)."""
    try:
        state = session.engine.get_state()
        scores = state.get("scores", {})
        loser_slot = 2 if winner_slot == 1 else 1
        loser_score = scores.get(str(loser_slot), scores.get(loser_slot, -1))
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
            logger.warning("Cannot award XP — user %s not found", user_id)
            return None

        old_level = user.level
        old_xp = user.xp

        # Atomic increment
        User.objects.filter(pk=user_id).update(xp=F("xp") + xp_amount)
        user.refresh_from_db()

        new_xp = user.xp
        new_level = get_level_for_xp(new_xp)

        # Update level if changed
        if new_level != old_level:
            user.level = new_level
            user.save(update_fields=["level"])
            logger.info(
                "User %s leveled up: %d → %d (xp=%d)",
                user_id, old_level, new_level, new_xp,
            )

        return {
            "new_xp": new_xp,
            "old_level": old_level,
            "new_level": new_level,
            "leveled_up": new_level > old_level,
        }

    return await _do()


async def apply_streak_bonus(user_id: int, current_streak: int) -> None:
    """
    Check if the user's current win streak qualifies for an XP bonus
    and award it.  Called after the streak counter is updated.

    Only awards the bonus once per streak milestone (e.g. reaching 5
    awards the 5-streak bonus but not the 3-streak bonus again).
    """
    bonus = STREAK_BONUSES.get(current_streak, 0)
    if bonus <= 0:
        return

    breakdown = {f"streak_{current_streak}_bonus": bonus}
    result = await _apply_xp(user_id, bonus)
    if result:
        await _send_xp_notification(
            user_id=user_id,
            xp_gained=bonus,
            breakdown=breakdown,
            new_xp=result["new_xp"],
            new_level=result["new_level"],
            old_level=result["old_level"],
            leveled_up=result["leveled_up"],
        )


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
        logger.info(
            "Sent level-up notification: user=%s level=%d→%d",
            user_id, old_level, new_level,
        )
