from __future__ import annotations

import logging
from typing import Any

from asgiref.sync import sync_to_async
from channels.layers import get_channel_layer
from django.db import IntegrityError
from django.db.models import F

from apps.analytics.models import Achievement, AchievementProgress, AchievementUnlock
from apps.analytics.tracking_service import track_achievement_unlocked
from apps.analytics.xp_service import award_xp_for_achievement
from apps.games.models import GameMode, MatchPlayer
from apps.games.session import FinishReason, GameSession, GameType
from apps.games.stats_service import get_leaderboard

logger = logging.getLogger("analytics.achievements")


def _slot_lookup(raw: Any, slot: int, default: Any = 0) -> Any:
    if isinstance(raw, dict):
        if slot in raw:
            return raw[slot]
        if str(slot) in raw:
            return raw[str(slot)]
    return default


def _is_online_pvp_session(session: GameSession) -> bool:
    if session.ai is not None:
        return False
    if session.game_id.startswith("local-"):
        return False
    if len(session.players) < 2:
        return False
    return True


async def check_achievements_after_game(session: GameSession) -> None:
    """
    Evaluate and unlock achievements for a completed online PvP match.
    """
    if session.finish_reason in (FinishReason.CANCELED, FinishReason.SERVER_ERROR):
        return
    if not _is_online_pvp_session(session):
        return

    for slot, player_slot in session.players.items():
        user_id = player_slot.user_id
        is_winner = session.winner_id is not None and session.winner_id == user_id

        newly_unlocked = await _evaluate_all_checkers(
            user_id=user_id,
            session=session,
            slot=slot,
            is_winner=is_winner,
        )
        if not newly_unlocked:
            continue

        await _send_unlock_notifications(user_id, newly_unlocked)
        for ach_data in newly_unlocked:
            xp_reward = int(ach_data.get("xp_reward", 0))
            if xp_reward > 0:
                await award_xp_for_achievement(user_id, xp_reward)


async def check_level_achievements(user_id: int, new_level: int) -> None:
    """
    Level achievements are intentionally disabled for the current canvas.
    """
    return


async def _evaluate_all_checkers(
    *,
    user_id: int,
    session: GameSession,
    slot: int,
    is_winner: bool,
) -> list[dict[str, Any]]:
    if session.game_type == GameType.PONG:
        return await _evaluate_pong_achievements(user_id, session, slot, is_winner)
    if session.game_type == GameType.TICTACTOE:
        return await _evaluate_ttt_achievements(user_id, session, slot, is_winner)
    return []


async def _evaluate_pong_achievements(
    user_id: int,
    session: GameSession,
    slot: int,
    is_winner: bool,
) -> list[dict[str, Any]]:
    unlocked: list[dict[str, Any]] = []

    for key in ("pong_first_rally", "pong_veteran", "pong_grinder"):
        ach = await _increment_and_check(user_id, key, game_session_id=session.game_id)
        if ach:
            unlocked.append(ach)

    if is_winner:
        ach = await _increment_and_check(
            user_id,
            "pong_getting_warm",
            game_session_id=session.game_id,
        )
        if ach:
            unlocked.append(ach)

    state = session.engine.get_state()
    stats = state.get("stats", {}) if isinstance(state, dict) else {}
    max_rally = int(stats.get("max_rally_hits", 0)) if isinstance(stats, dict) else 0
    if max_rally >= 20:
        ach = await _set_progress_and_check(
            user_id,
            "pong_rally_master",
            1,
            game_session_id=session.game_id,
        )
        if ach:
            unlocked.append(ach)

    scored_three_fast = bool(_slot_lookup(
        stats.get("player_scored_three_under_ten", {}) if isinstance(stats, dict) else {},
        slot,
        False,
    ))
    if scored_three_fast:
        ach = await _set_progress_and_check(
            user_id,
            "pong_speed_demon",
            1,
            game_session_id=session.game_id,
        )
        if ach:
            unlocked.append(ach)

    max_consecutive_blocks = int(_slot_lookup(
        stats.get("player_max_consecutive_blocks", {}) if isinstance(stats, dict) else {},
        slot,
        0,
    ))
    if max_consecutive_blocks >= 10:
        ach = await _set_progress_and_check(
            user_id,
            "pong_defensive_wall",
            1,
            game_session_id=session.game_id,
        )
        if ach:
            unlocked.append(ach)

    if is_winner:
        my_misses = int(_slot_lookup(
            stats.get("player_misses", {}) if isinstance(stats, dict) else {},
            slot,
            0,
        ))
        max_deficit = int(_slot_lookup(
            stats.get("player_max_deficit", {}) if isinstance(stats, dict) else {},
            slot,
            0,
        ))
        my_score = int(state.get(f"player{slot}", {}).get("score", 0))
        opp_slot = 2 if slot == 1 else 1
        opp_score = int(state.get(f"player{opp_slot}", {}).get("score", 0))
        target_score = int(getattr(session.engine, "win_score", 7))

        if my_misses == 0:
            ach = await _set_progress_and_check(
                user_id,
                "pong_precision_player",
                1,
                game_session_id=session.game_id,
            )
            if ach:
                unlocked.append(ach)

        if max_deficit >= 3:
            ach = await _set_progress_and_check(
                user_id,
                "pong_comeback_king",
                1,
                game_session_id=session.game_id,
            )
            if ach:
                unlocked.append(ach)

        if opp_score == 0 and my_score >= target_score:
            ach = await _set_progress_and_check(
                user_id,
                "pong_dominator",
                1,
                game_session_id=session.game_id,
            )
            if ach:
                unlocked.append(ach)

        streak = await _compute_game_win_streak(user_id, GameType.PONG)
        if streak >= 3:
            ach = await _set_progress_and_check(
                user_id,
                "pong_unstoppable",
                1,
                game_session_id=session.game_id,
            )
            if ach:
                unlocked.append(ach)

    leaderboard_unlocks = await _evaluate_leaderboard_achievements(
        user_id=user_id,
        game_type=GameType.PONG,
        top10_key="pong_champion",
        rank1_key="pong_legend",
        game_session_id=session.game_id,
    )
    unlocked.extend(leaderboard_unlocks)
    return unlocked


async def _evaluate_ttt_achievements(
    user_id: int,
    session: GameSession,
    slot: int,
    is_winner: bool,
) -> list[dict[str, Any]]:
    unlocked: list[dict[str, Any]] = []

    for key in ("ttt_first_move", "ttt_veteran", "ttt_grinder"):
        ach = await _increment_and_check(user_id, key, game_session_id=session.game_id)
        if ach:
            unlocked.append(ach)

    if is_winner:
        ach = await _increment_and_check(
            user_id,
            "ttt_first_victory",
            game_session_id=session.game_id,
        )
        if ach:
            unlocked.append(ach)

    if session.finish_reason == FinishReason.DRAW:
        ach = await _increment_and_check(
            user_id,
            "ttt_draw_master",
            game_session_id=session.game_id,
        )
        if ach:
            unlocked.append(ach)

    state = session.engine.get_state()
    move_count = int(state.get("move_count", 0)) if isinstance(state, dict) else 0
    board = state.get("board", []) if isinstance(state, dict) else []
    stats = state.get("stats", {}) if isinstance(state, dict) else {}

    if is_winner and move_count <= 5:
        ach = await _set_progress_and_check(
            user_id,
            "ttt_quick_thinker",
            1,
            game_session_id=session.game_id,
        )
        if ach:
            unlocked.append(ach)

    blocks_this_match = int(_slot_lookup(
        stats.get("player_block_counts", {}) if isinstance(stats, dict) else {},
        slot,
        0,
    ))
    if blocks_this_match > 0:
        ach = await _increment_by_and_check(
            user_id,
            "ttt_mind_reader",
            blocks_this_match,
            game_session_id=session.game_id,
        )
        if ach:
            unlocked.append(ach)

    if is_winner and isinstance(board, list):
        opponent_mark = "O" if slot == 1 else "X"
        opponent_marks = sum(1 for cell in board if cell == opponent_mark)
        if opponent_marks <= 2:
            ach = await _set_progress_and_check(
                user_id,
                "ttt_perfect_game",
                1,
                game_session_id=session.game_id,
            )
            if ach:
                unlocked.append(ach)

    if is_winner:
        streak = await _compute_game_win_streak(user_id, GameType.TICTACTOE)
        if streak >= 3:
            ach = await _set_progress_and_check(
                user_id,
                "ttt_strategist",
                1,
                game_session_id=session.game_id,
            )
            if ach:
                unlocked.append(ach)
        if streak >= 10:
            ach = await _set_progress_and_check(
                user_id,
                "ttt_unbeatable",
                1,
                game_session_id=session.game_id,
            )
            if ach:
                unlocked.append(ach)

    leaderboard_unlocks = await _evaluate_leaderboard_achievements(
        user_id=user_id,
        game_type=GameType.TICTACTOE,
        top10_key="ttt_champion",
        rank1_key="ttt_legend",
        game_session_id=session.game_id,
    )
    unlocked.extend(leaderboard_unlocks)
    return unlocked


async def _evaluate_leaderboard_achievements(
    *,
    user_id: int,
    game_type: GameType,
    top10_key: str,
    rank1_key: str,
    game_session_id: str,
) -> list[dict[str, Any]]:
    unlocked: list[dict[str, Any]] = []
    in_top_10 = await _is_user_in_top_n(user_id, game_type, 10)
    is_rank_1 = await _is_user_in_top_n(user_id, game_type, 1)

    if in_top_10:
        ach = await _set_progress_and_check(
            user_id,
            top10_key,
            1,
            game_session_id=game_session_id,
        )
        if ach:
            unlocked.append(ach)

    if is_rank_1:
        ach = await _set_progress_and_check(
            user_id,
            rank1_key,
            1,
            game_session_id=game_session_id,
        )
        if ach:
            unlocked.append(ach)

    return unlocked


async def _is_user_in_top_n(user_id: int, game_type: GameType, n: int) -> bool:
    @sync_to_async
    def _do() -> bool:
        rows = get_leaderboard(
            game_type=game_type.value,
            period="all",
            limit=max(1, min(n, 100)),
        )
        target = str(user_id)
        return any(str(row.get("user_id")) == target for row in rows)

    return await _do()


async def _compute_game_win_streak(user_id: int, game_type: GameType) -> int:
    @sync_to_async
    def _do() -> int:
        outcomes = list(
            MatchPlayer.objects.filter(
                user_id=user_id,
                match__game_type=game_type.value,
                match__game_mode=GameMode.PVP,
            )
            .exclude(match__game_session_id__startswith="local-")
            .order_by("-match__finished_at", "-match_id")
            .values_list("outcome", flat=True)[:100]
        )
        streak = 0
        for outcome in outcomes:
            if outcome == "win":
                streak += 1
            else:
                break
        return streak

    return await _do()


async def _increment_and_check(
    user_id: int,
    achievement_key: str,
    *,
    game_session_id: str = "",
) -> dict[str, Any] | None:
    return await _increment_by_and_check(
        user_id,
        achievement_key,
        1,
        game_session_id=game_session_id,
    )


async def _increment_by_and_check(
    user_id: int,
    achievement_key: str,
    increment: int,
    *,
    game_session_id: str = "",
) -> dict[str, Any] | None:
    if increment <= 0:
        return None

    @sync_to_async
    def _do() -> dict[str, Any] | None:
        try:
            achievement = Achievement.objects.get(key=achievement_key)
        except Achievement.DoesNotExist:
            return None

        if AchievementUnlock.objects.filter(
            user_id=user_id,
            achievement=achievement,
        ).exists():
            return None

        progress, _ = AchievementProgress.objects.get_or_create(
            user_id=user_id,
            achievement=achievement,
            defaults={"current": 0},
        )
        progress.current = F("current") + increment
        progress.save(update_fields=["current", "updated_at"])
        progress.refresh_from_db()

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
    @sync_to_async
    def _do() -> dict[str, Any] | None:
        try:
            achievement = Achievement.objects.get(key=achievement_key)
        except Achievement.DoesNotExist:
            return None

        if AchievementUnlock.objects.filter(
            user_id=user_id,
            achievement=achievement,
        ).exists():
            return None

        progress, _ = AchievementProgress.objects.get_or_create(
            user_id=user_id,
            achievement=achievement,
            defaults={"current": 0},
        )
        if value > progress.current:
            progress.current = value
            progress.save(update_fields=["current", "updated_at"])
            progress.refresh_from_db()

        if progress.current >= achievement.threshold:
            return _create_unlock(user_id, achievement, game_session_id)
        return None

    return await _do()


def _create_unlock(
    user_id: int,
    achievement: Achievement,
    game_session_id: str = "",
) -> dict[str, Any] | None:
    try:
        unlock = AchievementUnlock.objects.create(
            user_id=user_id,
            achievement=achievement,
            game_session_id=game_session_id,
        )
    except IntegrityError:
        return None

    logger.info(
        "Achievement unlocked: user=%s achievement=%s",
        user_id,
        achievement.key,
    )
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
    channel_layer = get_channel_layer()
    if channel_layer is None:
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
