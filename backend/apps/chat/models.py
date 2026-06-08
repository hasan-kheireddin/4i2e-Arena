import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


class Channel(models.Model):
    CHANNEL_PUBLIC = "public"
    CHANNEL_PRIVATE = "private"
    CHANNEL_PROTECTED = "protected"
    CHANNEL_DM = "dm"
    CHANNEL_GAME = "game"

    CHANNEL_TYPES = [
        (CHANNEL_PUBLIC, "Public"),
        (CHANNEL_PRIVATE, "Private"),
        (CHANNEL_PROTECTED, "Protected"),
        (CHANNEL_DM, "Direct Message"),
        (CHANNEL_GAME, "Game"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=50, blank=True, default="")
    channel_type = models.CharField(max_length=20, choices=CHANNEL_TYPES, default=CHANNEL_PUBLIC)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="owned_channels",
    )
    password_hash = models.CharField(max_length=128, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "chat_channels"
        verbose_name = "Channel"
        verbose_name_plural = "Channels"

    def __str__(self):
        return self.name or f"{self.get_channel_type_display()} ({self.id})"


class ChannelMembership(models.Model):
    ROLE_MEMBER = "member"
    ROLE_ADMIN = "admin"
    ROLE_OWNER = "owner"

    ROLE_CHOICES = [
        (ROLE_MEMBER, "Member"),
        (ROLE_ADMIN, "Admin"),
        (ROLE_OWNER, "Owner"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    channel = models.ForeignKey(
        Channel, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="channel_memberships",
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default=ROLE_MEMBER)
    muted_until = models.DateTimeField(null=True, blank=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "chat_memberships"
        unique_together = [("channel", "user")]
        verbose_name = "Channel Membership"
        verbose_name_plural = "Channel Memberships"

    def __str__(self):
        return f"{self.user.username} in {self.channel}"

    @property
    def is_muted(self) -> bool:
        if self.muted_until is None:
            return False
        return timezone.now() < self.muted_until


class Message(models.Model):
    MESSAGE_TEXT = "text"
    MESSAGE_EMOTE = "emote"
    MESSAGE_SYSTEM = "system"

    MESSAGE_TYPES = [
        (MESSAGE_TEXT, "Text"),
        (MESSAGE_EMOTE, "Emote"),
        (MESSAGE_SYSTEM, "System"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    channel = models.ForeignKey(
        Channel, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sent_messages",
    )
    message_type = models.CharField(max_length=10, choices=MESSAGE_TYPES, default=MESSAGE_TEXT)
    content = models.TextField(blank=True, default="")
    emote_id = models.CharField(max_length=50, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "chat_messages"
        ordering = ["created_at"]
        verbose_name = "Message"
        verbose_name_plural = "Messages"

    def __str__(self):
        if self.message_type == self.MESSAGE_EMOTE:
            return f"[emote:{self.emote_id}] from {self.sender}"
        return f"{self.content[:50]} from {self.sender}"
