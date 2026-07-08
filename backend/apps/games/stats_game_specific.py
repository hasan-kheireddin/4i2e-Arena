from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from django.db.models import Avg, FloatField, Max, Sum
from django.db.models.functions import Coalesce

from apps.games.models import Match, MatchPlayer

FORFEIT_FINISH_REASONS = ["forfeit", "disconnect_forfeit"]


def compute_game_specific_stats(
    base_qs,
    game_type: Optional[str],
    user_id: UUID | int,
) -> dict[str, Any]:
    result: dict[str, Any] = {}
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


def _count_pong_shutout_wins(
    qs,
    match_ids: list[Any],
    opp_scores: dict[Any, int],
) -> int:
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
    draws_count = qs.filter(outcome="draw").count()
    draw_rate = round(draws_count / total, 4) if total > 0 else 0.0

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
