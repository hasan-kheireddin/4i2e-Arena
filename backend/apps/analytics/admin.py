from django.contrib import admin
from .models import Achievement, AchievementProgress, AchievementUnlock

@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "key",
        "category",
        "tier",
        "xp_reward",
        "threshold",
        "is_hidden",
    ]
    list_filter = ["category", "tier", "is_hidden"]
    search_fields = ["name", "key", "description"]
    readonly_fields = ["id", "created_at"]
    ordering = ["category", "ordering_priority"]


@admin.register(AchievementUnlock)
class AchievementUnlockAdmin(admin.ModelAdmin):
    list_display = ["user", "achievement", "unlocked_at", "game_session_id"]
    list_filter = ["achievement__category", "achievement__tier"]
    search_fields = [
        "user__username",
        "achievement__name",
        "achievement__key",
    ]
    readonly_fields = ["id", "unlocked_at"]
    raw_id_fields = ["user", "achievement"]


@admin.register(AchievementProgress)
class AchievementProgressAdmin(admin.ModelAdmin):
    list_display = ["user", "achievement", "current", "updated_at"]
    list_filter = ["achievement__category"]
    search_fields = [
        "user__username",
        "achievement__name",
        "achievement__key",
    ]
    readonly_fields = ["id", "updated_at"]
    raw_id_fields = ["user", "achievement"]
