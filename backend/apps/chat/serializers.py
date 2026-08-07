from rest_framework import serializers
from .models import Channel, ChannelMembership, Message, Block, Friendship


class ChannelSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    dm_partner = serializers.SerializerMethodField()
    read_until = serializers.SerializerMethodField()
    membership_id = serializers.SerializerMethodField()
    muted_until = serializers.SerializerMethodField()
    notifications_muted = serializers.SerializerMethodField()

    class Meta:
        model = Channel
        fields = [
            "id", "name", "channel_type", "owner", "created_at",
            "updated_at", "member_count", "last_message",
            "unread_count", "dm_partner", "read_until",
            "membership_id", "muted_until", "notifications_muted",
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

    def get_unread_count(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return 0
        membership = obj.memberships.filter(user=request.user).first()
        if not membership:
            return 0
        if membership.read_until:
            return obj.messages.filter(created_at__gt=membership.read_until).count()
        return obj.messages.count()

    def get_read_until(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        membership = obj.memberships.filter(user=request.user).first()
        if membership and membership.read_until:
            return membership.read_until.isoformat()
        return None

    def get_dm_partner(self, obj):
        if obj.channel_type != Channel.CHANNEL_DM:
            return None
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        other = obj.memberships.exclude(user=request.user).first()
        if not other:
            return None
        return {
            "id": str(other.user.id),
            "username": other.user.username,
            "display_name": other.user.display_name,
            "read_until": other.read_until.isoformat() if other.read_until else None,
        }

    def get_membership_id(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        membership = obj.memberships.filter(user=request.user).first()
        if not membership:
            return None
        return str(membership.id)

    def get_muted_until(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        membership = obj.memberships.filter(user=request.user).first()
        if not membership or not membership.muted_until:
            return None
        return membership.muted_until.isoformat()

    def get_notifications_muted(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        membership = obj.memberships.filter(user=request.user).first()
        if not membership:
            return False
        return membership.notifications_muted


class ChannelMembershipSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    display_name = serializers.CharField(source="user.display_name", read_only=True)

    class Meta:
        model = ChannelMembership
        fields = [
            "id", "user", "username", "display_name",
            "role", "muted_until", "joined_at",
        ]


class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source="sender.username", read_only=True)

    class Meta:
        model = Message
        fields = [
            "id", "channel", "sender", "sender_username",
            "message_type", "content", "emote_id", "created_at",
        ]
        read_only_fields = ["id", "sender", "created_at"]


class EmoteActionSerializer(serializers.Serializer):
    emote_id = serializers.CharField(max_length=50)
    channel_id = serializers.UUIDField(required=False)
    target_user_id = serializers.UUIDField(required=False)
    game_id = serializers.CharField(max_length=100, required=False)


class FriendshipSerializer(serializers.ModelSerializer):
    other_user_id = serializers.SerializerMethodField()
    other_username = serializers.SerializerMethodField()
    other_display_name = serializers.SerializerMethodField()
    direction = serializers.SerializerMethodField()

    class Meta:
        model = Friendship
        fields = [
            "id", "from_user", "to_user", "other_user_id", "other_username",
            "other_display_name", "status", "direction",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "from_user", "created_at", "updated_at"]

    def get_other_user_id(self, obj):
        request = self.context.get("request")
        user = request.user if request else None
        if user == obj.from_user:
            return str(obj.to_user.id)
        return str(obj.from_user.id)

    def get_other_username(self, obj):
        request = self.context.get("request")
        user = request.user if request else None
        if user == obj.from_user:
            return obj.to_user.username
        return obj.from_user.username

    def get_other_display_name(self, obj):
        request = self.context.get("request")
        user = request.user if request else None
        if user == obj.from_user:
            return obj.to_user.display_name
        return obj.from_user.display_name

    def get_direction(self, obj):
        request = self.context.get("request")
        user = request.user if request else None
        if user == obj.from_user:
            return "sent"
        return "received"


class BlockSerializer(serializers.ModelSerializer):
    blocked_username = serializers.CharField(source="blocked.username", read_only=True)
    blocked_display_name = serializers.CharField(source="blocked.display_name", read_only=True)
    blocker = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Block
        fields = [
            "id", "blocker", "blocked", "blocked_username", "blocked_display_name",
            "created_at",
        ]
        read_only_fields = ["id", "blocker", "created_at"]
