import json
import logging
from typing import Any

from channels.db import database_sync_to_async
from django.core.cache import cache
from django.utils import timezone

from apps.games.consumers import BaseConsumer
from apps.games.session import GameType, create_session_async, generate_game_id
from apps.games.pong_engine import PongEngine
from apps.games.tictactoe_engine import TicTacToeEngine
from .models import Channel, ChannelMembership, Message, Block

logger = logging.getLogger("chat.consumer")

PRESENCE_GROUP = "presence"
ONLINE_USERS_KEY = "chat_online_users"


def _add_online_user(user_id: str) -> None:
    users: set[str] = cache.get(ONLINE_USERS_KEY, set())
    users.add(str(user_id))
    cache.set(ONLINE_USERS_KEY, users, timeout=None)


def _remove_online_user(user_id: str) -> None:
    users: set[str] = cache.get(ONLINE_USERS_KEY, set())
    users.discard(str(user_id))
    cache.set(ONLINE_USERS_KEY, users, timeout=None)


def _get_online_users() -> set[str]:
    return cache.get(ONLINE_USERS_KEY, set())


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
def is_blocked(blocker_id, blocked_id):
    return Block.objects.filter(blocker_id=blocker_id, blocked_id=blocked_id).exists()


@database_sync_to_async
def get_channel_type(channel_id):
    try:
        return Channel.objects.values_list("channel_type", flat=True).get(id=channel_id)
    except Channel.DoesNotExist:
        return None


@database_sync_to_async
def get_dm_other_user(channel_id, current_user_id):
    return ChannelMembership.objects.filter(
        channel_id=channel_id
    ).exclude(user_id=current_user_id).values_list("user_id", flat=True).first()


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

        # Join presence group + personal group
        await self.join_group(PRESENCE_GROUP)
        personal_group = f"user_{self.user.pk}"
        await self.join_group(personal_group)
        self._channel_groups.add(personal_group)

        # Track online
        _add_online_user(str(self.user.pk))
        online_users = _get_online_users()

        await self.send_json({
            "type": "connected",
            "channels": [str(ch.id) for ch in channels],
            "online_user_ids": list(online_users),
        })

        # Notify others
        await self.channel_layer.group_send(PRESENCE_GROUP, {
            "type": "chat.user_online",
            "user_id": str(self.user.pk),
            "username": self.user.username,
        })

    async def on_disconnect(self, code: int) -> None:
        _remove_online_user(str(self.user.pk))
        for group in self._channel_groups:
            await self.leave_group(group)
        await self.channel_layer.group_send(PRESENCE_GROUP, {
            "type": "chat.user_offline",
            "user_id": str(self.user.pk),
            "username": self.user.username,
        })

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
        elif msg_type == "request_presence":
            online_users = _get_online_users()
            await self.send_json({
                "type": "presence_list",
                "online_user_ids": list(online_users),
            })
        elif msg_type == "ping":
            await self.send_json({"type": "pong"})
        elif msg_type == "game_invite":
            await self._handle_game_invite(content)
        elif msg_type == "game_invite_response":
            await self._handle_game_invite_response(content)
        else:
            await self.send_error("unsupported", f"Unknown message type: {msg_type}")

    async def _handle_game_invite(self, content: dict[str, Any]) -> None:
        target_user_id = content.get("target_user_id")
        game_type = content.get("game_type", "pong")
        if not target_user_id:
            return
        from django.contrib.auth import get_user_model
        try:
            target_user = await database_sync_to_async(get_user_model().objects.get)(pk=target_user_id)
        except get_user_model().DoesNotExist:
            return
        dm = await get_or_create_dm_channel(self.user.pk, target_user_id)
        group = f"chat_{dm.id}"
        if group not in self._channel_groups:
            await self.join_group(group)
            self._channel_groups.add(group)
        invite_game_id = generate_game_id()
        msg = await create_message(
            dm.id, self.user.pk, Message.MESSAGE_SYSTEM,
            content=f"{self.user.username} invited you to play {game_type}",
        )
        event = {
            "type": "chat.message",
            "id": str(msg.id),
            "channel_id": str(dm.id),
            "sender": None,
            "sender_username": None,
            "sender_avatar": "",
            "message_type": "system",
            "content": f"{self.user.username} invited you to play {game_type}",
            "created_at": msg.created_at.isoformat(),
        }
        await self.channel_layer.group_send(group, event)
        await self.channel_layer.group_send(group, {
            "type": "chat.game_invite",
            "from_user_id": str(self.user.pk),
            "from_username": self.user.username,
            "target_user_id": target_user_id,
            "game_type": game_type,
            "channel_id": str(dm.id),
            "game_id": invite_game_id,
        })
        await self.send_json({
            "type": "game_invite_sent",
            "target_user_id": target_user_id,
            "game_type": game_type,
            "game_id": invite_game_id,
        })

    async def _handle_game_invite_response(self, content: dict[str, Any]) -> None:
        accept = content.get("accept", False)
        raw_game_type = content.get("game_type", "pong")
        channel_id = content.get("channel_id")
        game_id = content.get("game_id", "")

        if not channel_id or not game_id:
            return

        group = f"chat_{channel_id}"
        game_type = "pong" if raw_game_type == "pong3d" else raw_game_type

        if accept:
            try:
                if game_type == "pong":
                    await create_session_async(
                        game_type=GameType.PONG,
                        engine=PongEngine(),
                        game_id=game_id,
                    )
                elif game_type == "tictactoe":
                    await create_session_async(
                        game_type=GameType.TICTACTOE,
                        engine=TicTacToeEngine(),
                        game_id=game_id,
                    )
                else:
                    return
            except ValueError:
                pass
            except Exception:
                logger.exception("Failed to create game session for invite")
                await self.send_json({
                    "type": "game_invite_error",
                    "message": "Failed to create game session",
                })
                return

            from django.contrib.auth import get_user_model
            other_user_id = await get_dm_other_user(channel_id, self.user.pk)
            sender_id = str(self.user.pk)
            sender_username = self.user.username
            opponent_id = sender_id
            opponent_username = sender_username
            if other_user_id:
                try:
                    other = await database_sync_to_async(
                        get_user_model().objects.get
                    )(pk=other_user_id)
                    opponent_id = str(other.pk)
                    opponent_username = other.username
                except get_user_model().DoesNotExist:
                    pass

            await self.channel_layer.group_send(group, {
                "type": "chat.game_invite_accepted",
                "game_id": game_id,
                "game_type": raw_game_type,
                "opponent_id": opponent_id,
                "opponent_username": opponent_username,
                "accepted_by": str(self.user.pk),
                "accepted_by_username": self.user.username,
            })
        else:
            await self.channel_layer.group_send(group, {
                "type": "chat.game_invite_declined",
                "game_id": game_id,
                "game_type": raw_game_type,
                "declined_by": str(self.user.pk),
                "declined_by_username": self.user.username,
            })

    async def _handle_send_message(self, content: dict[str, Any]) -> None:
        channel_id = content.get("channel_id")
        text = content.get("content", "").strip()
        if not channel_id or not text:
            return
        if not await is_member(channel_id, self.user.pk):
            await self.send_error("forbidden", "Not a member of this channel")
            return
        ctype = await get_channel_type(channel_id)
        if ctype == Channel.CHANNEL_DM:
            other_id = await get_dm_other_user(channel_id, self.user.pk)
            if other_id and (await is_blocked(self.user.pk, other_id) or await is_blocked(other_id, self.user.pk)):
                await self.send_error("blocked", "Cannot send message to this user")
                return
        if ctype != Channel.CHANNEL_DM:
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
            ctype = await get_channel_type(channel_id)
            if ctype == Channel.CHANNEL_DM:
                other_id = await get_dm_other_user(channel_id, self.user.pk)
                if other_id and (await is_blocked(self.user.pk, other_id) or await is_blocked(other_id, self.user.pk)):
                    await self.send_error("blocked", "Cannot send emote to this user")
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
            if await is_blocked(self.user.pk, target_user_id) or await is_blocked(target_user_id, self.user.pk):
                await self.send_error("blocked", "Cannot send message to this user")
                return
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

    async def chat_game_invite(self, event: dict[str, Any]) -> None:
        if str(self.user.pk) == event.get("target_user_id"):
            await self.send_json({
                "type": "game_invite",
                "from_user_id": event.get("from_user_id"),
                "from_username": event.get("from_username"),
                "game_type": event.get("game_type"),
                "channel_id": event.get("channel_id"),
                "game_id": event.get("game_id"),
            })

    async def chat_game_invite_accepted(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "game_invite_accepted",
            "game_id": event.get("game_id"),
            "game_type": event.get("game_type"),
            "opponent_id": event.get("opponent_id"),
            "opponent_username": event.get("opponent_username"),
            "accepted_by": event.get("accepted_by"),
            "accepted_by_username": event.get("accepted_by_username"),
        })

    async def chat_game_invite_declined(self, event: dict[str, Any]) -> None:
        if str(self.user.pk) != event.get("declined_by"):
            await self.send_json({
                "type": "game_invite_declined",
                "game_type": event.get("game_type"),
                "declined_by": event.get("declined_by"),
                "declined_by_username": event.get("declined_by_username"),
            })

    async def chat_kicked(self, event: dict[str, Any]) -> None:
        if str(self.user.pk) == event.get("user_id"):
            group = f"chat_{event.get('channel_id')}"
            if group in self._channel_groups:
                await self.leave_group(group)
                self._channel_groups.discard(group)
            await self.send_json({
                "type": "kicked",
                "channel_id": event.get("channel_id"),
            })

    # ── Presence handlers ──────────────────────────────────────────────

    async def chat_user_online(self, event: dict[str, Any]) -> None:
        if str(self.user.pk) != event.get("user_id"):
            await self.send_json({
                "type": "user_online",
                "user_id": event.get("user_id"),
                "username": event.get("username"),
            })

    async def chat_user_offline(self, event: dict[str, Any]) -> None:
        if str(self.user.pk) != event.get("user_id"):
            await self.send_json({
                "type": "user_offline",
                "user_id": event.get("user_id"),
                "username": event.get("username"),
            })

    # ── Friend request handlers ────────────────────────────────────────

    async def chat_friend_request(self, event: dict[str, Any]) -> None:
        if str(self.user.pk) == event.get("target_user_id"):
            await self.send_json({
                "type": "friend_request_received",
                "friendship_id": event.get("friendship_id"),
                "from_user_id": event.get("from_user_id"),
                "from_username": event.get("from_username"),
                "from_display_name": event.get("from_display_name"),
                "from_avatar": event.get("from_avatar"),
            })

    async def chat_read_receipt(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "read_receipt",
            "channel_id": event.get("channel_id"),
            "read_until": event.get("read_until"),
        })

    async def chat_friend_accepted(self, event: dict[str, Any]) -> None:
        if str(self.user.pk) == event.get("target_user_id"):
            await self.send_json({
                "type": "friend_request_accepted",
                "friendship_id": event.get("friendship_id"),
                "by_user_id": event.get("by_user_id"),
                "by_username": event.get("by_username"),
            })
