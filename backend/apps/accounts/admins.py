from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import OAuthAccount, TOTPDevice, User

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
    list_filter = BaseUserAdmin.list_filter + ("is_2fa_enabled", "level")
    readonly_fields = ("is_online", "last_activity")
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
                    "last_activity",
                )
            },
        ),
    )

@admin.register(OAuthAccount)
class OAuthAccountAdmin(admin.ModelAdmin):
    """Admin configuration for OAuth linked accounts."""

    list_display = ("user", "provider", "provider_user_id", "created_at")
    list_filter = ("provider",)
    search_fields = ("user__username", "user__email", "provider_user_id")
    raw_id_fields = ("user",)


@admin.register(TOTPDevice)
class TOTPDeviceAdmin(admin.ModelAdmin):
    """Admin configuration for TOTP 2FA devices."""

    list_display = ("user", "confirmed", "remaining_recovery_codes", "created_at")
    list_filter = ("confirmed",)
    search_fields = ("user__username", "user__email")
    raw_id_fields = ("user",)
    readonly_fields = ("encrypted_secret", "recovery_codes", "created_at")
