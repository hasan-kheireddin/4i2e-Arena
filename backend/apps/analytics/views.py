# =============================================================================
# Analytics — Achievement, Leaderboard & Activity Tracking Views
# =============================================================================
# REST API endpoints for the achievement, XP/leaderboard, and activity
# tracking systems:
#
#   GET  /api/analytics/achievements/            → Full catalogue with user status
#   GET  /api/analytics/achievements/unlocked/   → User's unlocked achievements
#   GET  /api/analytics/achievements/progress/   → User's progress toward all
#   GET  /api/analytics/achievements/stats/      → Summary statistics
#   GET  /api/analytics/achievements/<id>/       → Single achievement detail
#   GET  /api/analytics/leaderboard/             → Global leaderboard
#   GET  /api/analytics/xp/me/                   → My XP & level details
#   GET  /api/analytics/xp/levels/               → Level progression table
#
#   (Task 10.1 — Activity Tracking)
#   GET  /api/analytics/activity/summary/        → User activity summary
#   GET  /api/analytics/activity/timeline/       → Daily activity timeline
#   GET  /api/analytics/activity/heatmap/        → Hourly heatmap
#   GET  /api/analytics/activity/recent/         → Recent activity feed
#   POST /api/analytics/activity/track/          → Frontend page-view tracking
#   GET  /api/analytics/activity/export/         → Export user data (JSON/CSV/XML)
#   POST /api/analytics/activity/import/         → Import user data (JSON/CSV/XML)
#   POST /api/analytics/activity/anonymise/      → Anonymise user data
#   GET  /api/analytics/activity/global/         → Platform-wide summary (admin)
#
#   (Task 10.2 — Analytics Calculation Engine)
#   GET  /api/analytics/insights/win-rate-trend/      → Rolling win-rate curve
#   GET  /api/analytics/insights/performance-trend/   → Composite score trend
#   GET  /api/analytics/insights/peak-hours/          → Peak activity hours
#   GET  /api/analytics/insights/sessions/            → Session analysis
#   GET  /api/analytics/insights/opponents/           → Most-played opponents
#   GET  /api/analytics/insights/rivalries/           → Rivalry detection
#   GET  /api/analytics/insights/recommendations/     → Performance insights
# =============================================================================

from __future__ import annotations
from django.contrib.auth import get_user_model
from django.db.models import (
    BooleanField,
    Case,
    Count,
    F,
    FloatField,
    IntegerField,
    OuterRef,
    Subquery,
    Sum,
    Value,
    When,
    Window,
)
from django.db.models.functions import DenseRank
from rest_framework import generics, permissions, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import (
    Achievement,
    AchievementCategory,
    AchievementProgress,
    AchievementTier,
    AchievementUnlock,
)
from .serializers import (
    AchievementProgressSerializer,
    AchievementStatsSerializer,
    AchievementUnlockSerializer,
    AchievementWithUserStatusSerializer,
    LeaderboardEntrySerializer,
    UserXPDetailSerializer,
)
from .xp_service import get_xp_for_level, get_xp_to_next_level, MAX_LEVEL

User = get_user_model()

class AchievementListView(generics.ListAPIView):
    """
    List all achievements with the requesting user's unlock status and
    progress.  Supports filtering by ``category`` and ``tier`` query
    parameters.

    Hidden achievements are excluded unless already unlocked by the user.
    """

    serializer_class = AchievementWithUserStatusSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        # Subqueries for user-specific unlock and progress
        unlock_sq = AchievementUnlock.objects.filter(
            user=user, achievement=OuterRef("pk"),
        )
        progress_sq = AchievementProgress.objects.filter(
            user=user, achievement=OuterRef("pk"),
        )

        qs = Achievement.objects.exclude(
            is_hidden=True,
        ).union(
            # Include hidden achievements that the user has unlocked
            Achievement.objects.filter(
                is_hidden=True,
                unlocks__user=user,
            ),
        )

        # We need to re-query with annotations since union doesn't support them
        visible_ids = list(qs.values_list("pk", flat=True))

        qs = (
            Achievement.objects
            .filter(pk__in=visible_ids)
            .annotate(
                is_unlocked=Case(
                    When(unlocks__user=user, then=Value(True)),
                    default=Value(False),
                    output_field=BooleanField(),
                ),
                unlocked_at=Subquery(
                    unlock_sq.values("unlocked_at")[:1],
                ),
                progress_current=Subquery(
                    progress_sq.values("current")[:1],
                    output_field=IntegerField(),
                ),
            )
            .annotate(
                progress_percentage=Case(
                    When(threshold=0, then=Value(100.0)),
                    default=Case(
                        When(
                            progress_current__isnull=False,
                            then=F("progress_current") * 100.0 / F("threshold"),
                        ),
                        default=Value(0.0),
                        output_field=FloatField(),
                    ),
                    output_field=FloatField(),
                ),
            )
            .distinct()
        )

        # Optional filters
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)

        tier = self.request.query_params.get("tier")
        if tier:
            qs = qs.filter(tier=tier)

        return qs.order_by("category", "ordering_priority", "name")

class AchievementUnlockedListView(generics.ListAPIView):
    """List achievements unlocked by the requesting user."""

    serializer_class = AchievementUnlockSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            AchievementUnlock.objects
            .filter(user=self.request.user)
            .select_related("achievement")
            .order_by("-unlocked_at")
        )

class AchievementProgressListView(generics.ListAPIView):
    """List progress toward all achievements for the requesting user."""

    serializer_class = AchievementProgressSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            AchievementProgress.objects
            .filter(
                user=self.request.user,
                achievement__is_hidden=False,
            )
            .select_related("achievement")
            .order_by("achievement__category", "achievement__ordering_priority")
        )


class AchievementStatsView(APIView):
    """Compute and return achievement summary statistics for the user."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user

        # Total visible achievements (exclude internal/hidden)
        total = Achievement.objects.filter(is_hidden=False).count()
        unlocked_qs = AchievementUnlock.objects.filter(
            user=user, achievement__is_hidden=False,
        ).select_related("achievement")
        unlocked_count = unlocked_qs.count()
        locked_count = total - unlocked_count
        pct = (unlocked_count / total * 100) if total > 0 else 0.0

        # Total XP earned from achievements
        total_xp = unlocked_qs.aggregate(
            total=Sum("achievement__xp_reward"),
        )["total"] or 0

        # Breakdown by category
        by_category = {}
        for cat_value, cat_label in AchievementCategory.choices:
            cat_total = Achievement.objects.filter(
                category=cat_value, is_hidden=False,
            ).count()
            cat_unlocked = unlocked_qs.filter(
                achievement__category=cat_value,
            ).count()
            by_category[cat_value] = {
                "label": cat_label,
                "total": cat_total,
                "unlocked": cat_unlocked,
                "percentage": (cat_unlocked / cat_total * 100) if cat_total > 0 else 0.0,
            }

        # Breakdown by tier
        by_tier = {}
        for tier_value, tier_label in AchievementTier.choices:
            tier_total = Achievement.objects.filter(
                tier=tier_value, is_hidden=False,
            ).count()
            tier_unlocked = unlocked_qs.filter(
                achievement__tier=tier_value,
            ).count()
            by_tier[tier_value] = {
                "label": tier_label,
                "total": tier_total,
                "unlocked": tier_unlocked,
                "percentage": (tier_unlocked / tier_total * 100) if tier_total > 0 else 0.0,
            }

        # Recent unlocks (last 5)
        recent = unlocked_qs.order_by("-unlocked_at")[:5]
        recent_data = AchievementUnlockSerializer(recent, many=True).data

        data = {
            "total_achievements": total,
            "unlocked_count": unlocked_count,
            "locked_count": locked_count,
            "completion_percentage": round(pct, 2),
            "total_xp_from_achievements": total_xp,
            "by_category": by_category,
            "by_tier": by_tier,
            "recent_unlocks": recent_data,
        }

        return Response(data, status=status.HTTP_200_OK)

class AchievementDetailView(generics.RetrieveAPIView):
    """Retrieve a single achievement with the user's status."""

    serializer_class = AchievementWithUserStatusSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = "pk"

    def get_queryset(self):
        user = self.request.user

        unlock_sq = AchievementUnlock.objects.filter(
            user=user, achievement=OuterRef("pk"),
        )
        progress_sq = AchievementProgress.objects.filter(
            user=user, achievement=OuterRef("pk"),
        )

        return (
            Achievement.objects
            .annotate(
                is_unlocked=Case(
                    When(unlocks__user=user, then=Value(True)),
                    default=Value(False),
                    output_field=BooleanField(),
                ),
                unlocked_at=Subquery(
                    unlock_sq.values("unlocked_at")[:1],
                ),
                progress_current=Subquery(
                    progress_sq.values("current")[:1],
                    output_field=IntegerField(),
                ),
            )
            .annotate(
                progress_percentage=Case(
                    When(threshold=0, then=Value(100.0)),
                    default=Case(
                        When(
                            progress_current__isnull=False,
                            then=F("progress_current") * 100.0 / F("threshold"),
                        ),
                        default=Value(0.0),
                        output_field=FloatField(),
                    ),
                    output_field=FloatField(),
                ),
            )
            .distinct()
        )
    
class LeaderboardPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class LeaderboardView(generics.ListAPIView):
    """
    Global leaderboard ranked by XP (descending).

    Supports query parameters:
      - ``page`` / ``page_size`` for pagination
      - ``order_by`` = ``xp`` (default) | ``level`` | ``username``
    """

    serializer_class = LeaderboardEntrySerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = LeaderboardPagination

    def get_queryset(self):
        order_by = self.request.query_params.get("order_by", "xp")
        order_map = {
            "xp": "-xp",
            "level": "-level",
            "username": "username",
        }
        ordering = order_map.get(order_by, "-xp")

        qs = (
            User.objects
            .filter(is_active=True, is_staff=False)
            .annotate(
                rank=Window(
                    expression=DenseRank(),
                    order_by=F("xp").desc(),
                ),
            )
            .order_by(ordering)
        )
        return qs


class UserXPDetailView(APIView):
    """
    Return detailed XP and level information for the requesting user,
    including their rank on the leaderboard.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user

        # Calculate rank (number of active non-staff users with more XP + 1)
        rank = (
            User.objects
            .filter(is_active=True, is_staff=False, xp__gt=user.xp)
            .count()
        ) + 1

        total_players = User.objects.filter(
            is_active=True, is_staff=False,
        ).count()

        level_info = get_xp_to_next_level(user.xp)

        data = {
            "user_id": str(user.id),
            "username": user.username,
            "display_name": user.display_name,
            "xp": user.xp,
            "level": user.level,
            "level_info": level_info,
            "rank": rank,
            "total_players": total_players,
        }

        return Response(data, status=status.HTTP_200_OK)


class LevelTableView(APIView):
    """
    Return the level progression table showing XP thresholds for
    each level.  Useful for the frontend to render level progress bars.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        max_display = min(
            int(request.query_params.get("max_level", 50)),
            MAX_LEVEL,
        )
        levels = []
        for lvl in range(1, max_display + 1):
            xp_required = get_xp_for_level(lvl)
            xp_next = get_xp_for_level(min(lvl + 1, MAX_LEVEL))
            levels.append({
                "level": lvl,
                "xp_required": xp_required,
                "xp_to_next": xp_next - xp_required,
            })

        return Response(
            {"levels": levels, "max_level": MAX_LEVEL},
            status=status.HTTP_200_OK,
        )
from .aggregation_service import (
    get_activity_heatmap,
    get_activity_timeline,
    get_global_activity_summary,
    get_recent_activity,
    get_user_activity_summary,
)
from .privacy_service import (
    anonymise_user_events,
    export_user_events,
    export_user_events_csv,
    export_user_events_xml,
    import_user_events,
    parse_import_file,
)
from .tracking_service import get_client_ip, get_user_agent, track_page_view


# ---------------------------------------------------------------------------
# GET /api/analytics/activity/summary/ — User activity summary
# ---------------------------------------------------------------------------

class ActivitySummaryView(APIView):
    """
    Return an aggregated activity summary for the authenticated user.

    Includes total events, today/week counts, breakdowns by category
    and event type, most active hour/day, and latest event.
    Cached for 5 minutes.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        data = get_user_activity_summary(request.user.pk)
        return Response(data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# GET /api/analytics/activity/timeline/ — Daily activity timeline
# ---------------------------------------------------------------------------

class ActivityTimelineView(APIView):
    """
    Return daily activity counts for the authenticated user.

    Query parameters:
      - ``days`` — lookback window (default 30, max 365)
      - ``category`` — optional filter
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        days = min(int(request.query_params.get("days", 30)), 365)
        category = request.query_params.get("category")

        data = get_activity_timeline(
            request.user.pk,
            days=days,
            category=category,
        )
        return Response(data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# GET /api/analytics/activity/heatmap/ — Activity heatmap
# ---------------------------------------------------------------------------

class ActivityHeatmapView(APIView):
    """
    Return hourly × day-of-week event counts for building a heatmap.

    Based on the last 90 days.  ``day`` 0 = Monday, ``hour`` 0–23.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        data = get_activity_heatmap(request.user.pk)
        return Response(data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# GET /api/analytics/activity/recent/ — Recent activity feed
# ---------------------------------------------------------------------------

class RecentActivityView(APIView):
    """
    Return the latest activity events for the authenticated user.

    Query parameters:
      - ``limit`` — max events (default 20, max 100)
      - ``category`` — optional filter
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        limit = min(int(request.query_params.get("limit", 20)), 100)
        category = request.query_params.get("category")

        data = get_recent_activity(
            request.user.pk,
            limit=limit,
            category=category,
        )
        return Response(data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# POST /api/analytics/activity/track/ — Frontend event tracking
# ---------------------------------------------------------------------------

class TrackEventView(APIView):
    """
    Accept a page-view or custom event from the frontend.

    Request body:
      ``{ "path": "/dashboard" }``
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        path = request.data.get("path", "")
        if not path:
            return Response(
                {"detail": "path is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        track_page_view(
            request.user.pk,
            path=path,
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
        )
        return Response(
            {"detail": "Event tracked."},
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# GET  /api/analytics/activity/export/  — Data portability (JSON / CSV / XML)
# POST /api/analytics/activity/import/  — Data import (JSON / CSV / XML)
# ---------------------------------------------------------------------------

class ExportActivityView(APIView):
    """
    Export all activity events for the authenticated user.

    Query parameter:
      - ``format`` — ``json`` (default) | ``csv`` | ``xml``

    All formats trigger a file download via Content-Disposition header.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        fmt = request.query_params.get("format", "json").lower()
        user_id = request.user.pk

        if fmt == "csv":
            from django.http import HttpResponse
            content = export_user_events_csv(user_id)
            response = HttpResponse(content, content_type="text/csv; charset=utf-8")
            response["Content-Disposition"] = (
                'attachment; filename="activity_export.csv"'
            )
            return response

        if fmt == "xml":
            from django.http import HttpResponse
            content = export_user_events_xml(user_id)
            response = HttpResponse(content, content_type="application/xml; charset=utf-8")
            response["Content-Disposition"] = (
                'attachment; filename="activity_export.xml"'
            )
            return response

        # Default: JSON
        from django.http import HttpResponse
        import json as _json
        data = export_user_events(user_id)
        payload = _json.dumps({"events": data, "total": len(data)}, ensure_ascii=False)
        response = HttpResponse(payload, content_type="application/json; charset=utf-8")
        response["Content-Disposition"] = (
            'attachment; filename="activity_export.json"'
        )
        return response


class ImportActivityView(APIView):
    """
    Import activity events from a previously exported file.

    Accepts multipart file upload OR raw request body.
    Supported formats (detected from Content-Type or file extension):
      - JSON: list of event objects, or ``{"events": [...]}``
      - CSV:  exported CSV with header row
      - XML:  exported XML document

    Rules:
      - Events whose ``id`` already exists in the DB are skipped (idempotent).
      - Events are always imported for the authenticated user — the
        ``user_id`` field in the file is ignored for security.
      - Returns a summary: imported / skipped / errors.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        # ── Resolve file content and content-type ──────────────────────────
        uploaded = request.FILES.get("file")
        if uploaded:
            content = uploaded.read()
            # Detect format from filename extension if content-type is generic
            ct = uploaded.content_type or ""
            name = (uploaded.name or "").lower()
            if "octet-stream" in ct or not ct:
                if name.endswith(".csv"):
                    ct = "text/csv"
                elif name.endswith(".xml"):
                    ct = "application/xml"
                else:
                    ct = "application/json"
        else:
            # Accept raw body with explicit Content-Type
            content = request.body
            ct = request.content_type or "application/json"

        if not content:
            return Response(
                {"detail": "No file or body provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Parse ──────────────────────────────────────────────────────────
        rows, parse_error = parse_import_file(content, ct)
        if parse_error:
            return Response(
                {"detail": parse_error},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not rows:
            return Response(
                {"detail": "File contained no events.", "imported": 0, "skipped": 0, "errors": []},
                status=status.HTTP_200_OK,
            )

        # ── Import ─────────────────────────────────────────────────────────
        result = import_user_events(request.user.pk, rows)

        http_status = (
            status.HTTP_200_OK
            if result["imported"] > 0 or not result["errors"]
            else status.HTTP_400_BAD_REQUEST
        )
        return Response(result, status=http_status)


# ---------------------------------------------------------------------------
# POST /api/analytics/activity/anonymise/ — Privacy: anonymise data
# ---------------------------------------------------------------------------

class AnonymiseActivityView(APIView):
    """
    Anonymise all activity events for the authenticated user.

    Scrubs metadata, IP addresses, and user-agent strings while
    preserving aggregate counts.  This action cannot be undone.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        count = anonymise_user_events(request.user.pk)
        return Response(
            {"detail": f"Anonymised {count} activity events."},
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# GET /api/analytics/activity/global/ — Platform-wide summary (admin)
# ---------------------------------------------------------------------------

class GlobalActivitySummaryView(APIView):
    """
    Return platform-wide activity statistics.

    Restricted to staff / admin users.
    """

    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        data = get_global_activity_summary()
        return Response(data, status=status.HTTP_200_OK)


# ============================================================================
# Analytics Calculation Engine Views (Task 10.2)
# ============================================================================

from .analytics_engine import (
    get_opponents_summary,
    get_peak_hours,
    get_performance_insights,
    get_performance_trend,
    get_rivalries,
    get_session_analysis,
    get_win_rate_trend,
)


# ---------------------------------------------------------------------------
# GET /api/analytics/insights/win-rate-trend/
# ---------------------------------------------------------------------------

class WinRateTrendView(APIView):
    """
    Rolling win-rate curve grouped by day.

    Query parameters:
      - ``days`` — lookback window (default 30, max 365)
      - ``game_type`` — ``pong`` | ``tictactoe`` (optional)
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        days = min(int(request.query_params.get("days", 30)), 365)
        game_type = request.query_params.get("game_type")
        data = get_win_rate_trend(request.user.pk, days=days, game_type=game_type)
        return Response(data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# GET /api/analytics/insights/performance-trend/
# ---------------------------------------------------------------------------

class PerformanceTrendView(APIView):
    """
    Weekly composite performance score over time.

    Query parameters:
      - ``days`` — lookback window (default 30, max 365)
      - ``game_type`` — ``pong`` | ``tictactoe`` (optional)
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        days = min(int(request.query_params.get("days", 30)), 365)
        game_type = request.query_params.get("game_type")
        data = get_performance_trend(request.user.pk, days=days, game_type=game_type)
        return Response(data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# GET /api/analytics/insights/peak-hours/
# ---------------------------------------------------------------------------

class PeakHoursView(APIView):
    """
    Hourly and day-of-week activity distributions with peak detection.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        data = get_peak_hours(request.user.pk)
        return Response(data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# GET /api/analytics/insights/sessions/
# ---------------------------------------------------------------------------

class SessionAnalysisView(APIView):
    """
    Play-session clustering and statistics.

    Query parameters:
      - ``days`` — lookback window (default 30, max 365)
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        days = min(int(request.query_params.get("days", 30)), 365)
        data = get_session_analysis(request.user.pk, days=days)
        return Response(data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# GET /api/analytics/insights/opponents/
# ---------------------------------------------------------------------------

class OpponentsSummaryView(APIView):
    """
    Most-played opponents with win/loss breakdown.

    Query parameters:
      - ``limit`` — max opponents (default 10, max 50)
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        limit = min(int(request.query_params.get("limit", 10)), 50)
        data = get_opponents_summary(request.user.pk, limit=limit)
        return Response(data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# GET /api/analytics/insights/rivalries/
# ---------------------------------------------------------------------------

class RivalriesView(APIView):
    """
    Detected rival relationships ranked by rivalry score.

    Query parameters:
      - ``min_matches`` — minimum shared matches to qualify (default 3)
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        min_matches = max(int(request.query_params.get("min_matches", 3)), 2)
        data = get_rivalries(request.user.pk, min_matches=min_matches)
        return Response(data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# GET /api/analytics/insights/recommendations/
# ---------------------------------------------------------------------------

class PerformanceInsightsView(APIView):
    """
    Personalised performance insights and improvement suggestions.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        data = get_performance_insights(request.user.pk)
        return Response(data, status=status.HTTP_200_OK)
