from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Admin configuration for the custom User model."""

    list_display = (
        "username",
        "email",
        "display_name",
        "level",
        "xp",
        "is_online",
        "is_2fa_enabled",
    )
    list_filter = BaseUserAdmin.list_filter + ("is_online", "is_2fa_enabled", "level")
    readonly_fields = ("xp", "level", "last_activity")
    ordering = ("-last_activity",)
    fieldsets = BaseUserAdmin.fieldsets + (
        (
            "ft_transcendence",
            {
                "fields": (
                    "display_name",
                    "avatar_url",
                    "preferred_language",
                    "xp",
                    "level",
                    "is_2fa_enabled",
                    "is_online",
                    "last_activity",
                )
            },
        ),
    )
