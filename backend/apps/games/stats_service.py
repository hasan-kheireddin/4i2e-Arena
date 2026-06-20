from __future__ import annotations
import logging
from datetime import timedelta
from typing import Any, Optional
from uuid import UUID
from django.core.cache import cache
from django.db.models import (
    Avg,
    Case,
    Count,
    Exists,
    F,
    FloatField,
    Max,
    Min,
    OuterRef,
    Q,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from apps.games.models import (
    GameMode,
    Match,
    MatchPlayer,
)

logger = logging.getLogger("games.stats")


STATS_CACHE_TTL = 300  # 5 minutes
LEADERBOARD_CACHE_TTL = 600  # 10 minutes
FORFEIT_FINISH_REASONS = ["forfeit", "disconnect_forfeit"]


def _user_stats_key(
    user_id: UUID | int,
    game_type: Optional[str] = None,
    mode: Optional[str] = None,
) -> str:
    gt_suffix = game_type or "all"
    mode_suffix = mode or "all"
    return f"stats:user:{user_id}:{gt_suffix}:{mode_suffix}"


def _h2h_key(user_id: UUID | int, opponent_id: UUID | int) -> str:
    return f"stats:h2h:{user_id}:vs:{opponent_id}"


def _leaderboard_key(
    game_type: Optional[str],
    period: str,
    limit: int,
) -> str:
    gt = game_type or "all"
    return f"stats:leaderboard:{gt}:{period}:{limit}:wins"


def invalidate_user_stats(user_id: UUID | int) -> None:
    """
    Bust all cached statistics for a user.

    Call this after recording a new match so the next API request
    recomputes fresh numbers.
    """
    keys = [
        _user_stats_key(user_id, game_type, mode)
        for game_type in [None, "pong", "tictactoe"]
        for mode in [None, "pvp", "pva", "local"]
    ]
    cache.delete_many(keys)

    # Also invalidate leaderboards
    for gt in [None, "pong", "tictactoe"]:
        for period in ["all", "daily", "weekly", "monthly"]:
            for limit in range(1, 101):
                cache.delete(_leaderboard_key(gt, period, limit))

    logger.debug("Invalidated stats cache for user %s", user_id)


def invalidate_head_to_head_stats(user_ids: list[UUID | int]) -> None:
    """Bust cached H2H statistics for every ordered pair in ``user_ids``."""
    unique_ids = list(dict.fromkeys(user_ids))
    if len(unique_ids) < 2:
        return

    keys = [
        _h2h_key(user_id, opponent_id)
        for user_id in unique_ids
        for opponent_id in unique_ids
        if user_id != opponent_id
    ]
    cache.delete_many(keys)
    logger.debug("Invalidated H2H stats cache for users %s", unique_ids)


def invalidate_match_stats(user_ids: list[UUID | int]) -> None:
    """Bust all stats caches affected by a match involving ``user_ids``."""
    unique_ids = list(dict.fromkeys(user_ids))
    for user_id in unique_ids:
        invalidate_user_stats(user_id)
    invalidate_head_to_head_stats(unique_ids)


def get_user_stats(
    user_id: UUID | int,
    game_type: Optional[str] = None,
    mode: Optional[str] = None,
) -> dict[str, Any]:
    """
    Return comprehensive statistics for a user.

    Results are cached for ``STATS_CACHE_TTL`` seconds.

    Parameters
    ----------
    user_id : UUID | int
        The user's primary key.
    game_type : str | None
        Optional filter: ``"pong"`` or ``"tictactoe"``.
        If ``None``, stats cover all game types.
    """
    cache_key = _user_stats_key(user_id, game_type, mode)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    stats = _compute_user_stats(user_id, game_type, mode)
    cache.set(cache_key, stats, STATS_CACHE_TTL)
    return stats


def _apply_mode_filter(base_qs, user_id: UUID | int, mode: Optional[str]):
    if mode == "local":
        return base_qs.filter(
            match__game_session_id__startswith="local-",
        ).filter(
            Q(match__ai_difficulty="") | Q(match__ai_difficulty__isnull=True),
        )

    if mode == "pvp":
        opponent_exists = MatchPlayer.objects.filter(
            match_id=OuterRef("match_id"),
        ).exclude(user_id=user_id)
        return base_qs.filter(
            match__game_mode="pvp",
        ).exclude(
            match__game_session_id__startswith="local-",
        ).filter(
            Q(match__ai_difficulty="") | Q(match__ai_difficulty__isnull=True),
            Exists(opponent_exists),
        )

    if mode == "pva":
        return base_qs.filter(
            Q(match__game_mode__in=["pva", "pve"]) | ~Q(match__ai_difficulty=""),
        )

    return base_qs


def _aggregate_overview(base_qs) -> dict[str, Any]:
    return base_qs.aggregate(
        total=Count("id"),
        wins=Count("id", filter=Q(outcome="win")),
        losses=Count("id", filter=Q(outcome="loss")),
        draws=Count("id", filter=Q(outcome="draw")),
        total_xp=Coalesce(Sum("xp_earned"), 0),
        total_score=Coalesce(Sum("score"), 0),
        avg_score=Coalesce(Avg("score"), 0.0, output_field=FloatField()),
        avg_duration=Coalesce(
            Avg("match__duration_seconds"), 0.0, output_field=FloatField()
        ),
        max_score=Coalesce(Max("score"), 0),
        min_duration=Coalesce(
            Min(
                "match__duration_seconds",
                filter=Q(match__duration_seconds__gt=0),
            ),
            0.0,
            output_field=FloatField(),
        ),
        max_duration=Coalesce(
            Max("match__duration_seconds"), 0.0, output_field=FloatField()
        ),
    )


def _recent_outcomes(base_qs, limit: int = 100) -> list[str]:
    return list(
        base_qs.order_by("-match__finished_at")
        .values_list("outcome", flat=True)[:limit]
    )


def _breakdown_for_query(qs) -> dict[str, Any]:
    return qs.aggregate(
        total=Count("id"),
        wins=Count("id", filter=Q(outcome="win")),
        losses=Count("id", filter=Q(outcome="loss")),
        draws=Count("id", filter=Q(outcome="draw")),
    )


def _build_by_game_type(base_qs) -> dict[str, Any]:
    by_game_type: dict[str, Any] = {}
    for gt in ["pong", "tictactoe"]:
        gt_agg = base_qs.filter(match__game_type=gt).aggregate(
            total=Count("id"),
            wins=Count("id", filter=Q(outcome="win")),
            losses=Count("id", filter=Q(outcome="loss")),
            draws=Count("id", filter=Q(outcome="draw")),
            avg_score=Coalesce(Avg("score"), 0.0, output_field=FloatField()),
            avg_duration=Coalesce(
                Avg("match__duration_seconds"), 0.0, output_field=FloatField()
            ),
        )
        if gt_agg["total"] <= 0:
            continue

        gt_total = gt_agg["total"]
        by_game_type[gt] = {
            **gt_agg,
            "win_rate": round(gt_agg["wins"] / gt_total, 4),
            "avg_score": round(gt_agg["avg_score"], 2),
            "avg_duration": round(gt_agg["avg_duration"], 2),
        }
    return by_game_type


def _build_by_game_mode(base_qs) -> dict[str, Any]:
    by_game_mode: dict[str, Any] = {}
    mode_filters = (
        ("pvp", Q(match__game_mode="pvp")),
        ("pva", Q(match__game_mode__in=["pva", "pve"])),
    )
    for mode_name, mode_filter in mode_filters:
        mode_agg = _breakdown_for_query(base_qs.filter(mode_filter))
        if mode_agg["total"] <= 0:
            continue

        mode_total = mode_agg["total"]
        by_game_mode[mode_name] = {
            **mode_agg,
            "win_rate": round(mode_agg["wins"] / mode_total, 4),
        }
    return by_game_mode


def _build_finish_reason_breakdown(base_qs) -> dict[str, int]:
    finish_reasons: dict[str, int] = {}
    rows = (
        base_qs.values("match__finish_reason")
        .annotate(count=Count("id"))
        .order_by("-count")
    )
    for row in rows:
        finish_reasons[row["match__finish_reason"]] = row["count"]
    return finish_reasons


def _build_performance_trend(base_qs) -> list[dict[str, Any]]:
    thirty_days_ago = timezone.now() - timedelta(days=30)
    daily_qs = (
        base_qs.filter(match__finished_at__gte=thirty_days_ago)
        .annotate(day=TruncDate("match__finished_at"))
        .values("day")
        .annotate(
            matches=Count("id"),
            wins=Count("id", filter=Q(outcome="win")),
            losses=Count("id", filter=Q(outcome="loss")),
            draws=Count("id", filter=Q(outcome="draw")),
            avg_score=Coalesce(Avg("score"), 0.0, output_field=FloatField()),
        )
        .order_by("day")
    )
    return [
        {
            "date": row["day"].isoformat() if row["day"] else None,
            "matches": row["matches"],
            "wins": row["wins"],
            "losses": row["losses"],
            "draws": row["draws"],
            "avg_score": round(row["avg_score"], 2),
        }
        for row in daily_qs
    ]


def _build_overview_payload(overview: dict[str, Any]) -> dict[str, Any]:
    total = overview["total"]
    wins = overview["wins"]
    losses = overview["losses"]
    draws = overview["draws"]
    win_rate = round(wins / total, 4) if total > 0 else 0.0

    return {
        "total_matches": total,
        "wins": wins,
        "losses": losses,
        "draws": draws,
        "win_rate": win_rate,
        "total_xp": overview["total_xp"],
        "total_score": overview["total_score"],
        "avg_score": round(overview["avg_score"], 2),
        "max_score": overview["max_score"],
        "avg_duration": round(overview["avg_duration"], 2),
        "min_duration": round(overview["min_duration"], 2),
        "max_duration": round(overview["max_duration"], 2),
    }


def _compute_user_stats(
    user_id: UUID | int,
    game_type: Optional[str] = None,
    mode: Optional[str] = None,
) -> dict[str, Any]:
    """Heavy lifting — aggregate DB queries for one player."""

    base_qs = MatchPlayer.objects.filter(user_id=user_id).select_related("match")
    if game_type:
        base_qs = base_qs.filter(match__game_type=game_type)
    base_qs = _apply_mode_filter(base_qs, user_id, mode)

    overview = _aggregate_overview(base_qs)
    recent_outcomes = _recent_outcomes(base_qs)
    current_streak = _compute_streak(recent_outcomes)
    longest_win = _longest_win_streak(recent_outcomes)
    longest_loss = _longest_loss_streak(recent_outcomes)
    by_game_type = {} if game_type else _build_by_game_type(base_qs)
    by_game_mode = _build_by_game_mode(base_qs)
    by_finish_reason = _build_finish_reason_breakdown(base_qs)
    performance_trend = _build_performance_trend(base_qs)
    game_specific = _compute_game_specific_stats(base_qs, game_type, user_id)
    recent_form = recent_outcomes[:10]

    return {
        "user_id": str(user_id),
        "game_type_filter": game_type,
        "mode_filter": mode,
        "overview": _build_overview_payload(overview),
        "streaks": {
            "current": current_streak,
            "longest_win": longest_win,
            "longest_loss": longest_loss,
        },
        "by_game_type": by_game_type,
        "by_game_mode": by_game_mode,
        "by_finish_reason": by_finish_reason,
        "performance_trend": performance_trend,
        "game_specific": game_specific,
        "recent_form": recent_form,
    }


def _compute_game_specific_stats(
    base_qs,
    game_type: Optional[str],
    user_id: UUID | int,
) -> dict[str, Any]:
    """
    Compute metrics that are unique to each game.

    - **Pong**: avg/max scores per match, average match duration,
      forfeit rate, score differential.
    - **Tic-Tac-Toe**: average total moves, win-as-X %, win-as-O %,
      draw rate, perfect games (win in 5 moves).
    """
    result: dict[str, Any] = {}

    # Determine which game types to compute
    types_to_process = [game_type] if game_type else ["pong", "tictactoe"]

    for gt in types_to_process:
        gt_qs = base_qs.filter(match__game_type=gt)
        gt_count = gt_qs.count()
        if gt_count == 0:
            continue

        if gt == "pong":
            result["pong"] = _pong_specific_stats(gt_qs, gt_count, user_id)
        elif gt == "tictactoe":
            result["tictactoe"] = _tictactoe_specific_stats(gt_qs, gt_count, user_id)

    return result


def _limited_match_ids(qs, limit: int = 200) -> list[Any]:
    return list(qs.values_list("match_id", flat=True)[:limit])


def _count_forfeit_results(qs) -> tuple[int, int]:
    wins = qs.filter(
        outcome="win",
        match__finish_reason__in=FORFEIT_FINISH_REASONS,
    ).count()
    losses = qs.filter(
        outcome="loss",
        match__finish_reason__in=FORFEIT_FINISH_REASONS,
    ).count()
    return wins, losses


def _score_map_for_matches(qs, match_ids: list[Any]) -> dict[Any, int]:
    return dict(
        qs.filter(match_id__in=match_ids).values_list("match_id", "score")
    )


def _opponent_score_map(match_ids: list[Any], user_id: UUID | int) -> dict[Any, int]:
    return dict(
        MatchPlayer.objects.filter(
            match_id__in=match_ids,
        ).exclude(
            user_id=user_id,
        ).values_list("match_id", "score")
    )


def _average_score_differential(
    match_ids: list[Any],
    my_scores: dict[Any, int],
    opp_scores: dict[Any, int],
) -> float:
    if not match_ids:
        return 0.0

    score_diffs = [
        my_scores.get(match_id, 0) - opp_scores.get(match_id, 0)
        for match_id in match_ids
    ]
    return round(sum(score_diffs) / len(score_diffs), 2) if score_diffs else 0.0


def _count_pong_shutout_wins(qs, match_ids: list[Any], opp_scores: dict[Any, int]) -> int:
    winning_match_ids = set(
        qs.filter(
            match_id__in=match_ids,
            outcome="win",
        ).values_list("match_id", flat=True)
    )
    return sum(1 for match_id in winning_match_ids if opp_scores.get(match_id) == 0)


def _pong_specific_stats(
    qs,
    total: int,
    user_id: UUID | int,
) -> dict[str, Any]:
    """Pong-specific aggregations."""
    agg = qs.aggregate(
        avg_score=Coalesce(Avg("score"), 0.0, output_field=FloatField()),
        max_score=Coalesce(Max("score"), 0),
        total_score=Coalesce(Sum("score"), 0),
        avg_duration=Coalesce(
            Avg("match__duration_seconds"), 0.0, output_field=FloatField()
        ),
        max_duration=Coalesce(
            Max("match__duration_seconds"), 0.0, output_field=FloatField()
        ),
    )

    match_ids = _limited_match_ids(qs)
    my_scores = _score_map_for_matches(qs, match_ids)
    opp_scores = _opponent_score_map(match_ids, user_id)
    avg_score_diff = _average_score_differential(match_ids, my_scores, opp_scores)
    forfeit_wins, forfeit_losses = _count_forfeit_results(qs)
    shutout_wins = _count_pong_shutout_wins(qs, match_ids, opp_scores)

    return {
        "avg_score_per_match": round(agg["avg_score"], 2),
        "max_score_in_match": agg["max_score"],
        "total_points_scored": agg["total_score"],
        "avg_duration_seconds": round(agg["avg_duration"], 2),
        "max_duration_seconds": round(agg["max_duration"], 2),
        "avg_score_differential": avg_score_diff,
        "forfeit_wins": forfeit_wins,
        "forfeit_losses": forfeit_losses,
        "shutout_wins": shutout_wins,
    }


def _metadata_total_moves(meta: Any) -> Optional[int]:
    if not isinstance(meta, dict):
        return None
    if "total_moves" not in meta:
        return None
    return meta["total_moves"]


def _metadata_for_matches(match_ids: list[Any]):
    return Match.objects.filter(id__in=match_ids).values_list("metadata", flat=True)


def _average_total_moves(match_ids: list[Any]) -> float:
    if not match_ids:
        return 0.0

    total_moves = []
    for meta in _metadata_for_matches(match_ids):
        moves = _metadata_total_moves(meta)
        if moves is not None:
            total_moves.append(moves)

    if not total_moves:
        return 0.0
    return round(sum(total_moves) / len(total_moves), 2)


def _count_perfect_tictactoe_wins(match_ids: list[Any], user_id: UUID | int) -> int:
    if not match_ids:
        return 0

    perfect_wins = 0
    winner_metadata = Match.objects.filter(
        id__in=match_ids,
        winner_id=user_id,
    ).values_list("metadata", flat=True)
    for meta in winner_metadata:
        moves = _metadata_total_moves(meta)
        if moves is not None and moves <= 5:
            perfect_wins += 1
    return perfect_wins


def _tictactoe_specific_stats(
    qs,
    total: int,
    user_id: UUID | int,
) -> dict[str, Any]:
    """Tic-Tac-Toe-specific aggregations."""

    draws_count = qs.filter(outcome="draw").count()
    draw_rate = round(draws_count / total, 4) if total > 0 else 0.0

    # Wins/losses by slot (slot 1 = X, slot 2 = O)
    wins_as_x = qs.filter(outcome="win", slot=1).count()
    wins_as_o = qs.filter(outcome="win", slot=2).count()
    games_as_x = qs.filter(slot=1).count()
    games_as_o = qs.filter(slot=2).count()

    match_ids = _limited_match_ids(qs)
    avg_moves = _average_total_moves(match_ids)
    perfect_wins = _count_perfect_tictactoe_wins(match_ids, user_id)
    forfeit_wins, forfeit_losses = _count_forfeit_results(qs)

    return {
        "draw_rate": draw_rate,
        "wins_as_x": wins_as_x,
        "wins_as_o": wins_as_o,
        "games_as_x": games_as_x,
        "games_as_o": games_as_o,
        "win_rate_as_x": round(wins_as_x / games_as_x, 4) if games_as_x else 0.0,
        "win_rate_as_o": round(wins_as_o / games_as_o, 4) if games_as_o else 0.0,
        "avg_total_moves": avg_moves,
        "perfect_wins": perfect_wins,
        "forfeit_wins": forfeit_wins,
        "forfeit_losses": forfeit_losses,
    }


def get_head_to_head(
    user_id: UUID | int,
    opponent_id: UUID | int,
) -> dict[str, Any]:
    """
    Compute head-to-head statistics between two players.

    Cached for ``STATS_CACHE_TTL`` seconds.
    """
    cache_key = _h2h_key(user_id, opponent_id)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    result = _compute_head_to_head(user_id, opponent_id)
    cache.set(cache_key, result, STATS_CACHE_TTL)
    return result


def _compute_head_to_head(
    user_id: UUID | int,
    opponent_id: UUID | int,
) -> dict[str, Any]:
    """Aggregate stats for matches where both players participated."""

    # Find matches where both users played
    shared_match_ids = list(
        MatchPlayer.objects.filter(user_id=user_id)
        .values_list("match_id", flat=True)
        .intersection(
            MatchPlayer.objects.filter(user_id=opponent_id)
            .values_list("match_id", flat=True)
        )
    )

    if not shared_match_ids:
        return {
            "user_id": str(user_id),
            "opponent_id": str(opponent_id),
            "total_matches": 0,
            "user_wins": 0,
            "opponent_wins": 0,
            "draws": 0,
            "matches": [],
        }

    user_parts = MatchPlayer.objects.filter(
        user_id=user_id,
        match_id__in=shared_match_ids,
    ).select_related("match")

    user_wins = user_parts.filter(outcome="win").count()
    opponent_wins = user_parts.filter(outcome="loss").count()
    h2h_draws = user_parts.filter(outcome="draw").count()
    total = user_parts.count()

    # By game type
    by_game_type = {}
    for gt in ["pong", "tictactoe"]:
        gt_qs = user_parts.filter(match__game_type=gt)
        gt_total = gt_qs.count()
        if gt_total > 0:
            by_game_type[gt] = {
                "total": gt_total,
                "user_wins": gt_qs.filter(outcome="win").count(),
                "opponent_wins": gt_qs.filter(outcome="loss").count(),
                "draws": gt_qs.filter(outcome="draw").count(),
            }

    # Score aggregation
    agg = user_parts.aggregate(
        user_total_score=Coalesce(Sum("score"), 0),
        user_avg_score=Coalesce(Avg("score"), 0.0, output_field=FloatField()),
    )
    opp_agg = MatchPlayer.objects.filter(
        user_id=opponent_id,
        match_id__in=shared_match_ids,
    ).aggregate(
        opp_total_score=Coalesce(Sum("score"), 0),
        opp_avg_score=Coalesce(Avg("score"), 0.0, output_field=FloatField()),
    )

    # Recent matches (last 10)
    recent = (
        user_parts.order_by("-match__finished_at")
        .values(
            match_uuid=F("match__id"),
            game_type=F("match__game_type"),
            finished_at=F("match__finished_at"),
            user_outcome=F("outcome"),
            user_score=F("score"),
        )[:10]
    )

    return {
        "user_id": str(user_id),
        "opponent_id": str(opponent_id),
        "total_matches": total,
        "user_wins": user_wins,
        "opponent_wins": opponent_wins,
        "draws": h2h_draws,
        "user_win_rate": round(user_wins / total, 4) if total > 0 else 0.0,
        "by_game_type": by_game_type,
        "scores": {
            "user_total": agg["user_total_score"],
            "user_avg": round(agg["user_avg_score"], 2),
            "opponent_total": opp_agg["opp_total_score"],
            "opponent_avg": round(opp_agg["opp_avg_score"], 2),
        },
        "recent_matches": [
            {
                "match_id": str(r["match_uuid"]),
                "game_type": r["game_type"],
                "finished_at": (
                    r["finished_at"].isoformat() if r["finished_at"] else None
                ),
                "outcome": r["user_outcome"],
                "score": r["user_score"],
            }
            for r in recent
        ],
    }


def get_leaderboard(
    game_type: Optional[str] = None,
    period: str = "all",
    limit: int = 50,
) -> list[dict[str, Any]]:
    """
    Return a ranked leaderboard.

    Parameters
    ----------
    game_type : str | None
        ``"pong"``, ``"tictactoe"``, or ``None`` for all.
    period : str
        Time window: ``"all"``, ``"daily"``, ``"weekly"``, ``"monthly"``.
    limit : int
        Maximum entries returned (default 50).
    """
    cache_key = _leaderboard_key(game_type, period, limit)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    result = _compute_leaderboard(game_type, period, limit)
    cache.set(cache_key, result, LEADERBOARD_CACHE_TTL)
    return result


def _compute_leaderboard(
    game_type: Optional[str],
    period: str,
    limit: int,
) -> list[dict[str, Any]]:
    """Build a ranked player list from MatchPlayer aggregations."""

    # Include only online sessions (exclude locally recorded matches).
    base_qs = MatchPlayer.objects.exclude(
        match__game_session_id__startswith="local-",
    )
    if game_type:
        base_qs = base_qs.filter(match__game_type=game_type)

    # Only consider PvP matches for fairness
    base_qs = base_qs.filter(match__game_mode=GameMode.PVP)

    now = timezone.now()
    if period == "daily":
        base_qs = base_qs.filter(match__finished_at__gte=now - timedelta(days=1))
    elif period == "weekly":
        base_qs = base_qs.filter(match__finished_at__gte=now - timedelta(days=7))
    elif period == "monthly":
        base_qs = base_qs.filter(match__finished_at__gte=now - timedelta(days=30))

    player_stats = (
        base_qs.values("user_id", "user__username", "user__display_name")
        .annotate(
            total=Count("id"),
            wins=Count("id", filter=Q(outcome="win")),
            losses=Count("id", filter=Q(outcome="loss")),
            draws=Count("id", filter=Q(outcome="draw")),
            total_xp=Coalesce(Sum("xp_earned"), 0),
            avg_score=Coalesce(Avg("score"), 0.0, output_field=FloatField()),
        )
    )

    # Add computed win_rate
    player_stats = player_stats.annotate(
        win_rate=Case(
            When(total__gt=0, then=F("wins") * 1.0 / F("total")),
            default=Value(0.0),
            output_field=FloatField(),
        )
    )

    # Leaderboard is win-based only.
    player_stats = player_stats.order_by("-wins", "-total_xp", "-total")[:limit]

    return [
        {
            "rank": idx + 1,
            "user_id": str(row["user_id"]),
            "username": row["user__username"],
            "display_name": row["user__display_name"],
            "total_matches": row["total"],
            "wins": row["wins"],
            "losses": row["losses"],
            "draws": row["draws"],
            "win_rate": round(row["win_rate"], 4),
            "total_xp": row["total_xp"],
            "avg_score": round(row["avg_score"], 2),
        }
        for idx, row in enumerate(player_stats)
    ]


def _compute_streak(outcomes: list[str]) -> dict[str, str | int]:
    """Current streak from most-recent-first outcome list."""
    if not outcomes:
        return {"type": "none", "count": 0}
    streak_type = outcomes[0]
    count = 0
    for o in outcomes:
        if o == streak_type:
            count += 1
        else:
            break
    return {"type": streak_type, "count": count}


def _longest_outcome_streak(outcomes: list[str], target: str) -> int:
    best = current = 0
    for outcome in outcomes:
        if outcome == target:
            current += 1
            best = max(best, current)
            continue
        current = 0
    return best


def _longest_win_streak(outcomes: list[str]) -> int:
    """Longest consecutive win run."""
    return _longest_outcome_streak(outcomes, "win")


def _longest_loss_streak(outcomes: list[str]) -> int:
    """Longest consecutive loss run."""
    return _longest_outcome_streak(outcomes, "loss")
