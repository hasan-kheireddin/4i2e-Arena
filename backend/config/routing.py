from django.urls import re_path
from apps.games.matchmaking_consumer import MatchmakingConsumer
from apps.games.pong_consumer import PongConsumer
from apps.games.tictaktoe_consumer import TicTacToeConsumer
from apps.analytics.notification_consumer import NotificationConsumer

websocket_urlpatterns: list = [
    re_path(
        r"ws/game/pong/(?P<game_id>[^/]+)/$",
        PongConsumer.as_asgi(),
    ),
    re_path(
        r"ws/game/tictactoe/(?P<game_id>[^/]+)/$",
        TicTacToeConsumer.as_asgi(),
    ),
    re_path(
        r"ws/matchmaking/$",
        MatchmakingConsumer.as_asgi(),
    ),
        re_path(
        r"ws/notifications/$",
        NotificationConsumer.as_asgi(),
    ),
]
