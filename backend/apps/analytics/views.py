# REST API endpoints for the achievement system:
#
#   GET  /api/analytics/achievements/            → Full catalogue with user status
#   GET  /api/analytics/achievements/unlocked/   → User's unlocked achievements
#   GET  /api/analytics/achievements/progress/   → User's progress toward all
#   GET  /api/analytics/achievements/stats/      → Summary statistics
#   GET  /api/analytics/achievements/<id>/       → Single achievement detail

from __future__ import annotations
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
)
from rest_framework import generics, permissions, status
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
)

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
