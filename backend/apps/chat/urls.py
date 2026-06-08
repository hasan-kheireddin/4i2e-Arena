from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ChannelViewSet, MessageViewSet, MembershipViewSet

router = DefaultRouter()
router.register(r"channels", ChannelViewSet, basename="channel")

urlpatterns = [
    path("", include(router.urls)),
    path(
        "channels/<uuid:channel_pk>/members/",
        MembershipViewSet.as_view({"get": "list", "delete": "destroy"}),
        name="channel-members",
    ),
    path(
        "channels/<uuid:channel_pk>/messages/",
        MessageViewSet.as_view({"get": "list"}),
        name="channel-messages",
    ),
]
