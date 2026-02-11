import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    """Custom user model for the ft_transcendence platform."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)  # enforce unique emails
    display_name = models.CharField(unique=True, max_length=50, blank=True, default="")
    avatar_url = models.URLField(max_length=500, blank=True, default="")
    preferred_language = models.CharField(
        max_length=5,
        choices=[("en", "English"), ("fr", "French"), ("ar", "Arabic")],
        default="en",
    )
    xp = models.PositiveIntegerField(default=0, db_index=True)
    level = models.PositiveIntegerField(default=1, db_index=True)
    is_2fa_enabled = models.BooleanField(default=False)
    last_activity = models.DateTimeField(default=timezone.now, db_index=True)

    # Use email as the login field alongside username
    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["email"]

    class Meta:
        db_table = "users"
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return self.username

    def save(self, *args, **kwargs):
        """Normalize email and auto-populate display_name if missing."""
        if self.email:
            self.email = self.email.strip().lower()

        if not self.display_name:
            self.display_name = self.username

        super().save(*args, **kwargs)

    @property
    def is_online(self) -> bool:
        """
        Consider user online if last activity is recent.
        Tune the threshold based on your app (WS pings, page activity, etc.).
        """
        if not self.last_activity:
            return False
        return timezone.now() - self.last_activity <= timezone.timedelta(minutes=2)
