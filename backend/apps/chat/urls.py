from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ChannelViewSet, MembershipViewSet, BlockViewSet, FriendshipViewSet

router = DefaultRouter()
router.register(r"channels", ChannelViewSet, basename="channel")
router.register(r"blocks", BlockViewSet, basename="block")
router.register(r"friendships", FriendshipViewSet, basename="friendship")

urlpatterns = [
    path("", include(router.urls)),
    path(
        "channels/<uuid:channel_pk>/members/",
        MembershipViewSet.as_view({"get": "list"}),
        name="channel-members",
    ),
    path(
        "channels/<uuid:channel_pk>/members/<uuid:pk>/",
        MembershipViewSet.as_view({
            "get": "retrieve",
            "delete": "destroy",
        }),
        name="channel-member-detail",
    ),
    path(
        "channels/<uuid:channel_pk>/members/leave/",
        MembershipViewSet.as_view({"post": "leave"}),
        name="channel-member-leave",
    ),
    path(
        "channels/<uuid:channel_pk>/members/<uuid:pk>/mute/",
        MembershipViewSet.as_view({"post": "mute"}),
        name="channel-member-mute",
    ),
    path(
        "channels/<uuid:channel_pk>/members/<uuid:pk>/change_role/",
        MembershipViewSet.as_view({"post": "change_role"}),
        name="channel-member-change-role",
    ),
    path(
        "channels/<uuid:channel_pk>/members/toggle_notification_mute/",
        MembershipViewSet.as_view({"post": "toggle_notification_mute"}),
        name="channel-member-toggle-notification-mute",
    ),
]
