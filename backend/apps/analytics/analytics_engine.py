from __future__ import annotations
import logging
import math
from collections import defaultdict
from datetime import timedelta
from typing import Any, Optional
from uuid import UUID
from django.core.cache import cache
from django.db.models import (
    Avg,
    Case,
    Count,
    F,
    FloatField,
    Max,
    Min,
    Q,
    Sum,
    Value,
    When,
)
from django.db.models.functions import (
    Coalesce,
    ExtractHour,
    ExtractWeekDay,
    TruncDate,
    TruncWeek,
)
from django.utils import timezone
from apps.analytics.models import ActivityEvent, EventCategory
from apps.games.models import (
    GameType,
    Match,
    MatchOutcome,
    MatchPlayer,
)

logger = logging.getLogger("analytics.engine")

ENGINE_CACHE_TTL = 300  # 5 minutes

def _trend_key(user_id: UUID | int, days: int, game_type: Optional[str]) -> str:
    gt = game_type or "all"
    return f"analytics:trend:{user_id}:{days}:{gt}"


def _perf_trend_key(user_id: UUID | int, days: int, game_type: Optional[str]) -> str:
    gt = game_type or "all"
    return f"analytics:perf_trend:{user_id}:{days}:{gt}"


def _peak_key(user_id: UUID | int) -> str:
    return f"analytics:peak:{user_id}"


def _session_key(user_id: UUID | int, days: int) -> str:
    return f"analytics:sessions:{user_id}:{days}"


def _opponents_key(user_id: UUID | int, limit: int) -> str:
    return f"analytics:opponents:{user_id}:{limit}"


def _rivals_key(user_id: UUID | int, min_matches: int) -> str:
    return f"analytics:rivals:{user_id}:{min_matches}"


def _insights_key(user_id: UUID | int) -> str:
    return f"analytics:insights:{user_id}"


def invalidate_analytics_cache(user_id: UUID | int) -> None:
    """Bust analytics-engine caches for a user."""
    keys = []
    for days in [7, 14, 30, 60, 90]:
        for gt in [None, "pong", "tictactoe"]:
            keys.append(_trend_key(user_id, days, gt))
            keys.append(_perf_trend_key(user_id, days, gt))
        keys.append(_session_key(user_id, days))
    keys.append(_peak_key(user_id))
    keys.append(_insights_key(user_id))
    for limit in [5, 10, 20]:
        keys.append(_opponents_key(user_id, limit))
    for mm in [3, 5]:
        keys.append(_rivals_key(user_id, mm))
    cache.delete_many(keys)


def get_win_rate_trend(
    user_id: UUID | int,
    days: int = 30,
    game_type: Optional[str] = None,
) -> dict[str, Any]:
    """
    Rolling win-rate curve grouped by day.

    Returns daily data points with matches played, wins, cumulative
    win rate, and a rolling 7-day win rate.
    """
    cache_key = _trend_key(user_id, days, game_type)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    result = _compute_win_rate_trend(user_id, days, game_type)
    cache.set(cache_key, result, ENGINE_CACHE_TTL)
    return result


def _compute_win_rate_trend(
    user_id: UUID | int,
    days: int,
    game_type: Optional[str],
) -> dict[str, Any]:
    start = timezone.now() - timedelta(days=days)
    base_qs = MatchPlayer.objects.filter(
        user_id=user_id,
        match__finished_at__gte=start,
    )
    if game_type:
        base_qs = base_qs.filter(match__game_type=game_type)

    daily = list(
        base_qs
        .annotate(day=TruncDate("match__finished_at"))
        .values("day")
        .annotate(
            matches=Count("id"),
            wins=Count("id", filter=Q(outcome="win")),
            losses=Count("id", filter=Q(outcome="loss")),
            draws=Count("id", filter=Q(outcome="draw")),
        )
        .order_by("day")
    )

    # Build cumulative and rolling-7 calculations
    cum_wins = 0
    cum_total = 0
    data_points: list[dict[str, Any]] = []

    for row in daily:
        cum_wins += row["wins"]
        cum_total += row["matches"]
        cum_wr = round(cum_wins / cum_total, 4) if cum_total else 0.0

        # Rolling 7-day window
        window_start = row["day"] - timedelta(days=6)
        r7_qs = base_qs.filter(
            match__finished_at__date__gte=window_start,
            match__finished_at__date__lte=row["day"],
        )
        r7_agg = r7_qs.aggregate(
            total=Count("id"),
            wins=Count("id", filter=Q(outcome="win")),
        )
        r7_total = r7_agg["total"]
        r7_wr = round(r7_agg["wins"] / r7_total, 4) if r7_total else 0.0

        data_points.append({
            "date": row["day"].isoformat(),
            "matches": row["matches"],
            "wins": row["wins"],
            "losses": row["losses"],
            "draws": row["draws"],
            "cumulative_win_rate": cum_wr,
            "rolling_7d_win_rate": r7_wr,
        })

    # Overall period summary
    period_agg = base_qs.aggregate(
        total=Count("id"),
        wins=Count("id", filter=Q(outcome="win")),
    )
    period_total = period_agg["total"]
    period_wr = round(period_agg["wins"] / period_total, 4) if period_total else 0.0

    return {
        "user_id": str(user_id),
        "days": days,
        "game_type": game_type,
        "period_win_rate": period_wr,
        "period_matches": period_total,
        "data_points": data_points,
    }


def get_performance_trend(
    user_id: UUID | int,
    days: int = 30,
    game_type: Optional[str] = None,
) -> dict[str, Any]:
    """
    Composite performance score over time.

    The score is a weighted blend of win rate, average score, and
    average duration efficiency (shorter wins score higher).
    Grouped by week for smoother curves.
    """
    cache_key = _perf_trend_key(user_id, days, game_type)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    result = _compute_performance_trend(user_id, days, game_type)
    cache.set(cache_key, result, ENGINE_CACHE_TTL)
    return result


def _compute_performance_trend(
    user_id: UUID | int,
    days: int,
    game_type: Optional[str],
) -> dict[str, Any]:
    start = timezone.now() - timedelta(days=days)
    base_qs = MatchPlayer.objects.filter(
        user_id=user_id,
        match__finished_at__gte=start,
    )
    if game_type:
        base_qs = base_qs.filter(match__game_type=game_type)

    weekly = list(
        base_qs
        .annotate(week=TruncWeek("match__finished_at"))
        .values("week")
        .annotate(
            matches=Count("id"),
            wins=Count("id", filter=Q(outcome="win")),
            avg_score=Coalesce(Avg("score"), 0.0, output_field=FloatField()),
            avg_duration=Coalesce(
                Avg("match__duration_seconds"), 0.0, output_field=FloatField()
            ),
            total_xp=Coalesce(Sum("xp_earned"), 0),
        )
        .order_by("week")
    )

    data_points: list[dict[str, Any]] = []
    for row in weekly:
        wr = row["wins"] / row["matches"] if row["matches"] else 0.0
        # Composite score: 50% win-rate + 30% normalised avg-score + 20% XP
        # Normalise avg_score assuming max ~11 for pong, ~1 for ttt
        norm_score = min(row["avg_score"] / 11.0, 1.0)
        norm_xp = min(row["total_xp"] / 500.0, 1.0)
        composite = round(wr * 0.50 + norm_score * 0.30 + norm_xp * 0.20, 4)

        data_points.append({
            "week": row["week"].isoformat(),
            "matches": row["matches"],
            "wins": row["wins"],
            "win_rate": round(wr, 4),
            "avg_score": round(row["avg_score"], 2),
            "avg_duration": round(row["avg_duration"], 2),
            "total_xp": row["total_xp"],
            "composite_score": composite,
        })

    return {
        "user_id": str(user_id),
        "days": days,
        "game_type": game_type,
        "data_points": data_points,
    }

def get_peak_hours(user_id: UUID | int) -> dict[str, Any]:
    """
    Analyse when a user is most active (game matches + activity events).

    Returns hourly distribution, peak hour, peak day-of-week, and a
    list of the top-3 busiest (day, hour) slots.
    """
    cache_key = _peak_key(user_id)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    result = _compute_peak_hours(user_id)
    cache.set(cache_key, result, ENGINE_CACHE_TTL)
    return result


def _compute_peak_hours(user_id: UUID | int) -> dict[str, Any]:
    ninety_days_ago = timezone.now() - timedelta(days=90)

    # ---------- hourly distribution (from matches) ----------
    match_qs = MatchPlayer.objects.filter(
        user_id=user_id,
        match__finished_at__gte=ninety_days_ago,
    )
    hourly_matches = dict(
        match_qs
        .annotate(hour=ExtractHour("match__finished_at"))
        .values("hour")
        .annotate(count=Count("id"))
        .values_list("hour", "count")
    )

    # ---------- hourly distribution (from activity events) ----------
    event_qs = ActivityEvent.objects.filter(
        user_id=user_id,
        created_at__gte=ninety_days_ago,
    )
    hourly_events = dict(
        event_qs
        .annotate(hour=ExtractHour("created_at"))
        .values("hour")
        .annotate(count=Count("id"))
        .values_list("hour", "count")
    )

    # Merge both sources
    hourly: list[dict[str, int]] = []
    for h in range(24):
        hourly.append({
            "hour": h,
            "matches": hourly_matches.get(h, 0),
            "events": hourly_events.get(h, 0),
            "total": hourly_matches.get(h, 0) + hourly_events.get(h, 0),
        })

    peak_hour = max(hourly, key=lambda x: x["total"])["hour"] if hourly else None

    # ---------- day-of-week distribution ----------
    DOW_MAP = {2: "Monday", 3: "Tuesday", 4: "Wednesday",
               5: "Thursday", 6: "Friday", 7: "Saturday", 1: "Sunday"}
    ISO_MAP = {2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 1: 6}

    match_dow = {}
    for row in (
        match_qs
        .annotate(dow=ExtractWeekDay("match__finished_at"))
        .values("dow")
        .annotate(count=Count("id"))
    ):
        match_dow[row["dow"]] = row["count"]

    event_dow = {}
    for row in (
        event_qs
        .annotate(dow=ExtractWeekDay("created_at"))
        .values("dow")
        .annotate(count=Count("id"))
    ):
        event_dow[row["dow"]] = row["count"]

    daily: list[dict[str, Any]] = []
    for dj_dow in [2, 3, 4, 5, 6, 7, 1]:  # Mon→Sun
        daily.append({
            "day": ISO_MAP[dj_dow],
            "name": DOW_MAP[dj_dow],
            "matches": match_dow.get(dj_dow, 0),
            "events": event_dow.get(dj_dow, 0),
            "total": match_dow.get(dj_dow, 0) + event_dow.get(dj_dow, 0),
        })

    peak_day = max(daily, key=lambda x: x["total"])["name"] if daily else None

    # ---------- top 3 (day, hour) slots ----------
    slot_counts: dict[tuple[int, int], int] = defaultdict(int)
    for row in (
        match_qs
        .annotate(
            hour=ExtractHour("match__finished_at"),
            dow=ExtractWeekDay("match__finished_at"),
        )
        .values("dow", "hour")
        .annotate(count=Count("id"))
    ):
        slot_counts[(ISO_MAP.get(row["dow"], row["dow"]), row["hour"])] += row["count"]
    for row in (
        event_qs
        .annotate(
            hour=ExtractHour("created_at"),
            dow=ExtractWeekDay("created_at"),
        )
        .values("dow", "hour")
        .annotate(count=Count("id"))
    ):
        slot_counts[(ISO_MAP.get(row["dow"], row["dow"]), row["hour"])] += row["count"]

    top_slots = sorted(slot_counts.items(), key=lambda x: x[1], reverse=True)[:3]
    top_slots_data = [
        {
            "day": DOW_MAP.get(
                {v: k for k, v in ISO_MAP.items()}.get(slot[0], 0),
                "Unknown",
            ),
            "day_index": slot[0],
            "hour": slot[1],
            "count": count,
        }
        for (slot, count) in [((s[0][0], s[0][1]), s[1]) for s in top_slots]
    ]

    return {
        "user_id": str(user_id),
        "hourly_distribution": hourly,
        "peak_hour": peak_hour,
        "daily_distribution": daily,
        "peak_day": peak_day,
        "top_slots": top_slots_data,
    }


def get_session_analysis(
    user_id: UUID | int,
    days: int = 30,
) -> dict[str, Any]:
    """
    Analyse play sessions for a user.

    A "session" is a group of matches that occurred within 30 minutes of
    each other.  Returns total sessions, average session length, average
    matches per session, longest session, etc.
    """
    cache_key = _session_key(user_id, days)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    result = _compute_session_analysis(user_id, days)
    cache.set(cache_key, result, ENGINE_CACHE_TTL)
    return result


SESSION_GAP_MINUTES = 30  # max gap between two matches in the same session


def _compute_session_analysis(
    user_id: UUID | int,
    days: int,
) -> dict[str, Any]:
    start = timezone.now() - timedelta(days=days)

    timestamps = list(
        MatchPlayer.objects.filter(
            user_id=user_id,
            match__finished_at__gte=start,
        )
        .order_by("match__started_at")
        .values_list("match__started_at", "match__finished_at")
    )

    if not timestamps:
        return {
            "user_id": str(user_id),
            "days": days,
            "total_sessions": 0,
            "total_matches": 0,
            "avg_session_duration_minutes": 0.0,
            "avg_matches_per_session": 0.0,
            "longest_session_minutes": 0.0,
            "shortest_session_minutes": 0.0,
            "total_playtime_minutes": 0.0,
            "sessions": [],
        }

    # Group timestamps into sessions
    gap = timedelta(minutes=SESSION_GAP_MINUTES)
    sessions: list[list[tuple]] = []
    current_session: list[tuple] = [timestamps[0]]

    for i in range(1, len(timestamps)):
        prev_end = current_session[-1][1]
        curr_start = timestamps[i][0]
        if curr_start - prev_end <= gap:
            current_session.append(timestamps[i])
        else:
            sessions.append(current_session)
            current_session = [timestamps[i]]
    sessions.append(current_session)

    session_data: list[dict[str, Any]] = []
    durations: list[float] = []
    for s in sessions:
        s_start = s[0][0]
        s_end = s[-1][1]
        dur = (s_end - s_start).total_seconds() / 60.0
        durations.append(dur)
        session_data.append({
            "start": s_start.isoformat(),
            "end": s_end.isoformat(),
            "matches": len(s),
            "duration_minutes": round(dur, 1),
        })

    total_sessions = len(sessions)
    total_matches = len(timestamps)
    avg_dur = sum(durations) / total_sessions if total_sessions else 0.0
    avg_matches = total_matches / total_sessions if total_sessions else 0.0

    return {
        "user_id": str(user_id),
        "days": days,
        "total_sessions": total_sessions,
        "total_matches": total_matches,
        "avg_session_duration_minutes": round(avg_dur, 1),
        "avg_matches_per_session": round(avg_matches, 1),
        "longest_session_minutes": round(max(durations), 1) if durations else 0.0,
        "shortest_session_minutes": round(min(durations), 1) if durations else 0.0,
        "total_playtime_minutes": round(sum(durations), 1),
        "sessions": session_data[-20:],  # last 20 sessions only
    }

def get_opponents_summary(
    user_id: UUID | int,
    limit: int = 10,
) -> dict[str, Any]:
    """
    List the user's most-played opponents with per-opponent breakdown.
    """
    cache_key = _opponents_key(user_id, limit)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    result = _compute_opponents_summary(user_id, limit)
    cache.set(cache_key, result, ENGINE_CACHE_TTL)
    return result


def _compute_opponents_summary(
    user_id: UUID | int,
    limit: int,
) -> dict[str, Any]:
    # PvP / tournament matches where this user participated
    my_match_ids = list(
        MatchPlayer.objects.filter(user_id=user_id)
        .values_list("match_id", flat=True)
    )
    if not my_match_ids:
        return {
            "user_id": str(user_id),
            "total_unique_opponents": 0,
            "opponents": [],
        }

    # Opponents in those matches
    opp_qs = (
        MatchPlayer.objects
        .filter(match_id__in=my_match_ids)
        .exclude(user_id=user_id)
        .values("user_id", "user__username", "user__display_name")
        .annotate(
            matches_played=Count("id"),
        )
        .order_by("-matches_played")
    )

    total_unique = opp_qs.count()
    top_opponents = list(opp_qs[:limit])

    opponents_data: list[dict[str, Any]] = []
    for opp in top_opponents:
        opp_id = opp["user_id"]
        # My results against this opponent
        shared_matches = (
            MatchPlayer.objects.filter(
                match_id__in=my_match_ids,
                user_id=user_id,
            )
            .filter(
                match__players__user_id=opp_id,
            )
        )
        wins = shared_matches.filter(outcome="win").count()
        losses = shared_matches.filter(outcome="loss").count()
        draws = shared_matches.filter(outcome="draw").count()
        total = wins + losses + draws

        # Recent match date
        last_match = (
            shared_matches.order_by("-match__finished_at")
            .values_list("match__finished_at", flat=True)
            .first()
        )

        opponents_data.append({
            "user_id": str(opp_id),
            "username": opp["user__username"],
            "display_name": opp["user__display_name"],
            "matches_played": total,
            "wins": wins,
            "losses": losses,
            "draws": draws,
            "win_rate": round(wins / total, 4) if total else 0.0,
            "last_played": last_match.isoformat() if last_match else None,
        })

    return {
        "user_id": str(user_id),
        "total_unique_opponents": total_unique,
        "opponents": opponents_data,
    }


def get_rivalries(
    user_id: UUID | int,
    min_matches: int = 3,
) -> dict[str, Any]:
    """
    Detect rival relationships — opponents with close win/loss ratios
    and frequent matches.

    A rivalry is scored on:
      - match frequency (more games = stronger rivalry)
      - closeness of win-rate to 50% (closer = more competitive)
      - recency (played in last 30 days = bonus)
    """
    cache_key = _rivals_key(user_id, min_matches)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    result = _compute_rivalries(user_id, min_matches)
    cache.set(cache_key, result, ENGINE_CACHE_TTL)
    return result


def _compute_rivalries(
    user_id: UUID | int,
    min_matches: int,
) -> dict[str, Any]:
    my_match_ids = list(
        MatchPlayer.objects.filter(user_id=user_id)
        .values_list("match_id", flat=True)
    )
    if not my_match_ids:
        return {"user_id": str(user_id), "rivalries": []}

    # Find opponents with enough shared matches
    opp_qs = (
        MatchPlayer.objects
        .filter(match_id__in=my_match_ids)
        .exclude(user_id=user_id)
        .values("user_id", "user__username", "user__display_name")
        .annotate(total=Count("id"))
        .filter(total__gte=min_matches)
        .order_by("-total")
    )

    thirty_days_ago = timezone.now() - timedelta(days=30)
    rivalries: list[dict[str, Any]] = []

    for opp in opp_qs[:20]:  # evaluate up to 20 candidates
        opp_id = opp["user_id"]
        shared = (
            MatchPlayer.objects.filter(
                match_id__in=my_match_ids,
                user_id=user_id,
            )
            .filter(match__players__user_id=opp_id)
        )
        wins = shared.filter(outcome="win").count()
        losses = shared.filter(outcome="loss").count()
        draws = shared.filter(outcome="draw").count()
        total = wins + losses + draws
        if total < min_matches:
            continue

        wr = wins / total if total else 0.5

        # Rivalry score formula
        # - Closeness: 1 - 2*|wr - 0.5|  → 1.0 when perfectly even
        closeness = 1.0 - 2.0 * abs(wr - 0.5)
        # - Frequency bonus: log2(total) / 5, capped at 1
        freq = min(math.log2(max(total, 1)) / 5.0, 1.0)
        # - Recency bonus: 0.2 if played in last 30 days
        recent_match = shared.filter(
            match__finished_at__gte=thirty_days_ago,
        ).exists()
        recency = 0.2 if recent_match else 0.0

        score = round(closeness * 0.5 + freq * 0.3 + recency, 4)

        rivalries.append({
            "opponent_id": str(opp_id),
            "username": opp["user__username"],
            "display_name": opp["user__display_name"],
            "total_matches": total,
            "wins": wins,
            "losses": losses,
            "draws": draws,
            "win_rate": round(wr, 4),
            "closeness": round(closeness, 4),
            "rivalry_score": score,
            "recently_active": recent_match,
        })

    # Sort by rivalry score descending
    rivalries.sort(key=lambda r: r["rivalry_score"], reverse=True)

    return {
        "user_id": str(user_id),
        "rivalries": rivalries,
    }

def get_performance_insights(user_id: UUID | int) -> dict[str, Any]:
    """
    Analyse match data and produce actionable recommendations.

    Each insight is a dict with ``category``, ``title``, ``description``,
    and ``priority`` (high / medium / low).
    """
    cache_key = _insights_key(user_id)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    result = _compute_insights(user_id)
    cache.set(cache_key, result, ENGINE_CACHE_TTL)
    return result


def _compute_insights(user_id: UUID | int) -> dict[str, Any]:
    insights: list[dict[str, Any]] = []

    base_qs = MatchPlayer.objects.filter(user_id=user_id).select_related("match")
    total = base_qs.count()
    if total == 0:
        return {
            "user_id": str(user_id),
            "insights": [{
                "category": "general",
                "title": "Play your first match",
                "description": (
                    "Start playing Pong or Tic-Tac-Toe to unlock "
                    "personalised performance insights."
                ),
                "priority": "high",
            }],
        }

    wins = base_qs.filter(outcome="win").count()
    losses = base_qs.filter(outcome="loss").count()
    overall_wr = wins / total if total else 0.0

    # ------- Time-based comparison: last 7 days vs prior 7 days -------
    now = timezone.now()
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)

    recent_qs = base_qs.filter(match__finished_at__gte=week_ago)
    prior_qs = base_qs.filter(
        match__finished_at__gte=two_weeks_ago,
        match__finished_at__lt=week_ago,
    )

    recent_total = recent_qs.count()
    recent_wins = recent_qs.filter(outcome="win").count()
    prior_total = prior_qs.count()
    prior_wins = prior_qs.filter(outcome="win").count()

    recent_wr = recent_wins / recent_total if recent_total else 0.0
    prior_wr = prior_wins / prior_total if prior_total else 0.0

    if recent_total >= 3 and prior_total >= 3:
        diff = recent_wr - prior_wr
        if diff > 0.15:
            insights.append({
                "category": "trend",
                "title": "Win rate improving",
                "description": (
                    f"Your win rate rose from {prior_wr:.0%} to "
                    f"{recent_wr:.0%} compared to last week. Keep it up!"
                ),
                "priority": "low",
            })
        elif diff < -0.15:
            insights.append({
                "category": "trend",
                "title": "Win rate declining",
                "description": (
                    f"Your win rate dropped from {prior_wr:.0%} to "
                    f"{recent_wr:.0%} this week. Consider reviewing your "
                    "recent replays for patterns."
                ),
                "priority": "high",
            })

    # ------- Streak awareness -------
    recent_outcomes = list(
        base_qs.order_by("-match__finished_at")
        .values_list("outcome", flat=True)[:20]
    )
    loss_streak = 0
    for o in recent_outcomes:
        if o == "loss":
            loss_streak += 1
        else:
            break

    if loss_streak >= 5:
        insights.append({
            "category": "mental",
            "title": "On a losing streak",
            "description": (
                f"You've lost {loss_streak} matches in a row. "
                "Consider taking a short break, warming up against "
                "the AI, or switching game modes."
            ),
            "priority": "high",
        })
    elif loss_streak >= 3:
        insights.append({
            "category": "mental",
            "title": "Small losing streak",
            "description": (
                f"You've lost your last {loss_streak} matches. "
                "Try changing your strategy or taking a quick break."
            ),
            "priority": "medium",
        })

    win_streak = 0
    for o in recent_outcomes:
        if o == "win":
            win_streak += 1
        else:
            break
    if win_streak >= 5:
        insights.append({
            "category": "trend",
            "title": "On fire!",
            "description": (
                f"You've won {win_streak} in a row! "
                "Try challenging a tougher opponent or entering a "
                "tournament to test your skills."
            ),
            "priority": "low",
        })

    # ------- Game-type balance -------
    pong_count = base_qs.filter(match__game_type="pong").count()
    ttt_count = base_qs.filter(match__game_type="tictactoe").count()

    if pong_count > 0 and ttt_count == 0:
        insights.append({
            "category": "variety",
            "title": "Try Tic-Tac-Toe",
            "description": (
                "You've only played Pong so far. Give Tic-Tac-Toe a "
                "try for a different challenge and extra achievements."
            ),
            "priority": "medium",
        })
    elif ttt_count > 0 and pong_count == 0:
        insights.append({
            "category": "variety",
            "title": "Try Pong",
            "description": (
                "You've only played Tic-Tac-Toe. Jump into a Pong "
                "match for a fast-paced challenge!"
            ),
            "priority": "medium",
        })
    elif pong_count > 0 and ttt_count > 0:
        pong_wr = (
            base_qs.filter(match__game_type="pong", outcome="win").count()
            / pong_count
        )
        ttt_wr = (
            base_qs.filter(match__game_type="tictactoe", outcome="win").count()
            / ttt_count
        )
        weaker = "Pong" if pong_wr < ttt_wr else "Tic-Tac-Toe"
        stronger = "Tic-Tac-Toe" if weaker == "Pong" else "Pong"
        if abs(pong_wr - ttt_wr) > 0.20 and min(pong_count, ttt_count) >= 5:
            insights.append({
                "category": "improvement",
                "title": f"Focus on {weaker}",
                "description": (
                    f"Your {stronger} win rate ({max(pong_wr, ttt_wr):.0%}) "
                    f"is much higher than {weaker} "
                    f"({min(pong_wr, ttt_wr):.0%}). Playing more {weaker} "
                    "could round out your skills."
                ),
                "priority": "medium",
            })

    # ------- PvP vs PvE mix -------
    pvp_count = base_qs.filter(match__game_mode="pvp").count()
    pve_count = base_qs.filter(match__game_mode="pve").count()
    if pvp_count == 0 and pve_count >= 5:
        insights.append({
            "category": "challenge",
            "title": "Step into PvP",
            "description": (
                "You've played mainly against AI opponents. Try PvP "
                "matches to test your skills against real players!"
            ),
            "priority": "medium",
        })

    # ------- Duration efficiency -------
    avg_dur = base_qs.filter(
        outcome="win",
    ).aggregate(
        d=Coalesce(Avg("match__duration_seconds"), 0.0, output_field=FloatField()),
    )["d"]
    avg_loss_dur = base_qs.filter(
        outcome="loss",
    ).aggregate(
        d=Coalesce(Avg("match__duration_seconds"), 0.0, output_field=FloatField()),
    )["d"]

    if avg_dur > 0 and avg_loss_dur > 0:
        if avg_loss_dur < avg_dur * 0.6:
            insights.append({
                "category": "improvement",
                "title": "Quick losses detected",
                "description": (
                    "Your losses are significantly shorter than your wins. "
                    "Try to stay focused during the opening moments and "
                    "avoid early mistakes."
                ),
                "priority": "high",
            })

    # ------- Forfeit rate -------
    forfeit_losses = base_qs.filter(
        outcome="loss",
        match__finish_reason__in=["forfeit", "disconnect_forfeit"],
    ).count()
    if losses > 0 and forfeit_losses / losses > 0.3 and forfeit_losses >= 3:
        insights.append({
            "category": "mental",
            "title": "High forfeit rate",
            "description": (
                f"{forfeit_losses} of your {losses} losses are from "
                "disconnections or forfeits. Ensure a stable connection "
                "and try to play out close matches."
            ),
            "priority": "high",
        })

    # ------- Activity consistency -------
    thirty_days_ago = now - timedelta(days=30)
    active_days = (
        base_qs.filter(match__finished_at__gte=thirty_days_ago)
        .annotate(day=TruncDate("match__finished_at"))
        .values("day")
        .distinct()
        .count()
    )

    if active_days <= 3 and total >= 10:
        insights.append({
            "category": "consistency",
            "title": "Play more regularly",
            "description": (
                f"You've only played on {active_days} of the last 30 days. "
                "Regular practice helps maintain and improve your skills."
            ),
            "priority": "medium",
        })
    elif active_days >= 20:
        insights.append({
            "category": "consistency",
            "title": "Dedicated player",
            "description": (
                f"You've played on {active_days} of the last 30 days. "
                "Great dedication — your consistency will pay off!"
            ),
            "priority": "low",
        })

    # Sort: high → medium → low
    priority_order = {"high": 0, "medium": 1, "low": 2}
    insights.sort(key=lambda i: priority_order.get(i["priority"], 3))

    return {
        "user_id": str(user_id),
        "total_matches": total,
        "overall_win_rate": round(overall_wr, 4),
        "insights": insights,
    }
