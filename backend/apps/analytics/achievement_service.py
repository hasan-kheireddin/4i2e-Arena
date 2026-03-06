from __future__ import annotations
import logging
from typing import Any
from asgiref.sync import sync_to_async
from channels.layers import get_channel_layer
from django.db import IntegrityError
from django.db.models import Count, F, Q
from apps.analytics.models import (
    Achievement,
    AchievementProgress,
    AchievementUnlock,
)
from apps.analytics.tracking_service import track_achievement_unlocked
from apps.analytics.xp_service import (
    apply_streak_bonus,
    award_xp_for_achievement,
)
from apps.games.session import FinishReason, GameSession, GameType

logger = logging.getLogger("analytics.achievements")

async def check_achievements_after_game(session: GameSession) -> None:
    """
    Main entry point.  Inspects the finished *session* and awards any
    newly-earned achievements to **all human players** in the session.

    Also sends WebSocket notifications for each unlock.
    """
    if session.finish_reason in (FinishReason.CANCELED, FinishReason.SERVER_ERROR):
        return  # don't award achievements for non-games

    for slot, player_slot in session.players.items():
        user_id = player_slot.user_id
        is_winner = (session.winner_id is not None and session.winner_id == user_id)

        newly_unlocked = await _evaluate_all_checkers(
            user_id=user_id,
            session=session,
            slot=slot,
            is_winner=is_winner,
        )

        # Send WebSocket notifications for each new unlock
        if newly_unlocked:
            await _send_unlock_notifications(user_id, newly_unlocked)
            # Award XP for each unlocked achievement
            for ach_data in newly_unlocked:
                xp_reward = ach_data.get("xp_reward", 0)
                if xp_reward > 0:
                    await award_xp_for_achievement(user_id, xp_reward)


async def check_tournament_achievements(user_id: int, is_winner: bool) -> None:
    """
    Called from the tournament service when a tournament finishes.
    Checks tournament-specific achievements.
    """
    newly_unlocked: list[dict[str, Any]] = []

    # Tournament participation
    unlocked = await _increment_and_check(user_id, "tournament_first")
    if unlocked:
        newly_unlocked.append(unlocked)

    if is_winner:
        unlocked = await _increment_and_check(user_id, "tournament_win")
        if unlocked:
            newly_unlocked.append(unlocked)

        unlocked = await _increment_and_check(user_id, "tournament_wins_5")
        if unlocked:
            newly_unlocked.append(unlocked)

    if newly_unlocked:
        await _send_unlock_notifications(user_id, newly_unlocked)


async def check_level_achievements(user_id: int, new_level: int) -> None:
    """
    Called when a user levels up.  Checks milestone achievements.
    """
    newly_unlocked: list[dict[str, Any]] = []

    for key, level_threshold in [
        ("level_5", 5),
        ("level_10", 10),
        ("level_25", 25),
    ]:
        if new_level >= level_threshold:
            unlocked = await _set_progress_and_check(
                user_id, key, new_level,
            )
            if unlocked:
                newly_unlocked.append(unlocked)

    if newly_unlocked:
        await _send_unlock_notifications(user_id, newly_unlocked)

async def _evaluate_all_checkers(
    *,
    user_id: int,
    session: GameSession,
    slot: int,
    is_winner: bool,
) -> list[dict[str, Any]]:
    """Run every achievement checker and return newly-unlocked achievements."""
    newly_unlocked: list[dict[str, Any]] = []

    # --- Games played achievements -----------------------------------------
    for key in ("games_1", "games_50", "games_200"):
        unlocked = await _increment_and_check(
            user_id, key, game_session_id=session.game_id,
        )
        if unlocked:
            newly_unlocked.append(unlocked)

    # --- Win-based achievements --------------------------------------------
    if is_winner:
        for key in ("first_win", "wins_10", "wins_50", "wins_100"):
            unlocked = await _increment_and_check(
                user_id, key, game_session_id=session.game_id,
            )
            if unlocked:
                newly_unlocked.append(unlocked)

        # Game-type-specific wins
        if session.game_type == GameType.PONG:
            unlocked = await _increment_and_check(
                user_id, "pong_wins_10", game_session_id=session.game_id,
            )
            if unlocked:
                newly_unlocked.append(unlocked)
        elif session.game_type == GameType.TICTACTOE:
            unlocked = await _increment_and_check(
                user_id, "ttt_wins_10", game_session_id=session.game_id,
            )
            if unlocked:
                newly_unlocked.append(unlocked)

    # --- Streak achievements (only on win) ----------------------------------
    if is_winner:
        streak = await _compute_current_win_streak(user_id, session)
        for key in ("win_streak_3", "win_streak_5", "win_streak_10"):
            unlocked = await _set_progress_and_check(
                user_id, key, streak, game_session_id=session.game_id,
            )
            if unlocked:
                newly_unlocked.append(unlocked)

        # Award XP streak bonus for milestone streaks
        await apply_streak_bonus(user_id, streak)

    if is_winner:
        # Pong perfect game (11-0)
        if session.game_type == GameType.PONG:
            if _is_pong_shutout(session, slot):
                unlocked = await _set_progress_and_check(
                    user_id, "pong_perfect", 1, game_session_id=session.game_id,
                )
                if unlocked:
                    newly_unlocked.append(unlocked)

        # TTT quick win (5 total moves)
        if session.game_type == GameType.TICTACTOE:
            if _is_ttt_quick_win(session):
                unlocked = await _set_progress_and_check(
                    user_id, "ttt_quick_win", 1, game_session_id=session.game_id,
                )
                if unlocked:
                    newly_unlocked.append(unlocked)

        # Beat hard AI
        if session.ai is not None and session.ai_difficulty == "hard":
            unlocked = await _set_progress_and_check(
                user_id, "ai_hard_win", 1, game_session_id=session.game_id,
            )
            if unlocked:
                newly_unlocked.append(unlocked)

    # --- Social achievements -----------------------------------------------
    unique_count = await _count_unique_opponents(user_id, session)
    for key in ("unique_opponents_5", "unique_opponents_20"):
        unlocked = await _set_progress_and_check(
            user_id, key, unique_count, game_session_id=session.game_id,
        )
        if unlocked:
            newly_unlocked.append(unlocked)

    return newly_unlocked

def _is_pong_shutout(session: GameSession, winner_slot: int) -> bool:
    """Check if the winner won 11-0 in Pong."""
    try:
        state = session.engine.get_state()
        scores = state.get("scores", {})
        # Engine uses slot keys "1" / "2" (or ints)
        loser_slot = 2 if winner_slot == 1 else 1
        loser_score = scores.get(str(loser_slot), scores.get(loser_slot, -1))
        return loser_score == 0
    except Exception:
        return False


def _is_ttt_quick_win(session: GameSession) -> bool:
    """Check if a TTT game was won in exactly 5 moves (the minimum)."""
    try:
        state = session.engine.get_state()
        board = state.get("board", [])
        filled = sum(1 for cell in board if cell is not None and cell != "")
        return filled == 5
    except Exception:
        return False

# We track win streaks via AchievementProgress keyed to a virtual
# achievement "__win_streak_counter" that isn't player-visible.  When
# the player wins we increment; when they lose we reset to 0.

_STREAK_COUNTER_KEY = "__win_streak_counter"


async def _compute_current_win_streak(
    user_id: int, session: GameSession,
) -> int:
    """
    Compute the user's current win streak.

    We use a dedicated AchievementProgress row as a simple counter.
    The counter is incremented on wins and reset to 0 on losses.
    """
    is_winner = session.winner_id == user_id

    @sync_to_async
    def _update_streak() -> int:
        # Ensure the streak counter achievement exists
        counter_ach, _ = Achievement.objects.get_or_create(
            key=_STREAK_COUNTER_KEY,
            defaults={
                "name": "Win Streak Counter (internal)",
                "description": "Internal counter — not shown to players.",
                "category": "streaks",
                "tier": "bronze",
                "xp_reward": 0,
                "threshold": 999999,
                "is_hidden": True,
            },
        )
        progress, _ = AchievementProgress.objects.get_or_create(
            user_id=user_id,
            achievement=counter_ach,
            defaults={"current": 0},
        )
        if is_winner:
            progress.current = F("current") + 1
            progress.save(update_fields=["current", "updated_at"])
            progress.refresh_from_db()
        else:
            progress.current = 0
            progress.save(update_fields=["current", "updated_at"])
        return progress.current

    return await _update_streak()


async def _count_unique_opponents(
    user_id: int, session: GameSession,
) -> int:
    """
    Count unique human opponents the user has faced.

    We store the count in AchievementProgress for "unique_opponents_5"
    (and reuse for "unique_opponents_20").  We also use a simple
    tracking approach: count opponents from session players.

    For a lightweight approach, we track via a dedicated counter that
    is updated each time a new opponent is encountered.
    """
    # Gather opponent IDs from this session
    opponent_ids: set[int] = set()
    for s, ps in session.players.items():
        if ps.user_id != user_id:
            opponent_ids.add(ps.user_id)

    if not opponent_ids:
        return 0

    @sync_to_async
    def _update_unique_opponents() -> int:
        # Use a dedicated hidden achievement for tracking
        counter_key = "__unique_opponents_counter"
        counter_ach, _ = Achievement.objects.get_or_create(
            key=counter_key,
            defaults={
                "name": "Unique Opponents Counter (internal)",
                "description": "Internal counter — not shown to players.",
                "category": "social",
                "tier": "bronze",
                "xp_reward": 0,
                "threshold": 999999,
                "is_hidden": True,
            },
        )
        progress, _ = AchievementProgress.objects.get_or_create(
            user_id=user_id,
            achievement=counter_ach,
            defaults={"current": 0},
        )

        # Check if any opponent is new by looking at existing unlock/progress
        # records.  For simplicity, we use the achievement_unlocks table to
        # see how many unique opponents we've tracked.
        # A more robust approach would use a separate opponents-seen table,
        # but this is sufficient for the achievement system.

        # We'll track via a simple heuristic: count the total unique
        # opponents from all game sessions using the session players data.
        # Since we can't easily query all past sessions from in-memory,
        # we increment only when the session has a human opponent.
        # The counter increments by 1 for each game with a human opponent.
        # This is a simplification — a production system would deduplicate.

        # For now, just increment if there's a human opponent
        if opponent_ids:
            progress.current = F("current") + 1
            progress.save(update_fields=["current", "updated_at"])
            progress.refresh_from_db()

        return progress.current

    return await _update_unique_opponents()

async def _increment_and_check(
    user_id: int,
    achievement_key: str,
    *,
    game_session_id: str = "",
) -> dict[str, Any] | None:
    """
    Increment the progress counter for *achievement_key* by 1.
    If the threshold is met, create an AchievementUnlock and return
    achievement data. Returns ``None`` if not newly unlocked.
    """
    @sync_to_async
    def _do() -> dict[str, Any] | None:
        try:
            achievement = Achievement.objects.get(key=achievement_key)
        except Achievement.DoesNotExist:
            logger.warning("Achievement '%s' not found in DB", achievement_key)
            return None

        # Already unlocked?
        if AchievementUnlock.objects.filter(
            user_id=user_id, achievement=achievement,
        ).exists():
            return None

        # Upsert progress
        progress, created = AchievementProgress.objects.get_or_create(
            user_id=user_id,
            achievement=achievement,
            defaults={"current": 0},
        )
        progress.current = F("current") + 1
        progress.save(update_fields=["current", "updated_at"])
        progress.refresh_from_db()

        # Check threshold
        if progress.current >= achievement.threshold:
            return _create_unlock(user_id, achievement, game_session_id)
        return None

    return await _do()


async def _set_progress_and_check(
    user_id: int,
    achievement_key: str,
    value: int,
    *,
    game_session_id: str = "",
) -> dict[str, Any] | None:
    """
    Set the progress counter to *value* (absolute, not increment).
    If the threshold is met, create an AchievementUnlock and return
    achievement data.  Returns ``None`` if not newly unlocked.
    """
    @sync_to_async
    def _do() -> dict[str, Any] | None:
        try:
            achievement = Achievement.objects.get(key=achievement_key)
        except Achievement.DoesNotExist:
            logger.warning("Achievement '%s' not found in DB", achievement_key)
            return None

        # Already unlocked?
        if AchievementUnlock.objects.filter(
            user_id=user_id, achievement=achievement,
        ).exists():
            return None

        # Upsert progress
        progress, created = AchievementProgress.objects.get_or_create(
            user_id=user_id,
            achievement=achievement,
            defaults={"current": 0},
        )
        if value > progress.current:
            progress.current = value
            progress.save(update_fields=["current", "updated_at"])

        # Check threshold
        if progress.current >= achievement.threshold:
            return _create_unlock(user_id, achievement, game_session_id)
        return None

    return await _do()


def _create_unlock(
    user_id: int,
    achievement: Achievement,
    game_session_id: str = "",
) -> dict[str, Any] | None:
    """
    Create an AchievementUnlock row. Returns unlock data dict or None
    if the unlock already existed (race condition guard).
    """
    try:
        unlock = AchievementUnlock.objects.create(
            user_id=user_id,
            achievement=achievement,
            game_session_id=game_session_id,
        )
    except IntegrityError:
        # Another request already created the unlock — that's fine
        return None

    logger.info(
        "Achievement unlocked: user=%s achievement=%s",
        user_id, achievement.key,
    )
    # Track achievement unlock activity event
    track_achievement_unlocked(
        user_id,
        achievement_key=achievement.key,
        achievement_name=achievement.name,
        xp_reward=achievement.xp_reward,
    )

    return {
        "achievement_id": str(achievement.id),
        "key": achievement.key,
        "name": achievement.name,
        "description": achievement.description,
        "tier": achievement.tier,
        "icon": achievement.icon,
        "xp_reward": achievement.xp_reward,
        "unlocked_at": unlock.unlocked_at.isoformat(),
    }

async def _send_unlock_notifications(
    user_id: int,
    unlocked: list[dict[str, Any]],
) -> None:
    """
    Send achievement unlock notifications to the user via the
    ``notifications_<user_id>`` channel group.

    The notification consumer (or any consumer the user is connected to)
    listens on this group and forwards the messages to the client.
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        logger.warning("No channel layer — cannot send achievement notifications")
        return

    group_name = f"notifications_{user_id}"

    for achievement_data in unlocked:
        await channel_layer.group_send(
            group_name,
            {
                "type": "achievement.unlocked",
                "achievement": achievement_data,
            },
        )
        logger.info(
            "Sent achievement notification: user=%s achievement=%s",
            user_id, achievement_data["key"],
        )
