import asyncio
import collections
import json
import logging
import os
from datetime import datetime
from typing import Any

from django.utils import timezone

import redis.asyncio as aioredis
from channels.db import database_sync_to_async

from apps.games.consumers import BaseConsumer
from apps.games.session import GameType, create_session_async, generate_game_id
from apps.games.pong_engine import PongEngine
from apps.games.tictactoe_engine import TicTacToeEngine
from .models import Channel, ChannelMembership, Message, Block

logger = logging.getLogger("chat.consumer")

PRESENCE_GROUP = "presence"
ONLINE_USERS_KEY = "chat_online_users"
PRESENCE_TTL_SECONDS = 600
INVITE_TTL_SECONDS = 300
MAX_CHAT_MESSAGE_LENGTH = 2000
MAX_HISTORY_LIMIT = 100
CHAT_ACTION_RATE_LIMIT = 30
CHAT_ACTION_RATE_WINDOW = 10.0
_redis: aioredis.Redis | None = None


def _redis_client() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(
            os.environ.get("REDIS_URL", "redis://redis:6379/0"),
            decode_responses=True,
        )
    return _redis


def _presence_key(user_id: str) -> str:
    return f"chat:presence:{user_id}"


def _invite_key(game_id: str) -> str:
    return f"chat:game_invite:{game_id}"


async def _add_online_user(user_id: str, connection_id: str) -> bool:
    """Register one connection and return True on offline -> online."""
    redis = _redis_client()
    key = _presence_key(user_id)
    was_online = bool(await redis.exists(key))
    pipe = redis.pipeline(transaction=True)
    pipe.sadd(key, connection_id)
    pipe.expire(key, PRESENCE_TTL_SECONDS)
    pipe.sadd(ONLINE_USERS_KEY, user_id)
    await pipe.execute()
    return not was_online


async def _remove_online_user(user_id: str, connection_id: str) -> bool:
    """Remove one connection and return True when the user became offline."""
    redis = _redis_client()
    key = _presence_key(user_id)
    await redis.srem(key, connection_id)
    if await redis.scard(key):
        await redis.expire(key, PRESENCE_TTL_SECONDS)
        return False
    pipe = redis.pipeline(transaction=True)
    pipe.delete(key)
    pipe.srem(ONLINE_USERS_KEY, user_id)
    await pipe.execute()
    return True


async def _get_online_users() -> set[str]:
    redis = _redis_client()
    candidates = {str(value) for value in await redis.smembers(ONLINE_USERS_KEY)}
    if not candidates:
        return set()
    exists = await asyncio.gather(
        *(redis.exists(_presence_key(user_id)) for user_id in candidates)
    )
    online = {uid for uid, present in zip(candidates, exists) if present}
    stale = candidates - online
    if stale:
        await redis.srem(ONLINE_USERS_KEY, *stale)
    return online


@database_sync_to_async
def get_user_channels(user_id):
    return list(
        Channel.objects.filter(memberships__user_id=user_id)
        .order_by("-updated_at")
    )


@database_sync_to_async
def create_message(channel_id, sender_id, message_type, content="", emote_id="", game_id="", game_type=""):
    return Message.objects.create(
        channel_id=channel_id,
        sender_id=sender_id,
        message_type=message_type,
        content=content,
        emote_id=emote_id,
        game_id=game_id,
        game_type=game_type,
    )


@database_sync_to_async
def get_messages(channel_id, limit=50):
    return list(
        Message.objects.filter(channel_id=channel_id)
        .select_related("sender")
        .order_by("-created_at")[:limit]
    )


@database_sync_to_async
def update_invite_message(channel_id, game_id, new_content, new_type):
    try:
        msg = Message.objects.get(channel_id=channel_id, game_id=game_id)
        msg_id = str(msg.id)
        msg.content = new_content
        msg.message_type = new_type
        msg.game_id = ""
        msg.game_type = ""
        msg.save(update_fields=["content", "message_type", "game_id", "game_type"])
        return msg_id
    except Message.DoesNotExist:
        return None


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
    from django.db import transaction
    user1_id, user2_id = sorted([str(user1_id), str(user2_id)])
    with transaction.atomic():
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

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._channel_groups: set[str] = set()

    async def on_connect(self) -> None:
        self._action_timestamps: collections.deque[float] = collections.deque()
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
        became_online = await _add_online_user(str(self.user.pk), self.channel_name)
        online_users = await _get_online_users()

        await self.send_json({
            "type": "connected",
            "channels": [str(ch.id) for ch in channels],
            "online_user_ids": list(online_users),
        })

        # Notify others
        if became_online:
            await self.channel_layer.group_send(PRESENCE_GROUP, {
                "type": "chat.user_online",
                "user_id": str(self.user.pk),
                "username": self.user.username,
            })

    async def on_disconnect(self, code: int) -> None:
        became_offline = await _remove_online_user(
            str(self.user.pk), self.channel_name,
        )
        for group in self._channel_groups:
            await self.leave_group(group)
        if became_offline:
            await self.channel_layer.group_send(PRESENCE_GROUP, {
                "type": "chat.user_offline",
                "user_id": str(self.user.pk),
                "username": self.user.username,
            })

    async def on_message(self, content: dict[str, Any]) -> None:
        msg_type = content.get("type")

        if msg_type in {
            "send_message",
            "send_emote",
            "join_channel",
            "typing",
            "game_invite",
            "game_invite_response",
        } and self._is_action_rate_limited():
            await self.send_error("rate_limited", "Too many real-time actions")
            return

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
            online_users = await _get_online_users()
            await self.send_json({
                "type": "presence_list",
                "online_user_ids": list(online_users),
            })
        elif msg_type == "ping":
            await _add_online_user(str(self.user.pk), self.channel_name)
            await self.send_json({
                "type": "pong",
                "client_ts_ms": content.get("client_ts_ms"),
            })
        elif msg_type == "game_invite":
            await self._handle_game_invite(content)
        elif msg_type == "game_invite_response":
            await self._handle_game_invite_response(content)
        else:
            await self.send_error("unsupported", f"Unknown message type: {msg_type}")

    def _is_action_rate_limited(self) -> bool:
        now = asyncio.get_running_loop().time()
        cutoff = now - CHAT_ACTION_RATE_WINDOW
        while self._action_timestamps and self._action_timestamps[0] <= cutoff:
            self._action_timestamps.popleft()
        if len(self._action_timestamps) >= CHAT_ACTION_RATE_LIMIT:
            return True
        self._action_timestamps.append(now)
        return False

    async def _handle_game_invite(self, content: dict[str, Any]) -> None:
        target_user_id = str(content.get("target_user_id") or "")
        game_type = content.get("game_type", "pong")
        if not target_user_id:
            await self.send_error("invalid_target", "A target user is required")
            return
        if game_type not in {"pong", "pong3d", "tictactoe"}:
            await self.send_error("invalid_game_type", "Unsupported game type")
            return
        if target_user_id == str(self.user.pk):
            await self.send_error("invalid_target", "You cannot invite yourself")
            return
        if (
            await is_blocked(self.user.pk, target_user_id)
            or await is_blocked(target_user_id, self.user.pk)
        ):
            await self.send_error("blocked", "Cannot invite this user")
            return
        from django.contrib.auth import get_user_model
        try:
            target_user = await database_sync_to_async(get_user_model().objects.get)(pk=target_user_id)
        except get_user_model().DoesNotExist:
            await self.send_error("invalid_target", "User does not exist")
            return
        dm = await get_or_create_dm_channel(self.user.pk, target_user_id)
        group = f"chat_{dm.id}"
        if group not in self._channel_groups:
            await self.join_group(group)
            self._channel_groups.add(group)
        invite_game_id = generate_game_id()
        invite = {
            "game_id": invite_game_id,
            "game_type": game_type,
            "channel_id": str(dm.id),
            "from_user_id": str(self.user.pk),
            "target_user_id": str(target_user.id),
        }
        await _redis_client().set(
            _invite_key(invite_game_id),
            json.dumps(invite),
            ex=INVITE_TTL_SECONDS,
        )
        msg = await create_message(
            dm.id, self.user.pk, Message.MESSAGE_GAME_INVITE,
            content=f"{self.user.username} invited you to play {game_type}",
            game_id=invite_game_id, game_type=game_type,
        )
        event = {
            "type": "chat.message",
            "id": str(msg.id),
            "channel_id": str(dm.id),
            "sender": str(self.user.pk),
            "sender_username": self.user.username,
            "message_type": "game_invite",
            "content": f"{self.user.username} invited you to play {game_type}",
            "created_at": msg.created_at.isoformat(),
            "game_id": invite_game_id,
            "game_type": game_type,
        }
        await self.channel_layer.group_send(group, event)
        await self.channel_layer.group_send(f"user_{target_user.id}", {
            "type": "chat.game_invite",
            "from_user_id": str(self.user.pk),
            "from_username": self.user.username,
            "target_user_id": str(target_user.id),
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
        accept = content.get("accept") is True
        raw_game_type = str(content.get("game_type", ""))
        channel_id = str(content.get("channel_id") or "")
        game_id = str(content.get("game_id") or "")

        if not channel_id or not game_id:
            await self.send_error("invalid_invite", "Invite details are missing")
            return

        raw_invite = await _redis_client().get(_invite_key(game_id))
        if not raw_invite:
            await self.send_error("invite_expired", "This invitation expired or was already used")
            return
        try:
            invite = json.loads(raw_invite)
        except (TypeError, json.JSONDecodeError):
            await self.send_error("invalid_invite", "Invitation data is invalid")
            return
        if (
            invite.get("target_user_id") != str(self.user.pk)
            or invite.get("channel_id") != channel_id
            or invite.get("game_type") != raw_game_type
        ):
            await self.send_error("forbidden", "You are not the recipient of this invitation")
            return
        if not await is_member(channel_id, self.user.pk):
            await self.send_error("forbidden", "You are not a member of the invitation channel")
            return

        # Consume before creating the session so a response is single-use.
        await _redis_client().delete(_invite_key(game_id))

        group = f"chat_{channel_id}"
        if group not in self._channel_groups:
            await self.join_group(group)
            self._channel_groups.add(group)
        game_type = "pong" if raw_game_type == "pong3d" else raw_game_type

        if accept:
            try:
                if game_type == "pong":
                    await create_session_async(
                        game_type=GameType.PONG,
                        engine=PongEngine(),
                        game_id=game_id,
                        authorized_player_ids={
                            invite["from_user_id"], invite["target_user_id"],
                        },
                    )
                elif game_type == "tictactoe":
                    await create_session_async(
                        game_type=GameType.TICTACTOE,
                        engine=TicTacToeEngine(),
                        game_id=game_id,
                        authorized_player_ids={
                            invite["from_user_id"], invite["target_user_id"],
                        },
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
            other_user_id = invite["from_user_id"]
            opponent_username = "Opponent"
            if other_user_id:
                try:
                    other = await database_sync_to_async(
                        get_user_model().objects.get
                    )(pk=other_user_id)
                    opponent_username = other.username
                except get_user_model().DoesNotExist:
                    pass

            msg_id = await update_invite_message(
                channel_id, game_id,
                f"{self.user.username} accepted the game invite!",
                Message.MESSAGE_SYSTEM,
            )
            if msg_id:
                await self.channel_layer.group_send(group, {
                    "type": "chat.message",
                    "id": msg_id, "channel_id": channel_id,
                    "sender": None, "sender_username": None,
                    "message_type": "system",
                    "content": f"{self.user.username} accepted the game invite!",
                    "emote_id": "",
                    "created_at": timezone.now().isoformat(),
                })
            await self.channel_layer.group_send(group, {
                "type": "chat.game_invite_accepted",
                "game_id": game_id,
                "game_type": raw_game_type,
                "from_user_id": invite["from_user_id"],
                "from_username": opponent_username,
                "target_user_id": invite["target_user_id"],
                "target_username": self.user.username,
                "accepted_by": str(self.user.pk),
                "accepted_by_username": self.user.username,
            })
        else:
            msg_id = await update_invite_message(
                channel_id, game_id,
                f"{self.user.username} declined the game invite.",
                Message.MESSAGE_SYSTEM,
            )
            if msg_id:
                await self.channel_layer.group_send(group, {
                    "type": "chat.message",
                    "id": msg_id, "channel_id": channel_id,
                    "sender": None, "sender_username": None,
                    "message_type": "system",
                    "content": f"{self.user.username} declined the game invite.",
                    "emote_id": "",
                    "created_at": timezone.now().isoformat(),
                })
            await self.channel_layer.group_send(group, {
                "type": "chat.game_invite_declined",
                "game_id": game_id,
                "game_type": raw_game_type,
                "declined_by": str(self.user.pk),
                "declined_by_username": self.user.username,
            })

    async def _handle_send_message(self, content: dict[str, Any]) -> None:
        channel_id = content.get("channel_id")
        raw_text = content.get("content", "")
        if not isinstance(raw_text, str):
            await self.send_error("invalid_message", "Message content must be text")
            return
        text = raw_text.strip()
        if not channel_id or not text:
            return
        if len(text) > MAX_CHAT_MESSAGE_LENGTH:
            await self.send_error(
                "message_too_long",
                f"Messages are limited to {MAX_CHAT_MESSAGE_LENGTH} characters",
            )
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
            "message_type": "text",
            "content": text,
            "created_at": msg.created_at.isoformat(),
        }
        await self.channel_layer.group_send(f"chat_{channel_id}", event)

    async def _handle_send_emote(self, content: dict[str, Any]) -> None:
        emote_raw = content.get("emote_id", "")
        channel_raw = content.get("channel_id", "")
        target_raw = content.get("target_user_id", "")
        emote_id = emote_raw.strip() if isinstance(emote_raw, str) else ""
        channel_id = channel_raw.strip() if isinstance(channel_raw, str) else ""
        target_user_id = target_raw.strip() if isinstance(target_raw, str) else ""

        if not emote_id or len(emote_id) > 50:
            await self.send_error("invalid_emote", "Invalid emote identifier")
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
                "message_type": "emote",
                "emote_id": emote_id,
                "created_at": msg.created_at.isoformat(),
            }
            await self.channel_layer.group_send(f"chat_{channel_id}", event)
        elif target_user_id:
            if await is_blocked(self.user.pk, target_user_id) or await is_blocked(target_user_id, self.user.pk):
                await self.send_error("blocked", "Cannot send message to this user")
                return
            from django.contrib.auth import get_user_model
            if not await database_sync_to_async(
                get_user_model().objects.filter(pk=target_user_id).exists
            )():
                await self.send_error("invalid_target", "User does not exist")
                return
            dm = await get_or_create_dm_channel(self.user.pk, target_user_id)
            group = f"chat_{dm.id}"
            if group not in self._channel_groups:
                await self.join_group(group)
                self._channel_groups.add(group)
            msg = await create_message(
                dm.id, self.user.pk, Message.MESSAGE_EMOTE, emote_id=emote_id
            )
            event = {
                "type": "chat.message",
                "id": str(msg.id),
                "channel_id": str(dm.id),
                "sender": str(self.user.pk),
                "sender_username": self.user.username,
                "message_type": "emote",
                "emote_id": emote_id,
                "created_at": msg.created_at.isoformat(),
            }
            await self.channel_layer.group_send(group, event)
            await self.channel_layer.group_send(f"user_{target_user_id}", event)

    async def _handle_join_channel(self, content: dict[str, Any]) -> None:
        channel_id = content.get("channel_id")
        if not channel_id:
            return
        if not await is_member(channel_id, self.user.pk):
            if await get_channel_type(channel_id) != Channel.CHANNEL_PUBLIC:
                await self.send_error(
                    "forbidden",
                    "Join the channel through its authenticated API flow first",
                )
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
        if not await is_member(channel_id, self.user.pk):
            await self.send_error("forbidden", "Not a member of this channel")
            return
        if not isinstance(limit, int) or isinstance(limit, bool):
            limit = 50
        limit = max(1, min(limit, MAX_HISTORY_LIMIT))
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
                    "message_type": m.message_type,
                    "content": m.content,
                    "emote_id": m.emote_id,
                    "game_id": m.game_id or "",
                    "game_type": m.game_type or "",
                    "created_at": m.created_at.isoformat(),
                }
                for m in reversed(messages)
            ],
        })

    async def _handle_typing(self, content: dict[str, Any]) -> None:
        channel_id = content.get("channel_id")
        if not channel_id:
            return
        if not await is_member(channel_id, self.user.pk):
            await self.send_error("forbidden", "Not a member of this channel")
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
        is_inviter = str(self.user.pk) == event.get("from_user_id")
        await self.send_json({
            "type": "game_invite_accepted",
            "game_id": event.get("game_id"),
            "game_type": event.get("game_type"),
            "opponent_id": (
                event.get("target_user_id") if is_inviter else event.get("from_user_id")
            ),
            "opponent_username": (
                event.get("target_username") if is_inviter else event.get("from_username")
            ),
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

    async def chat_friend_removed(self, event: dict[str, Any]) -> None:
        if str(self.user.pk) == event.get("target_user_id"):
            await self.send_json({
                "type": "friend_request_removed",
                "friendship_id": event.get("friendship_id"),
                "removed_by": event.get("removed_by"),
            })

    async def chat_unblocked(self, event: dict[str, Any]) -> None:
        if str(self.user.pk) == event.get("target_user_id"):
            await self.send_json({
                "type": "unblocked",
                "unblocked_by": event.get("unblocked_by"),
            })
