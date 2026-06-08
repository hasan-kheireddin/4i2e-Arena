from rest_framework import serializers
from .models import Channel, ChannelMembership, Message


class ChannelSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = Channel
        fields = [
            "id", "name", "channel_type", "owner", "created_at",
            "updated_at", "member_count", "last_message",
        ]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]

    def get_member_count(self, obj):
        return obj.memberships.count()

    def get_last_message(self, obj):
        msg = obj.messages.order_by("-created_at").first()
        if msg is None:
            return None
        return {
            "id": str(msg.id),
            "sender": str(msg.sender_id) if msg.sender else None,
            "sender_username": msg.sender.username if msg.sender else None,
            "message_type": msg.message_type,
            "content": msg.content,
            "emote_id": msg.emote_id,
            "created_at": msg.created_at.isoformat(),
        }


class ChannelCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = Channel
        fields = ["id", "name", "channel_type", "password"]

    def validate(self, data):
        if data.get("channel_type") == Channel.CHANNEL_PROTECTED and not data.get("password"):
            raise serializers.ValidationError("Password required for protected channels")
        return data


class ChannelMembershipSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    display_name = serializers.CharField(source="user.display_name", read_only=True)
    avatar_url = serializers.URLField(source="user.avatar_url", read_only=True)

    class Meta:
        model = ChannelMembership
        fields = [
            "id", "user", "username", "display_name", "avatar_url",
            "role", "muted_until", "joined_at",
        ]


class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source="sender.username", read_only=True)
    sender_avatar = serializers.URLField(source="sender.avatar_url", read_only=True)

    class Meta:
        model = Message
        fields = [
            "id", "channel", "sender", "sender_username", "sender_avatar",
            "message_type", "content", "emote_id", "created_at",
        ]
        read_only_fields = ["id", "sender", "created_at"]


class EmoteActionSerializer(serializers.Serializer):
    emote_id = serializers.CharField(max_length=50)
    channel_id = serializers.UUIDField(required=False)
    target_user_id = serializers.UUIDField(required=False)
    game_id = serializers.CharField(max_length=100, required=False)
