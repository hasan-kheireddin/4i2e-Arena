import json
import logging
from typing import Any

from channels.db import database_sync_to_async
from django.utils import timezone

from apps.games.consumers import BaseConsumer
from .models import Channel, ChannelMembership, Message

logger = logging.getLogger("chat.consumer")


@database_sync_to_async
def get_user_channels(user_id):
    return list(
        Channel.objects.filter(memberships__user_id=user_id)
        .prefetch_related("messages")
        .order_by("-updated_at")
    )


@database_sync_to_async
def create_message(channel_id, sender_id, message_type, content="", emote_id=""):
    return Message.objects.create(
        channel_id=channel_id,
        sender_id=sender_id,
        message_type=message_type,
        content=content,
        emote_id=emote_id,
    )


@database_sync_to_async
def get_messages(channel_id, limit=50):
    return list(
        Message.objects.filter(channel_id=channel_id)
        .select_related("sender")
        .order_by("-created_at")[:limit]
    )


@database_sync_to_async
def is_member(channel_id, user_id):
    return ChannelMembership.objects.filter(
        channel_id=channel_id, user_id=user_id
    ).exists()


@database_sync_to_async
def get_membership(channel_id, user_id):
    try:
        return ChannelMembership.objects.get(channel_id=channel_id, user_id=user_id)
    except ChannelMembership.DoesNotExist:
        return None


@database_sync_to_async
def add_member(channel_id, user_id, role="member"):
    return ChannelMembership.objects.get_or_create(
        channel_id=channel_id,
        user_id=user_id,
        defaults={"role": role},
    )


@database_sync_to_async
def get_or_create_dm_channel(user1_id, user2_id):
    existing = Channel.objects.filter(
        channel_type=Channel.CHANNEL_DM,
        memberships__user_id=user1_id,
    ).filter(memberships__user_id=user2_id).first()
    if existing:
        return existing
    channel = Channel.objects.create(
        channel_type=Channel.CHANNEL_DM,
        name="",
    )
    ChannelMembership.objects.create(channel=channel, user_id=user1_id, role="member")
    ChannelMembership.objects.create(channel=channel, user_id=user2_id, role="member")
    return channel


class ChatConsumer(BaseConsumer):
    require_auth = True

    async def on_connect(self) -> None:
        self._channel_groups: set[str] = set()
        channels = await get_user_channels(self.user.pk)
        for ch in channels:
            group = f"chat_{ch.id}"
            await self.join_group(group)
            self._channel_groups.add(group)
        await self.send_json({
            "type": "connected",
            "channels": [str(ch.id) for ch in channels],
        })

    async def on_disconnect(self, code: int) -> None:
        for group in self._channel_groups:
            await self.leave_group(group)

    async def on_message(self, content: dict[str, Any]) -> None:
        msg_type = content.get("type")

        if msg_type == "send_message":
            await self._handle_send_message(content)
        elif msg_type == "send_emote":
            await self._handle_send_emote(content)
        elif msg_type == "join_channel":
            await self._handle_join_channel(content)
        elif msg_type == "leave_channel":
            await self._handle_leave_channel(content)
        elif msg_type == "get_history":
            await self._handle_get_history(content)
        elif msg_type == "typing":
            await self._handle_typing(content)
        elif msg_type == "ping":
            await self.send_json({"type": "pong"})
        else:
            await self.send_error("unsupported", f"Unknown message type: {msg_type}")

    async def _handle_send_message(self, content: dict[str, Any]) -> None:
        channel_id = content.get("channel_id")
        text = content.get("content", "").strip()
        if not channel_id or not text:
            return
        if not await is_member(channel_id, self.user.pk):
            await self.send_error("forbidden", "Not a member of this channel")
            return
        membership = await get_membership(channel_id, self.user.pk)
        if membership and membership.is_muted:
            await self.send_error("muted", "You are muted in this channel")
            return
        msg = await create_message(channel_id, self.user.pk, Message.MESSAGE_TEXT, content=text)
        event = {
            "type": "chat.message",
            "id": str(msg.id),
            "channel_id": channel_id,
            "sender": str(self.user.pk),
            "sender_username": self.user.username,
            "sender_avatar": self.user.avatar_url or "",
            "message_type": "text",
            "content": text,
            "created_at": msg.created_at.isoformat(),
        }
        await self.channel_layer.group_send(f"chat_{channel_id}", event)

    async def _handle_send_emote(self, content: dict[str, Any]) -> None:
        emote_id = content.get("emote_id", "").strip()
        channel_id = content.get("channel_id", "").strip()
        target_user_id = content.get("target_user_id", "").strip()

        if not emote_id:
            return

        if channel_id:
            if not await is_member(channel_id, self.user.pk):
                await self.send_error("forbidden", "Not a member of this channel")
                return
            msg = await create_message(
                channel_id, self.user.pk, Message.MESSAGE_EMOTE, emote_id=emote_id
            )
            event = {
                "type": "chat.message",
                "id": str(msg.id),
                "channel_id": channel_id,
                "sender": str(self.user.pk),
                "sender_username": self.user.username,
                "sender_avatar": self.user.avatar_url or "",
                "message_type": "emote",
                "emote_id": emote_id,
                "created_at": msg.created_at.isoformat(),
            }
            await self.channel_layer.group_send(f"chat_{channel_id}", event)
        elif target_user_id:
            dm = await get_or_create_dm_channel(self.user.pk, target_user_id)
            group = f"chat_{dm.id}"
            msg = await create_message(
                dm.id, self.user.pk, Message.MESSAGE_EMOTE, emote_id=emote_id
            )
            event = {
                "type": "chat.message",
                "id": str(msg.id),
                "channel_id": str(dm.id),
                "sender": str(self.user.pk),
                "sender_username": self.user.username,
                "sender_avatar": self.user.avatar_url or "",
                "message_type": "emote",
                "emote_id": emote_id,
                "created_at": msg.created_at.isoformat(),
            }
            await self.channel_layer.group_send(group, event)

    async def _handle_join_channel(self, content: dict[str, Any]) -> None:
        channel_id = content.get("channel_id")
        if not channel_id:
            return
        await add_member(channel_id, self.user.pk)
        group = f"chat_{channel_id}"
        if group not in self._channel_groups:
            await self.join_group(group)
            self._channel_groups.add(group)
        await self.send_json({
            "type": "joined",
            "channel_id": channel_id,
        })

    async def _handle_leave_channel(self, content: dict[str, Any]) -> None:
        channel_id = content.get("channel_id")
        if not channel_id:
            return
        group = f"chat_{channel_id}"
        if group in self._channel_groups:
            await self.leave_group(group)
            self._channel_groups.discard(group)
        await self.send_json({
            "type": "left",
            "channel_id": channel_id,
        })

    async def _handle_get_history(self, content: dict[str, Any]) -> None:
        channel_id = content.get("channel_id")
        limit = content.get("limit", 50)
        if not channel_id:
            return
        messages = await get_messages(channel_id, limit)
        await self.send_json({
            "type": "history",
            "channel_id": channel_id,
            "messages": [
                {
                    "id": str(m.id),
                    "channel_id": channel_id,
                    "sender": str(m.sender_id) if m.sender else None,
                    "sender_username": m.sender.username if m.sender else None,
                    "sender_avatar": m.sender.avatar_url if m.sender else "",
                    "message_type": m.message_type,
                    "content": m.content,
                    "emote_id": m.emote_id,
                    "created_at": m.created_at.isoformat(),
                }
                for m in reversed(messages)
            ],
        })

    async def _handle_typing(self, content: dict[str, Any]) -> None:
        channel_id = content.get("channel_id")
        if not channel_id:
            return
        event = {
            "type": "chat.typing",
            "channel_id": channel_id,
            "user_id": str(self.user.pk),
            "username": self.user.username,
        }
        await self.channel_layer.group_send(f"chat_{channel_id}", event)

    async def chat_message(self, event: dict[str, Any]) -> None:
        await self.send_json(event)

    async def chat_typing(self, event: dict[str, Any]) -> None:
        await self.send_json(event)
