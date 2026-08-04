import os
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator, OriginValidator
from django.conf import settings
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# Initialize Django ASGI application early to ensure AppRegistry is populated
django_asgi_app = get_asgi_application()

# Import after Django setup to avoid AppRegistryNotReady
from config.channelsmiddleware import JWTAuthMiddleware  # noqa: E402
from config.routing import websocket_urlpatterns  # noqa: E402

websocket_app = JWTAuthMiddleware(URLRouter(websocket_urlpatterns))
# In dynamic-host/LAN mode ALLOWED_HOSTS is deliberately "*", because the
# machine's DHCP address can change. Use the matching Channels validator so
# WebSockets work through the same current browser host as HTTP requests.
if settings.CORS_ALLOW_ALL_ORIGINS or settings.ALLOWED_HOSTS == ["*"]:
    websocket_app = AllowedHostsOriginValidator(websocket_app)
else:
    websocket_app = OriginValidator(
        websocket_app,
        allowed_origins=settings.CORS_ALLOWED_ORIGINS,
    )

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": websocket_app,
    }
)
