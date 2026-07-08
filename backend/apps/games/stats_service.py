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
from apps.games.stats_cache import (
    LEADERBOARD_CACHE_TTL,
    STATS_CACHE_TTL,
    h2h_key,
    invalidate_head_to_head_stats,
    invalidate_match_stats,
    invalidate_user_stats,
    leaderboard_key,
    user_stats_key,
)
from apps.games.stats_game_specific import compute_game_specific_stats

logger = logging.getLogger("games.stats")


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
    cache_key = user_stats_key(user_id, game_type, mode)
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
    game_specific = compute_game_specific_stats(base_qs, game_type, user_id)
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


def get_head_to_head(
    user_id: UUID | int,
    opponent_id: UUID | int,
) -> dict[str, Any]:
    """
    Compute head-to-head statistics between two players.

    Cached for ``STATS_CACHE_TTL`` seconds.
    """
    cache_key = h2h_key(user_id, opponent_id)
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
    cache_key = leaderboard_key(game_type, period, limit)
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
