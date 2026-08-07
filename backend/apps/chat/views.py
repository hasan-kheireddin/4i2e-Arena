from django.db import models
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, mixins, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .models import Channel, ChannelMembership, Message, Block, Friendship


def get_or_create_dm_channel_sync(user1_id, user2_id):
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
from .serializers import (
    ChannelSerializer,
    ChannelCreateSerializer,
    ChannelMembershipSerializer,
    MessageSerializer,
    BlockSerializer,
    FriendshipSerializer,
)
from django.utils import timezone


class ChannelViewSet(mixins.CreateModelMixin,
                     mixins.ListModelMixin,
                     mixins.RetrieveModelMixin,
                     mixins.DestroyModelMixin,
                     viewsets.GenericViewSet):
    queryset = Channel.objects.all()
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == "create":
            return ChannelCreateSerializer
        return ChannelSerializer

    def get_queryset(self):
        if self.action == "join":
            return Channel.objects.filter(
                channel_type__in=(Channel.CHANNEL_PUBLIC, Channel.CHANNEL_PROTECTED),
            )
        return Channel.objects.filter(
            models.Q(channel_type=Channel.CHANNEL_PUBLIC) |
            models.Q(memberships__user=self.request.user)
        ).distinct()

    def perform_create(self, serializer):
        channel = serializer.save(owner=self.request.user)
        ChannelMembership.objects.create(
            channel=channel,
            user=self.request.user,
            role="owner",
        )

    @action(detail=False, methods=["post"])
    def dm(self, request):
        target_user_id = request.data.get("target_user_id")
        if not target_user_id:
            return Response({"detail": "target_user_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        if str(target_user_id) == str(request.user.id):
            return Response({"detail": "You cannot create a DM with yourself."}, status=status.HTTP_400_BAD_REQUEST)
        target = get_user_model().objects.filter(pk=target_user_id).first()
        if target is None:
            return Response({"detail": "Target user does not exist."}, status=status.HTTP_404_NOT_FOUND)
        if Block.objects.filter(
            models.Q(blocker=request.user, blocked=target)
            | models.Q(blocker=target, blocked=request.user)
        ).exists():
            return Response({"detail": "Cannot message this user."}, status=status.HTTP_403_FORBIDDEN)
        channel = get_or_create_dm_channel_sync(request.user.id, target.id)
        return Response(ChannelSerializer(channel, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def join(self, request, pk=None):
        channel = self.get_object()
        if channel.channel_type in (Channel.CHANNEL_DM, Channel.CHANNEL_PRIVATE):
            return Response({"detail": "This channel requires an invitation."}, status=status.HTTP_403_FORBIDDEN)
        if channel.channel_type == Channel.CHANNEL_PROTECTED:
            password = request.data.get("password", "")
            if not password or not check_password(password, channel.password_hash):
                return Response({"detail": "Invalid channel password."}, status=status.HTTP_403_FORBIDDEN)
        ChannelMembership.objects.get_or_create(channel=channel, user=request.user)
        return Response(ChannelSerializer(channel, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        channel = self.get_object()
        membership = ChannelMembership.objects.filter(
            channel=channel, user=request.user
        ).first()
        if not membership:
            return Response({"detail": "Not a member."}, status=status.HTTP_403_FORBIDDEN)
        now = timezone.now()
        membership.read_until = now
        membership.save(update_fields=["read_until"])

        # Broadcast read event to DM partner
        if channel.channel_type == Channel.CHANNEL_DM:
            other = channel.memberships.exclude(user=request.user).first()
            if other:
                channel_layer = get_channel_layer()
                async_to_sync(channel_layer.group_send)(
                    f"user_{other.user_id}",
                    {
                        "type": "chat_read_receipt",
                        "channel_id": str(channel.id),
                        "read_until": now.isoformat(),
                    },
                )

        return Response({"read_until": now.isoformat()})

    def destroy(self, request, *args, **kwargs):
        channel = self.get_object()
        membership = ChannelMembership.objects.filter(
            channel=channel, user=request.user
        ).first()
        if not membership or membership.role not in ("owner", "admin"):
            return Response(
                {"detail": "Only the owner or an admin can delete this channel."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


class MembershipViewSet(mixins.ListModelMixin,
                        mixins.RetrieveModelMixin,
                        mixins.DestroyModelMixin,
                        viewsets.GenericViewSet):
    serializer_class = ChannelMembershipSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        channel_id = self.kwargs.get("channel_pk")
        if not ChannelMembership.objects.filter(
            channel_id=channel_id, user=self.request.user,
        ).exists():
            return ChannelMembership.objects.none()
        return ChannelMembership.objects.filter(channel_id=channel_id)

    def get_object(self):
        qs = self.get_queryset()
        return get_object_or_404(qs, pk=self.kwargs["pk"])

    def destroy(self, request, *args, **kwargs):
        membership = self.get_object()
        channel = membership.channel
        requester = ChannelMembership.objects.filter(
            channel=channel, user=request.user
        ).first()

        # Owner can kick anyone; admin can kick members but not other admins/owner
        if not requester:
            return Response({"detail": "You are not a member of this channel."}, status=status.HTTP_403_FORBIDDEN)
        if requester.role == "owner":
            pass  # owner can kick anyone
        elif requester.role == "admin":
            if membership.role in ("admin", "owner"):
                return Response({"detail": "Admins cannot kick other admins or the owner."}, status=status.HTTP_403_FORBIDDEN)
            # admin can kick members — falls through
        else:
            return Response({"detail": "You don't have permission to kick members."}, status=status.HTTP_403_FORBIDDEN)

        # Create system message and broadcast before deleting membership
        kicked_user = membership.user
        msg = Message.objects.create(
            channel=channel,
            sender=None,
            message_type=Message.MESSAGE_SYSTEM,
            content=f"{kicked_user.username} has been kicked from the channel",
        )
        try:
            channel_layer = get_channel_layer()
            # Broadcast system message to all remaining members
            async_to_sync(channel_layer.group_send)(
                f"chat_{channel.id}",
                {
                    "type": "chat.message",
                    "id": str(msg.id),
                    "channel_id": str(channel.id),
                    "sender": None,
                    "sender_username": None,
                    "message_type": "system",
                    "content": f"{kicked_user.username} has been kicked from the channel",
                    "created_at": msg.created_at.isoformat(),
                },
            )
            # Notify the kicked user specifically so they remove the channel from their UI
            async_to_sync(channel_layer.group_send)(
                f"chat_{channel.id}",
                {
                    "type": "chat.kicked",
                    "user_id": str(kicked_user.id),
                    "channel_id": str(channel.id),
                },
            )
        except Exception:
            pass

        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["post"])
    def leave(self, request, channel_pk=None):
        membership = ChannelMembership.objects.filter(
            channel_id=channel_pk, user=request.user
        ).first()
        if not membership:
            return Response({"detail": "You are not a member."}, status=status.HTTP_404_NOT_FOUND)
        if membership.role == "owner":
            return Response({"detail": "Owners cannot leave; delete the channel instead."}, status=status.HTTP_400_BAD_REQUEST)

        channel = membership.channel
        username = membership.user.username
        membership.delete()

        msg = Message.objects.create(
            channel=channel,
            sender=None,
            message_type=Message.MESSAGE_SYSTEM,
            content=f"{username} has left the channel",
        )
        try:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"chat_{channel.id}",
                {
                    "type": "chat.message",
                    "id": str(msg.id),
                    "channel_id": str(channel.id),
                    "sender": None,
                    "sender_username": None,
                    "message_type": "system",
                    "content": f"{username} has left the channel",
                    "created_at": msg.created_at.isoformat(),
                },
            )
            async_to_sync(channel_layer.group_send)(
                f"user_{request.user.id}",
                {
                    "type": "chat.kicked",
                    "user_id": str(request.user.id),
                    "channel_id": str(channel.id),
                },
            )
        except Exception:
            pass

        return Response({"status": "ok"})

    @action(detail=True, methods=["post"])
    def mute(self, request, channel_pk=None, pk=None):
        membership = self.get_object()
        duration = request.data.get("duration", 5)
        if not isinstance(duration, (int, float)) or duration < 0:
            return Response({"detail": "Invalid duration."}, status=status.HTTP_400_BAD_REQUEST)
        if duration == 0:
            membership.muted_until = None
        else:
            membership.muted_until = timezone.now() + timezone.timedelta(minutes=duration)
        membership.save(update_fields=["muted_until"])
        return Response(ChannelMembershipSerializer(membership).data)

    @action(detail=False, methods=["post"])
    def toggle_notification_mute(self, request, channel_pk=None):
        membership = ChannelMembership.objects.filter(
            channel_id=channel_pk, user=request.user
        ).first()
        if not membership:
            return Response({"detail": "Not a member."}, status=status.HTTP_404_NOT_FOUND)
        membership.notifications_muted = not membership.notifications_muted
        membership.save(update_fields=["notifications_muted"])
        return Response(
            {"notifications_muted": membership.notifications_muted,
             "membership_id": str(membership.id)}
        )

    @action(detail=True, methods=["post"])
    def change_role(self, request, channel_pk=None, pk=None):
        new_role = request.data.get("role")
        if new_role not in ("member", "admin"):
            return Response({"detail": "Role must be 'member' or 'admin'."}, status=status.HTTP_400_BAD_REQUEST)

        target = self.get_object()
        channel = target.channel
        requester = ChannelMembership.objects.filter(
            channel=channel, user=request.user
        ).first()

        if not requester or requester.role != "owner":
            return Response({"detail": "Only the owner can change roles."}, status=status.HTTP_403_FORBIDDEN)
        if target.role == "owner":
            return Response({"detail": "Cannot change the owner's role."}, status=status.HTTP_400_BAD_REQUEST)

        target.role = new_role
        target.save(update_fields=["role"])
        return Response(ChannelMembershipSerializer(target).data)


class MessageViewSet(mixins.ListModelMixin,
                     viewsets.GenericViewSet):
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        channel_id = self.kwargs.get("channel_pk")
        if not ChannelMembership.objects.filter(
            channel_id=channel_id, user=self.request.user,
        ).exists():
            return Message.objects.none()
        return Message.objects.filter(channel_id=channel_id).select_related("sender").order_by("-created_at")[:100]


class BlockViewSet(mixins.ListModelMixin,
                   mixins.CreateModelMixin,
                   mixins.DestroyModelMixin,
                   viewsets.GenericViewSet):
    serializer_class = BlockSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Block.objects.filter(
            models.Q(blocker=self.request.user) | models.Q(blocked=self.request.user)
        ).select_related("blocker", "blocked")

    def perform_create(self, serializer):
        block = serializer.save(blocker=self.request.user)
        Friendship.objects.filter(
            models.Q(from_user=self.request.user, to_user=block.blocked) |
            models.Q(from_user=block.blocked, to_user=self.request.user)
        ).delete()
        try:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"user_{block.blocked_id}",
                {
                    "type": "chat.friend_removed",
                    "friendship_id": "",
                    "removed_by": str(self.request.user.pk),
                    "target_user_id": str(block.blocked_id),
                },
            )
        except Exception:
            pass

    def perform_destroy(self, instance):
        other_id = instance.blocked_id
        instance.delete()
        try:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"user_{other_id}",
                {
                    "type": "chat.unblocked",
                    "unblocked_by": str(self.request.user.pk),
                    "target_user_id": str(other_id),
                },
            )
        except Exception:
            pass

    def destroy(self, request, *args, **kwargs):
        block = self.get_object()
        if block.blocker != request.user:
            return Response({"detail": "You can only unblock users you blocked."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)


class FriendshipViewSet(mixins.ListModelMixin,
                        mixins.CreateModelMixin,
                        mixins.DestroyModelMixin,
                        viewsets.GenericViewSet):
    serializer_class = FriendshipSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Friendship.objects.filter(
            models.Q(from_user=self.request.user) |
            models.Q(to_user=self.request.user)
        ).select_related("from_user", "to_user")

    def perform_destroy(self, instance):
        other_id = instance.to_user_id if instance.from_user_id == self.request.user.pk else instance.from_user_id
        try:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"user_{other_id}",
                {
                    "type": "chat.friend_removed",
                    "friendship_id": str(instance.id),
                    "removed_by": str(self.request.user.pk),
                    "target_user_id": str(other_id),
                },
            )
        except Exception:
            pass
        instance.delete()

    def perform_create(self, serializer):
        to_user = serializer.validated_data.get("to_user")
        if Block.objects.filter(
            models.Q(blocker=self.request.user, blocked=to_user) |
            models.Q(blocker=to_user, blocked=self.request.user)
        ).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Cannot send friend request. User is blocked.")
        if Friendship.objects.filter(
            models.Q(from_user=self.request.user, to_user=to_user) |
            models.Q(from_user=to_user, to_user=self.request.user)
        ).exists():
            raise ValidationError("Friendship already exists between these users.")
        friendship = serializer.save(from_user=self.request.user, status=Friendship.PENDING)
        try:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"user_{friendship.to_user_id}",
                {
                    "type": "chat.friend_request",
                    "friendship_id": str(friendship.id),
                    "from_user_id": str(friendship.from_user_id),
                    "from_username": friendship.from_user.username,
                    "from_display_name": friendship.from_user.display_name,
                    "target_user_id": str(friendship.to_user_id),
                },
            )
        except Exception:
            pass

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        friendship = self.get_object()
        if friendship.to_user != request.user:
            return Response({"detail": "Only the recipient can accept."}, status=status.HTTP_403_FORBIDDEN)
        if friendship.status != Friendship.PENDING:
            return Response({"detail": "Friendship is not pending."}, status=status.HTTP_400_BAD_REQUEST)
        friendship.status = Friendship.ACCEPTED
        friendship.save(update_fields=["status"])
        try:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"user_{friendship.from_user_id}",
                {
                    "type": "chat.friend_accepted",
                    "friendship_id": str(friendship.id),
                    "by_user_id": str(friendship.to_user_id),
                    "by_username": friendship.to_user.username,
                    "target_user_id": str(friendship.from_user_id),
                },
            )
        except Exception:
            pass
        return Response(FriendshipSerializer(friendship, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        friendship = self.get_object()
        if friendship.to_user != request.user:
            return Response({"detail": "Only the recipient can reject."}, status=status.HTTP_403_FORBIDDEN)
        if friendship.status != Friendship.PENDING:
            return Response({"detail": "Friendship is not pending."}, status=status.HTTP_400_BAD_REQUEST)
        friendship.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
