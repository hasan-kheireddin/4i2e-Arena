from rest_framework import viewsets, mixins, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Channel, ChannelMembership, Message
from .serializers import (
    ChannelSerializer,
    ChannelCreateSerializer,
    ChannelMembershipSerializer,
    MessageSerializer,
)


class ChannelViewSet(mixins.CreateModelMixin,
                     mixins.ListModelMixin,
                     mixins.RetrieveModelMixin,
                     viewsets.GenericViewSet):
    queryset = Channel.objects.all()
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == "create":
            return ChannelCreateSerializer
        return ChannelSerializer

    def get_queryset(self):
        return Channel.objects.filter(memberships__user=self.request.user)

    def perform_create(self, serializer):
        channel = serializer.save(owner=self.request.user)
        ChannelMembership.objects.create(
            channel=channel,
            user=self.request.user,
            role="owner",
        )


class MembershipViewSet(mixins.ListModelMixin,
                        mixins.DestroyModelMixin,
                        viewsets.GenericViewSet):
    serializer_class = ChannelMembershipSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        channel_id = self.kwargs.get("channel_pk")
        return ChannelMembership.objects.filter(channel_id=channel_id)


class MessageViewSet(mixins.ListModelMixin,
                     viewsets.GenericViewSet):
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        channel_id = self.kwargs.get("channel_pk")
        return Message.objects.filter(channel_id=channel_id).select_related("sender").order_by("-created_at")[:100]
