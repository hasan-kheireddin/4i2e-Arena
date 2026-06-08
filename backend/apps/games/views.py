# =============================================================================
# Games — REST API Views
# =============================================================================
# Match history list/detail and statistics endpoints with filtering,
# pagination, and caching.
#
# Match History:
#   GET /api/games/matches/               — all matches (paginated)
#   GET /api/games/matches/me/            — current user's matches
#   GET /api/games/matches/<uuid:pk>/     — single match detail
#   GET /api/games/matches/user/<uuid>/   — another user's matches
#   GET /api/games/matches/summary/       — quick stats (legacy)
#
# Statistics (Task 9.2):
#   GET /api/games/stats/me/              — current user's full stats
#   GET /api/games/stats/user/<uuid>/     — another user's stats
#   GET /api/games/stats/head-to-head/<uuid>/ — H2H vs another user
#   GET /api/games/stats/leaderboard/     — global leaderboard
# =============================================================================

from __future__ import annotations
from django.db.models import Exists, IntegerField, OuterRef, Q, Subquery, Value
from django.db.models.functions import Coalesce, Greatest
from rest_framework import generics, permissions, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.games.models import Match, MatchPlayer
from apps.games.serializers import (
    LeaderboardQuerySerializer,
    MatchDetailSerializer,
    MatchListSerializer,
    MatchQuerySerializer,
    StatsQuerySerializer,
)
from apps.games.stats_service import (
    get_head_to_head,
    get_leaderboard,
    get_user_stats,
)


class MatchPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


ORDERING_MAP = {
    "date": ("finished_at", "id"),
    "-date": ("-finished_at", "-id"),
    "score": ("sort_score", "-finished_at", "-id"),
    "-score": ("-sort_score", "-finished_at", "-id"),
    "duration": ("duration_seconds", "-finished_at", "-id"),
    "-duration": ("-duration_seconds", "-finished_at", "-id"),
}


def _get_match_query_params(request):
    serializer = MatchQuerySerializer(data=request.query_params)
    serializer.is_valid(raise_exception=True)

    params = dict(serializer.validated_data)
    params["result"] = params.get("result") or params.get("outcome")

    if "mode" not in params and "game_mode" in params:
        legacy_mode = params["game_mode"]
        params["mode"] = "pva" if legacy_mode == "pve" else legacy_mode

    return params


def _annotate_sort_score(queryset, user=None):
    if user is None:
        return queryset.annotate(
            sort_score=Greatest("player1_score", "player2_score"),
        )

    user_score = MatchPlayer.objects.filter(
        match_id=OuterRef("pk"),
        user_id=user.pk,
    ).values("score")[:1]

    return queryset.annotate(
        sort_score=Coalesce(
            Subquery(user_score, output_field=IntegerField()),
            Greatest("player1_score", "player2_score"),
            Value(0),
        ),
    )


def _apply_ordering(queryset, ordering):
    fields = ORDERING_MAP.get(ordering or "-date", ORDERING_MAP["-date"])
    return queryset.order_by(*fields)


def _apply_match_filters(queryset, params, user=None):
    """
    Apply query-param filters to a Match queryset.

    Supported filters:
      - ``game_type``    — "pong" or "tictactoe"
      - ``mode``         — "pvp", "pva", or "local"
      - ``search``       — partial name search (case-insensitive)
      - ``finish_reason`` — "score", "draw", "forfeit", etc.
      - ``from_date``    — matches finished after this ISO date
      - ``to_date``      — matches finished before this ISO date
    """
    game_type = params.get("game_type")
    if game_type:
        queryset = queryset.filter(game_type=game_type)

    mode = params.get("mode")
    if mode == "local":
        queryset = queryset.filter(
            game_session_id__startswith="local-",
        ).filter(
            Q(ai_difficulty="") | Q(ai_difficulty__isnull=True),
        )
    elif mode == "pvp":
        queryset = queryset.filter(
            game_mode="pvp",
        ).exclude(
            game_session_id__startswith="local-",
        )
    elif mode == "pva":
        queryset = queryset.filter(
            Q(game_mode__in=["pva", "pve"]) | ~Q(ai_difficulty=""),
        )

    finish_reason = params.get("finish_reason")
    if finish_reason:
        queryset = queryset.filter(finish_reason=finish_reason)

    search = params.get("search")
    if search:
        if user is not None:
            matching_opponent = MatchPlayer.objects.filter(
                match_id=OuterRef("pk"),
            ).exclude(
                user_id=user.pk,
            ).filter(
                Q(user__username__icontains=search)
                | Q(user__display_name__icontains=search),
            )
            queryset = queryset.annotate(
                has_matching_opponent=Exists(matching_opponent),
            ).filter(
                Q(has_matching_opponent=True)
                | Q(metadata__local_players__player1_name__icontains=search)
                | Q(metadata__local_players__player2_name__icontains=search)
                | Q(ai_difficulty__icontains=search),
            )
        else:
            queryset = queryset.filter(
                Q(players__user__username__icontains=search)
                | Q(players__user__display_name__icontains=search)
                | Q(metadata__local_players__player1_name__icontains=search)
                | Q(metadata__local_players__player2_name__icontains=search)
                | Q(ai_difficulty__icontains=search),
            )

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
        queryset = queryset.filter(
            players__user_id=opponent,
        )

    result = params.get("result")
    if result:
        queryset = queryset.filter(
            players__user=user,
            players__outcome=result,
        )

    return queryset


class MatchListView(generics.ListAPIView):
    """
    List all recorded matches with filtering and pagination.

    Query parameters:
      - ``game_type`` — filter by game type
      - ``game_mode`` — filter by mode (pvp / pve)
      - ``finish_reason`` — filter by finish reason
      - ``from_date`` / ``to_date`` — date range
      - ``page`` / ``page_size`` — pagination
    """

    serializer_class = MatchListSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = MatchPagination

    def get_queryset(self):
        params = _get_match_query_params(self.request)
        qs = (
            Match.objects
            .select_related("winner")
            .prefetch_related("players__user")
        )
        qs = _apply_match_filters(qs, params, user=self.request.user)
        qs = _apply_user_filters(qs, params, self.request.user)
        qs = _annotate_sort_score(qs, user=self.request.user)
        qs = _apply_ordering(qs, params.get("ordering"))
        return qs.distinct()


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
        params = _get_match_query_params(self.request)
        qs = (
            Match.objects
            .filter(players__user=user)
            .select_related("winner")
            .prefetch_related("players__user")
        )
        qs = _apply_match_filters(qs, params, user=user)
        qs = _apply_user_filters(qs, params, user)
        qs = _annotate_sort_score(qs, user=user)
        qs = _apply_ordering(qs, params.get("ordering"))
        return qs.distinct()


class MatchDetailView(generics.RetrieveAPIView):
    """Retrieve full details of a single match."""

    serializer_class = MatchDetailSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = "pk"

    def get_queryset(self):
        return (
            Match.objects
            .select_related("winner")
            .prefetch_related("players__user")
        )


class UserMatchHistoryView(generics.ListAPIView):
    """
    List another user's match history (public view).

    Only shows PvP matches (excludes PvE).
    """

    serializer_class = MatchListSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = MatchPagination

    def get_queryset(self):
        user_id = self.kwargs["user_id"]
        params = _get_match_query_params(self.request)
        qs = (
            Match.objects
            .filter(
                players__user_id=user_id,
                game_mode__in=["pvp"],
            )
            .select_related("winner")
            .prefetch_related("players__user")
        )
        qs = _apply_match_filters(qs, params)
        qs = _annotate_sort_score(qs)
        qs = _apply_ordering(qs, params.get("ordering"))
        return qs.distinct()


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
        for gm, gm_filter in (
            ("pvp", Q(match__game_mode="pvp")),
            ("pva", Q(match__game_mode__in=["pva", "pve"])),
        ):
            gm_qs = participations.filter(gm_filter)
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

class UserStatsView(APIView):
    """
    Return comprehensive statistics for the authenticated user.

    Query parameters:
      - ``game_type`` — optional: ``"pong"`` or ``"tictactoe"``
      - ``mode`` — optional: ``"pvp"``, ``"pva"``, or ``"local"``

    Results are cached for 5 minutes and invalidated automatically
    when a new match is recorded.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = StatsQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)

        game_type = query.validated_data.get("game_type")
        mode = query.validated_data.get("mode")
        stats = get_user_stats(request.user.pk, game_type=game_type, mode=mode)
        return Response(stats, status=status.HTTP_200_OK)

class PublicUserStatsView(APIView):
    """
    Return statistics for any user (public view).

    Only includes PvP data in the response.

    Query parameters:
      - ``game_type`` — optional: ``"pong"`` or ``"tictactoe"``
      - ``mode`` — optional: ``"pvp"``, ``"pva"``, or ``"local"``
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, user_id):
        query = StatsQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)

        game_type = query.validated_data.get("game_type")
        mode = query.validated_data.get("mode")
        stats = get_user_stats(user_id, game_type=game_type, mode=mode)

        # Remove AI-mode data from public view
        stats.get("by_game_mode", {}).pop("pva", None)
        stats.get("by_game_mode", {}).pop("pve", None)

        return Response(stats, status=status.HTTP_200_OK)


class HeadToHeadView(APIView):
    """
    Return head-to-head statistics between the authenticated user
    and the specified opponent.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, opponent_id):
        stats = get_head_to_head(request.user.pk, opponent_id)
        return Response(stats, status=status.HTTP_200_OK)

class LeaderboardView(APIView):
    """
    Return a ranked leaderboard with filtering options.

    Query parameters:
      - ``game_type`` — optional: ``"pong"`` or ``"tictactoe"``
      - ``metric``    — only ``"wins"`` is supported
      - ``period``    — ``"daily"``, ``"weekly"``, ``"monthly"``, ``"all"``
      - ``limit``     — max entries (1–100, default 50)

    Only online PvP matches are considered.
    All players with qualifying matches are included.
    Results are cached for 10 minutes.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = LeaderboardQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)

        metric = query.validated_data.get("metric", "wins")
        if metric != "wins":
            return Response(
                {"detail": "Only win-based leaderboard is supported."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        game_type = query.validated_data.get("game_type")
        period = query.validated_data.get("period", "all")
        limit = query.validated_data.get("limit", 50)

        data = get_leaderboard(
            game_type=game_type,
            period=period,
            limit=limit,
        )
        return Response(data, status=status.HTTP_200_OK)


class CreateLocalMatchView(APIView):
    """
    Create a match record for a local (frontend-only) game.
    
    Used when playing locally or vs AI without WebSocket connection.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from datetime import datetime, timezone as tz
        from apps.games.models import Match, MatchPlayer, GameType, GameMode, FinishReason, MatchOutcome
        from django.utils import timezone as dj_tz
        import uuid

        data = request.data
        user = request.user

        # Validate required fields
        game_type = data.get("game_type")
        if game_type not in ("pong", "tictactoe"):
            return Response({"error": "Invalid game_type"}, status=status.HTTP_400_BAD_REQUEST)

        game_mode_input = data.get("game_mode", "pvp")
        if game_mode_input not in ("pvp", "pva", "pve"):
            return Response({"error": "Invalid game_mode"}, status=status.HTTP_400_BAD_REQUEST)
        game_mode_str = "pva" if game_mode_input in ("pva", "pve") else "pvp"

        # Extract result
        winner = data.get("winner")  # "X", "O", or None for draw
        duration_seconds = float(data.get("duration_seconds", 0))
        ai_difficulty = data.get("ai_difficulty", "")
        player1_score = int(data.get("player1_score", 0))
        player2_score = int(data.get("player2_score", 0))

        # Determine finish reason
        if winner is None:
            finish_reason = FinishReason.DRAW
        else:
            finish_reason = FinishReason.SCORE

        # Determine winner
        winner_user = None
        player_outcome = MatchOutcome.DRAW
        
        if game_mode_str == "pva":
            # Player is always slot 1 (X), AI is slot 2 (O)
            if winner == "X":
                winner_user = user
                player_outcome = MatchOutcome.WIN
            elif winner == "O":
                player_outcome = MatchOutcome.LOSS
        else:
            # Local PvP: both slots are human, winner is determined
            if winner == "X":
                winner_user = user
                player_outcome = MatchOutcome.WIN
            elif winner == "O":
                # In local PvP, we can't track second player
                player_outcome = MatchOutcome.LOSS

        # Create match
        now = dj_tz.now()
        started_at = now - dj_tz.timedelta(seconds=duration_seconds)

        match = Match.objects.create(
            game_session_id=f"local-{uuid.uuid4().hex[:16]}",
            game_type=game_type,
            game_mode=game_mode_str,
            finish_reason=finish_reason,
            winner=winner_user,
            started_at=started_at,
            finished_at=now,
            duration_seconds=round(duration_seconds, 2),
            player1_score=player1_score,
            player2_score=player2_score,
            ai_difficulty=ai_difficulty,
            metadata=data.get("metadata", {}),
        )

        # Create player record
        MatchPlayer.objects.create(
            match=match,
            user=user,
            slot=1,  # User is always slot 1
            outcome=player_outcome,
            score=player1_score,
            xp_earned=0,
        )

        # Invalidate stats cache
        from apps.games.stats_service import invalidate_user_stats
        invalidate_user_stats(user.pk)

        return Response({
            "match_id": str(match.id),
            "status": "created"
        }, status=status.HTTP_201_CREATED)


class LiveGamesView(APIView):
    """List currently active (in-progress) game sessions."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.games.session import active_sessions, SessionStatus
        sessions = active_sessions()
        games = []
        for gid, s in sessions.items():
            if s.status != SessionStatus.PLAYING:
                continue
            games.append({
                "game_id": gid,
                "game_type": s.game_type.value,
                "players": [
                    {"username": ps.username, "slot": ps.slot}
                    for ps in s.players.values()
                ],
                "spectator_count": s.spectator_count,
            })
        return Response(games, status=status.HTTP_200_OK)


class GameInfoView(APIView):
    """Get info for a specific active game (for share/spectate)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, game_id):
        from apps.games.session import get_session
        session = get_session(game_id)
        if session is None:
            return Response({"detail": "Game not found"}, status=404)
        return Response({
            "game_id": session.game_id,
            "game_type": session.game_type.value,
            "status": session.status.value,
            "players": {
                str(slot): {"username": ps.username, "slot": ps.slot}
                for slot, ps in session.players.items()
            },
            "spectator_count": session.spectator_count,
        })
