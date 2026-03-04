from __future__ import annotations
from django.db.models import Q
from rest_framework import generics, permissions, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.games.models import Match, MatchPlayer
from apps.games.serializers import (
    MatchDetailSerializer,
    MatchListSerializer,
)

class MatchPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


def _apply_match_filters(queryset, params):
    """
    Apply query-param filters to a Match queryset.

    Supported filters:
      - ``game_type``   — "pong" or "tictactoe"
      - ``game_mode``   — "pvp", "pve", "tournament"
      - ``finish_reason`` — "score", "draw", "forfeit", etc.
      - ``opponent``    — filter by opponent user UUID
      - ``outcome``     — "win", "loss", "draw" (requires user context)
      - ``from_date``   — matches finished after this ISO date
      - ``to_date``     — matches finished before this ISO date
    """
    game_type = params.get("game_type")
    if game_type:
        queryset = queryset.filter(game_type=game_type)

    game_mode = params.get("game_mode")
    if game_mode:
        queryset = queryset.filter(game_mode=game_mode)

    finish_reason = params.get("finish_reason")
    if finish_reason:
        queryset = queryset.filter(finish_reason=finish_reason)

    from_date = params.get("from_date")
    if from_date:
        queryset = queryset.filter(finished_at__gte=from_date)

    to_date = params.get("to_date")
    if to_date:
        queryset = queryset.filter(finished_at__lte=to_date)

    return queryset


def _apply_user_filters(queryset, params, user):
    """
    Apply user-specific filters (opponent, outcome).
    Requires the queryset to already be scoped to the user's matches.
    """
    opponent = params.get("opponent")
    if opponent:
        # Find matches where the given opponent also participated
        queryset = queryset.filter(
            players__user_id=opponent,
        ).exclude(
            players__user_id=user.pk,
            players__user__id=opponent,
        )

    outcome = params.get("outcome")
    if outcome:
        # Filter via the MatchPlayer join
        queryset = queryset.filter(
            players__user=user,
            players__outcome=outcome,
        )

    return queryset


class MatchListView(generics.ListAPIView):
    """
    List all recorded matches with filtering and pagination.

    Query parameters:
      - ``game_type`` — filter by game type
      - ``game_mode`` — filter by mode (pvp / pve / tournament)
      - ``finish_reason`` — filter by finish reason
      - ``from_date`` / ``to_date`` — date range
      - ``page`` / ``page_size`` — pagination
    """

    serializer_class = MatchListSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = MatchPagination

    def get_queryset(self):
        qs = (
            Match.objects
            .select_related("winner", "tournament")
            .prefetch_related("players__user")
            .order_by("-finished_at")
        )
        qs = _apply_match_filters(qs, self.request.query_params)
        return qs


class UserMatchListView(generics.ListAPIView):
    """
    List the authenticated user's match history with filtering.

    Additional query parameters beyond MatchListView:
      - ``opponent`` — filter by opponent user UUID
      - ``outcome``  — "win", "loss", "draw"
    """

    serializer_class = MatchListSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = MatchPagination

    def get_queryset(self):
        user = self.request.user
        qs = (
            Match.objects
            .filter(players__user=user)
            .select_related("winner", "tournament")
            .prefetch_related("players__user")
            .order_by("-finished_at")
            .distinct()
        )
        qs = _apply_match_filters(qs, self.request.query_params)
        qs = _apply_user_filters(qs, self.request.query_params, user)
        return qs


class MatchDetailView(generics.RetrieveAPIView):
    """Retrieve full details of a single match."""

    serializer_class = MatchDetailSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = "pk"

    def get_queryset(self):
        return (
            Match.objects
            .select_related("winner", "tournament", "tournament_round")
            .prefetch_related("players__user")
        )


class UserMatchHistoryView(generics.ListAPIView):
    """
    List another user's match history (public view).

    Only shows PvP and tournament matches (excludes PvE).
    """

    serializer_class = MatchListSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = MatchPagination

    def get_queryset(self):
        user_id = self.kwargs["user_id"]
        qs = (
            Match.objects
            .filter(
                players__user_id=user_id,
                game_mode__in=["pvp", "tournament"],
            )
            .select_related("winner", "tournament")
            .prefetch_related("players__user")
            .order_by("-finished_at")
            .distinct()
        )
        qs = _apply_match_filters(qs, self.request.query_params)
        return qs


class MatchSummaryView(APIView):
    """
    Return aggregated match statistics for the authenticated user.

    Response:
      {
        "total_matches": 42,
        "wins": 25,
        "losses": 12,
        "draws": 5,
        "win_rate": 0.595,
        "by_game_type": {
          "pong": { "total": 30, "wins": 20, "losses": 8, "draws": 2 },
          "tictactoe": { "total": 12, "wins": 5, "losses": 4, "draws": 3 }
        },
        "by_game_mode": { ... },
        "current_streak": { "type": "win", "count": 3 },
        "longest_win_streak": 7,
        "average_duration": 124.5,
        "recent_form": ["win", "win", "loss", "win", "draw"]
      }
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user

        participations = MatchPlayer.objects.filter(
            user=user,
        ).select_related("match")

        total = participations.count()
        wins = participations.filter(outcome="win").count()
        losses = participations.filter(outcome="loss").count()
        draws = participations.filter(outcome="draw").count()
        win_rate = round(wins / total, 3) if total > 0 else 0.0

        # --- By game type ---
        by_game_type = {}
        for gt in ["pong", "tictactoe"]:
            gt_qs = participations.filter(match__game_type=gt)
            gt_total = gt_qs.count()
            if gt_total > 0:
                by_game_type[gt] = {
                    "total": gt_total,
                    "wins": gt_qs.filter(outcome="win").count(),
                    "losses": gt_qs.filter(outcome="loss").count(),
                    "draws": gt_qs.filter(outcome="draw").count(),
                }

        # --- By game mode ---
        by_game_mode = {}
        for gm in ["pvp", "pve", "tournament"]:
            gm_qs = participations.filter(match__game_mode=gm)
            gm_total = gm_qs.count()
            if gm_total > 0:
                by_game_mode[gm] = {
                    "total": gm_total,
                    "wins": gm_qs.filter(outcome="win").count(),
                    "losses": gm_qs.filter(outcome="loss").count(),
                    "draws": gm_qs.filter(outcome="draw").count(),
                }

        # --- Current streak ---
        recent = (
            participations
            .order_by("-match__finished_at")
            .values_list("outcome", flat=True)[:50]
        )
        recent_list = list(recent)

        current_streak = _compute_streak(recent_list)
        longest_win = _longest_win_streak(recent_list)

        # --- Average duration ---
        durations = participations.values_list(
            "match__duration_seconds", flat=True,
        )
        dur_list = [d for d in durations if d and d > 0]
        avg_duration = round(sum(dur_list) / len(dur_list), 1) if dur_list else 0.0

        # --- Recent form (last 5) ---
        recent_form = recent_list[:5]

        return Response({
            "total_matches": total,
            "wins": wins,
            "losses": losses,
            "draws": draws,
            "win_rate": win_rate,
            "by_game_type": by_game_type,
            "by_game_mode": by_game_mode,
            "current_streak": current_streak,
            "longest_win_streak": longest_win,
            "average_duration": avg_duration,
            "recent_form": recent_form,
        }, status=status.HTTP_200_OK)

def _compute_streak(outcomes: list[str]) -> dict[str, str | int]:
    """
    Compute the current streak from a list of outcomes
    (most recent first).
    """
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


def _longest_win_streak(outcomes: list[str]) -> int:
    """Find the longest consecutive win streak in the outcomes list."""
    max_streak = 0
    current = 0
    for o in outcomes:
        if o == "win":
            current += 1
            max_streak = max(max_streak, current)
        else:
            current = 0
    return max_streak
