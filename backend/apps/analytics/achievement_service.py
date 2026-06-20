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


def _game_state_dict(session: GameSession) -> dict[str, Any]:
    state = session.engine.get_state()
    return state if isinstance(state, dict) else {}


def _stats_dict(state: dict[str, Any]) -> dict[str, Any]:
    stats = state.get("stats", {})
    return stats if isinstance(stats, dict) else {}


def _append_if_unlocked(
    unlocked: list[dict[str, Any]],
    result: dict[str, Any] | None,
) -> None:
    if result:
        unlocked.append(result)


async def _append_incremented(
    unlocked: list[dict[str, Any]],
    user_id: int,
    achievement_key: str,
    *,
    increment: int = 1,
    game_session_id: str = "",
) -> None:
    result = await _increment_by_and_check(
        user_id,
        achievement_key,
        increment,
        game_session_id=game_session_id,
    )
    _append_if_unlocked(unlocked, result)


async def _append_progressed(
    unlocked: list[dict[str, Any]],
    user_id: int,
    achievement_key: str,
    value: int,
    *,
    game_session_id: str = "",
) -> None:
    result = await _set_progress_and_check(
        user_id,
        achievement_key,
        value,
        game_session_id=game_session_id,
    )
    _append_if_unlocked(unlocked, result)


async def _finalize_unlocked_achievements(
    user_id: int,
    unlocked: list[dict[str, Any]],
) -> None:
    if not unlocked:
        return

    await _send_unlock_notifications(user_id, unlocked)
    for achievement_data in unlocked:
        xp_reward = int(achievement_data.get("xp_reward", 0))
        if xp_reward > 0:
            await award_xp_for_achievement(user_id, xp_reward)


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
        newly_unlocked = await _evaluate_all_checkers(
            user_id=user_id,
            session=session,
            slot=slot,
            is_winner=session.winner_id is not None and session.winner_id == user_id,
        )
        await _finalize_unlocked_achievements(user_id, newly_unlocked)


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
        await _append_incremented(
            unlocked,
            user_id,
            key,
            game_session_id=session.game_id,
        )

    if is_winner:
        await _append_incremented(
            unlocked,
            user_id,
            "pong_getting_warm",
            game_session_id=session.game_id,
        )

    state = _game_state_dict(session)
    stats = _stats_dict(state)
    max_rally = int(stats.get("max_rally_hits", 0))
    if max_rally >= 20:
        await _append_progressed(
            unlocked,
            user_id,
            "pong_rally_master",
            1,
            game_session_id=session.game_id,
        )

    scored_three_fast = bool(_slot_lookup(
        stats.get("player_scored_three_under_ten", {}),
        slot,
        False,
    ))
    if scored_three_fast:
        await _append_progressed(
            unlocked,
            user_id,
            "pong_speed_demon",
            1,
            game_session_id=session.game_id,
        )

    max_consecutive_blocks = int(_slot_lookup(
        stats.get("player_max_consecutive_blocks", {}),
        slot,
        0,
    ))
    if max_consecutive_blocks >= 10:
        await _append_progressed(
            unlocked,
            user_id,
            "pong_defensive_wall",
            1,
            game_session_id=session.game_id,
        )

    if is_winner:
        my_misses = int(_slot_lookup(
            stats.get("player_misses", {}),
            slot,
            0,
        ))
        max_deficit = int(_slot_lookup(
            stats.get("player_max_deficit", {}),
            slot,
            0,
        ))
        my_score = int(state.get(f"player{slot}", {}).get("score", 0))
        opp_slot = 2 if slot == 1 else 1
        opp_score = int(state.get(f"player{opp_slot}", {}).get("score", 0))
        target_score = int(getattr(session.engine, "win_score", 7))

        if my_misses == 0:
            await _append_progressed(
                unlocked,
                user_id,
                "pong_precision_player",
                1,
                game_session_id=session.game_id,
            )

        if max_deficit >= 3:
            await _append_progressed(
                unlocked,
                user_id,
                "pong_comeback_king",
                1,
                game_session_id=session.game_id,
            )

        if opp_score == 0 and my_score >= target_score:
            await _append_progressed(
                unlocked,
                user_id,
                "pong_dominator",
                1,
                game_session_id=session.game_id,
            )

        streak = await _compute_game_win_streak(user_id, GameType.PONG)
        if streak >= 3:
            await _append_progressed(
                unlocked,
                user_id,
                "pong_unstoppable",
                1,
                game_session_id=session.game_id,
            )

    leaderboard_unlocks = await _evaluate_leaderboard_achievements(
        user_id=user_id,
        game_type=GameType.PONG,
        top10_key="pong_champion",
        rank1_key="pong_legend",
        game_session_id=session.game_id,
    )
    unlocked.extend(leaderboard_unlocks)
    return unlocked


def _ttt_match_facts(state: dict[str, Any], slot: int) -> dict[str, Any]:
    board = state.get("board", [])
    stats = _stats_dict(state)
    opponent_mark = "O" if slot == 1 else "X"

    return {
        "move_count": int(state.get("move_count", 0)),
        "board": board if isinstance(board, list) else [],
        "blocks_this_match": int(_slot_lookup(
            stats.get("player_block_counts", {}),
            slot,
            0,
        )),
        "opponent_mark": opponent_mark,
    }


async def _evaluate_ttt_participation_achievements(
    unlocked: list[dict[str, Any]],
    user_id: int,
    game_session_id: str,
) -> None:
    for key in ("ttt_first_move", "ttt_veteran", "ttt_grinder"):
        await _append_incremented(
            unlocked,
            user_id,
            key,
            game_session_id=game_session_id,
        )


async def _evaluate_ttt_outcome_achievements(
    unlocked: list[dict[str, Any]],
    user_id: int,
    session: GameSession,
    is_winner: bool,
    facts: dict[str, Any],
) -> None:
    if is_winner:
        await _append_incremented(
            unlocked,
            user_id,
            "ttt_first_victory",
            game_session_id=session.game_id,
        )

    if session.finish_reason == FinishReason.DRAW:
        await _append_incremented(
            unlocked,
            user_id,
            "ttt_draw_master",
            game_session_id=session.game_id,
        )

    if is_winner and facts["move_count"] <= 5:
        await _append_progressed(
            unlocked,
            user_id,
            "ttt_quick_thinker",
            1,
            game_session_id=session.game_id,
        )

    if facts["blocks_this_match"] > 0:
        await _append_incremented(
            unlocked,
            user_id,
            "ttt_mind_reader",
            increment=facts["blocks_this_match"],
            game_session_id=session.game_id,
        )


async def _evaluate_ttt_perfect_game_achievement(
    unlocked: list[dict[str, Any]],
    user_id: int,
    session: GameSession,
    is_winner: bool,
    facts: dict[str, Any],
) -> None:
    if not is_winner:
        return

    board = facts["board"]
    if not isinstance(board, list):
        return

    opponent_marks = sum(1 for cell in board if cell == facts["opponent_mark"])
    if opponent_marks <= 2:
        await _append_progressed(
            unlocked,
            user_id,
            "ttt_perfect_game",
            1,
            game_session_id=session.game_id,
        )


async def _evaluate_ttt_streak_achievements(
    unlocked: list[dict[str, Any]],
    user_id: int,
    session: GameSession,
    is_winner: bool,
) -> None:
    if not is_winner:
        return

    streak = await _compute_game_win_streak(user_id, GameType.TICTACTOE)
    if streak >= 3:
        await _append_progressed(
            unlocked,
            user_id,
            "ttt_strategist",
            1,
            game_session_id=session.game_id,
        )
    if streak >= 10:
        await _append_progressed(
            unlocked,
            user_id,
            "ttt_unbeatable",
            1,
            game_session_id=session.game_id,
        )


async def _evaluate_ttt_achievements(
    user_id: int,
    session: GameSession,
    slot: int,
    is_winner: bool,
) -> list[dict[str, Any]]:
    unlocked: list[dict[str, Any]] = []
    facts = _ttt_match_facts(_game_state_dict(session), slot)

    await _evaluate_ttt_participation_achievements(
        unlocked,
        user_id,
        session.game_id,
    )
    await _evaluate_ttt_outcome_achievements(
        unlocked,
        user_id,
        session,
        is_winner,
        facts,
    )
    await _evaluate_ttt_perfect_game_achievement(
        unlocked,
        user_id,
        session,
        is_winner,
        facts,
    )
    await _evaluate_ttt_streak_achievements(
        unlocked,
        user_id,
        session,
        is_winner,
    )

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
    for limit, achievement_key in ((10, top10_key), (1, rank1_key)):
        if not await _is_user_in_top_n(user_id, game_type, limit):
            continue

        await _append_progressed(
            unlocked,
            user_id,
            achievement_key,
            1,
            game_session_id=game_session_id,
        )

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
