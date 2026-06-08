from django.urls import re_path
from apps.games.matchmaking_consumer import MatchmakingConsumer
from apps.games.pong_consumer import PongConsumer
from apps.games.tictaktoe_consumer import TicTacToeConsumer
from apps.analytics.notification_consumer import NotificationConsumer
from apps.chat.routing import websocket_urlpatterns as chat_ws_patterns
from apps.games.spectator_consumer import SpectatorConsumer

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
        re_path(
        r"ws/spectate/(?P<game_id>[^/]+)/$",
        SpectatorConsumer.as_asgi(),
    ),
] + chat_ws_patterns
