# Real-Time System

## 1. Overview

### Verdict

This project does contain a real WebSocket-based real-time system for online gameplay.

- Valid real-time implementation exists for:
  - online Pong
  - online Tic-Tac-Toe
  - matchmaking `match_found` delivery
- Partial / hybrid real-time behavior exists for:
  - matchmaking queue position updates
- Backend-only but not end-to-end integrated:
  - user notification WebSocket pipeline
- Explicitly not real-time:
  - local game modes
  - AI game modes

### Technology used

- ASGI server: `daphne` via `docker-compose.yml`
- WebSocket framework: Django Channels
- Cross-process transport / fanout: Redis channel layer
- Reverse proxy / upgrade handling: Nginx
- Frontend transport: browser `WebSocket` API via `frontend/src/hooks/useGameSocket.ts`

### Verification against the required criteria

1. Real-time updates across clients:
   - Satisfied for online match state. Backend broadcasts match events to per-game groups and both clients update immediately.
2. Persistent connection:
   - Satisfied. This is WebSocket, not HTTP polling.
3. Connection lifecycle handling:
   - Satisfied for game sockets with reconnect grace and resume.
   - Partial for matchmaking: disconnect removes the user from queue; reconnect requires requeue.
4. Efficient message broadcasting:
   - Satisfied. Per-game and per-user groups are used; there is no global fanout.
5. Backend-driven logic:
   - Satisfied for online game state. The backend owns simulation, turn validation, readiness, pause/resume, and game over.

## 2. Architecture

### Backend components

- `backend/config/asgi.py`
  - Builds a `ProtocolTypeRouter`
  - Routes `websocket` traffic through `OriginValidator` and `JWTAuthMiddleware`
- `backend/config/channelsmiddleware.py`
  - Authenticates the WebSocket using a JWT access token passed in the query string
- `backend/config/routing.py`
  - Exposes these WebSocket routes:
    - `/ws/game/pong/<game_id>/`
    - `/ws/game/tictactoe/<game_id>/`
    - `/ws/matchmaking/`
    - `/ws/notifications/`
- `backend/apps/games/consumers.py`
  - Shared `BaseConsumer`
  - Handles accept/reject, JSON parsing, structured errors, group join/leave, and `group_send`
- `backend/apps/games/matchmaking_consumer.py`
  - Matchmaking WebSocket endpoint
- `backend/apps/games/matchmaking.py`
  - Redis-backed queue and pairing logic
- `backend/apps/games/pong_consumer.py`
  - Real-time Pong consumer
- `backend/apps/games/tictaktoe_consumer.py`
  - Real-time Tic-Tac-Toe consumer
- `backend/apps/games/pong_engine.py`
  - Server-authoritative Pong simulation
- `backend/apps/games/tictactoe_engine.py`
  - Server-authoritative Tic-Tac-Toe rules / turn validation
- `backend/apps/analytics/notification_consumer.py`
  - Per-user notification socket
- `backend/apps/analytics/xp_service.py`
  - Emits XP / level-up notification events through the channel layer
- `backend/apps/analytics/achievement_service.py`
  - Emits achievement notification events through the channel layer

### Frontend components

- `frontend/src/hooks/useGameSocket.ts`
  - Creates browser WebSocket connections
  - Reconnects automatically with exponential backoff
  - Refreshes JWT before reconnecting after auth failure
- `frontend/src/pages/PongPage.tsx`
  - Opens matchmaking and game sockets
  - Sends paddle input to backend
  - Renders server state on receipt
- `frontend/src/pages/Tictactoepage.tsx`
  - Opens matchmaking and game sockets
  - Sends move commands to backend
  - Renders server state on receipt

### Infrastructure path

1. Browser opens `ws://` or `wss://` in `useGameSocket`
2. Nginx upgrades `/ws/` requests to WebSocket in `nginx/nginx.conf`
3. Daphne serves `config.asgi:application` from `docker-compose.yml`
4. Django Channels routes the connection to the correct consumer
5. Redis channel layers handle group fanout

## 3. Connection Flow

### Socket establishment

1. The frontend calls `useGameSocket(path, ...)` in `frontend/src/hooks/useGameSocket.ts`.
2. The hook reads the access token from local storage and builds a same-origin WebSocket URL:
   - protocol from `window.location.protocol`
   - host from `window.location.host`
   - token passed as `?token=...`
3. Nginx proxies `/ws/` with:
   - `Upgrade`
   - `Connection "upgrade"`
   - HTTP/1.1
4. `backend/config/asgi.py` routes WebSocket traffic through:
   - `OriginValidator`
   - `JWTAuthMiddleware`
   - `URLRouter`
5. `JWTAuthMiddleware` validates the JWT and sets `scope["user"]`.
6. `BaseConsumer.connect()` rejects anonymous users with close code `4401`, otherwise accepts and calls the consumer-specific `on_connect()`.

### Reconnect behavior

Frontend reconnect:

- `useGameSocket` reconnects automatically with backoff:
  - 1s
  - 2s
  - 4s
  - capped at 5s
- On close code `4401`, it forces token refresh before reconnecting.
- On reconnection, `onOpen()` runs again and resends the join request.

Backend reconnect:

- Game consumers allow reconnect to the same slot if that slot exists and is currently marked disconnected.
- When the player reconnects:
  - the disconnect timeout is canceled
  - the player is marked connected again
  - current game state is resent
  - the match resumes when all players are connected

### Disconnect behavior

- `BaseConsumer.disconnect()` always removes the connection from tracked groups.
- Each specialized consumer then performs domain cleanup:
  - matchmaking:
    - cancels queue tasks
    - dequeues the player
    - closes Redis connection
  - game consumers:
    - mark the player disconnected
    - broadcast presence change
    - pause the game if it was active
    - start a grace timer
  - notification consumer:
    - leaves the per-user notification group

## 4. Event Flow

### A. Matchmaking flow

#### Real flow

1. Frontend opens `/ws/matchmaking/` using `useGameSocket`.
2. On socket open, frontend sends:
   - `{ "type": "find_match", "game_type": "pong" }`
   - or `{ "type": "find_match", "game_type": "tictactoe" }`
3. `MatchmakingConsumer._handle_find_match()`:
   - validates the game type
   - joins a per-user group: `matchmaking_user_<user_id>`
   - enqueues the player in Redis
   - immediately calls `MatchmakingService.try_match()`
4. If a pair is found:
   - `_notify_match()` sends `match.found` through the channel layer to each user’s private matchmaking group
5. `match_found()` in each consumer forwards the event to that browser as:
   - `{ "type": "match_found", ... }`
6. Frontend receives `match_found`, stores `game_id`, closes the matchmaking socket, and opens the game socket.

#### Queue position flow

Queue position is not event-driven.

1. After joining the queue, `MatchmakingConsumer` starts `_queue_update_loop()`.
2. Every 2 seconds it:
   - checks whether the user is still queued
   - computes position using Redis `LRANGE`
   - sends `queue_update` to that client
3. Tic-Tac-Toe frontend renders `queue_update`; Pong frontend currently ignores it.

#### Assessment

- `match_found` is real push-based WebSocket delivery.
- `queue_update` is backend timer-driven, not immediate event emission from actual queue mutation.
- This is not HTTP polling, but it is still a periodic server-side polling loop over Redis state.

### B. Online Pong flow

#### Authoritative path

1. Frontend opens `/ws/game/pong/<game_id>/`.
2. On open, frontend sends:
   - `{ "type": "join", "game_id": "<game_id>" }`
3. `PongConsumer._handle_join()`:
   - gets or creates a `GameSession`
   - assigns the player to slot 1 or 2, or reconnects to a disconnected slot
   - joins group `game_<game_id>`
   - sends `game_joined`
   - if both players are present, broadcasts `both.connected`
4. Each player sends `{ "type": "ready" }`.
5. `PongConsumer._handle_ready()` marks the slot ready.
6. When both slots are ready, `_start_game()`:
   - starts the server-side `PongEngine`
   - sets session status to `PLAYING`
   - broadcasts `game.start`
   - starts the server tick loop task
7. `_tick_loop()` runs at 60 Hz:
   - calls `session.engine.tick()`
   - broadcasts `game.state` to `game_<game_id>`
8. Each browser receives `game_state`.
9. `PongPage.tsx` updates:
   - `onlineGameState`
   - `onlineScore`
10. React effects redraw the canvas immediately from the server state.

#### Client input path

1. During online play, `PongPage.tsx` uses a `setInterval(..., 16)` loop.
2. That loop samples local keyboard state and only sends a WebSocket message when direction changes:
   - `{ "type": "input", "direction": "up" | "down" | "stop" }`
3. `PongConsumer._handle_input()`:
   - rate-limits input
   - validates direction
   - applies input to the server engine
4. The next authoritative tick produces the updated game state.

#### Important conclusion

The `setInterval(..., 16)` in Pong is not fake real-time.

- It does not poll the server for state.
- It only samples local keyboard input and sends commands over an already-open WebSocket.
- Match state still originates from backend `engine.tick()` and is pushed by the server.

### C. Online Tic-Tac-Toe flow

1. Frontend opens `/ws/game/tictactoe/<game_id>/`.
2. On open, frontend sends `{ "type": "join", "game_id": "<game_id>" }`.
3. `TicTacToeConsumer._handle_join()`:
   - gets or creates a `GameSession`
   - assigns or reconnects the slot
   - joins `game_<game_id>`
   - sends `game_joined`
   - broadcasts `both.connected` when lobby is full
4. Each player sends `{ "type": "ready" }`.
5. `_start_game()` starts the engine and broadcasts `game.start`.
6. When a player clicks a square, frontend sends:
   - `{ "type": "move", "cell": <0-8> }`
7. `TicTacToeConsumer._handle_move()`:
   - validates session state
   - rate-limits move frequency
   - calls `session.engine.make_move(...)`
8. If move is valid:
   - consumer broadcasts `game.state`
9. If the engine reaches a terminal state:
   - consumer broadcasts `game.over`
10. Frontend receives the event and updates React state instantly.

### D. Notification flow

#### Backend path exists

1. A client could open `/ws/notifications/`.
2. `NotificationConsumer.on_connect()` joins:
   - `notifications_<user_id>`
3. When XP or achievements change:
   - `xp_service.py` calls `channel_layer.group_send(...)`
   - `achievement_service.py` calls `channel_layer.group_send(...)`
4. `NotificationConsumer` forwards the event to the client as JSON.

#### End-to-end status

No frontend code currently opens `/ws/notifications/`.

- I found no `useGameSocket('/ws/notifications/...')`
- I found no frontend notification event handlers for `achievement_unlocked`, `xp_gained`, or `level_up`

So the backend notification path is real, but it is not currently integrated into the frontend UI.

## 5. Broadcasting Strategy

### Groups / rooms in use

- Per-match game room:
  - `game_<game_id>`
  - used by Pong and Tic-Tac-Toe consumers
- Per-user matchmaking room:
  - `matchmaking_user_<user_id>`
  - used to deliver `match_found` to exactly the two matched players
- Per-user notification room:
  - `notifications_<user_id>`
  - used for XP / level / achievement events

### Efficiency assessment

The design is scoped correctly.

- Online game state is sent only to players in that match room.
- Matchmaking results are sent only to the matched users.
- Notifications are sent only to the target user.
- There is no evidence of global broadcast of match state to all users.

This satisfies the requirement to avoid unnecessary broadcast fanout.

## 6. Connection Handling

### Connect

- WebSocket upgrade is supported by Nginx.
- JWT authentication is enforced by middleware.
- Consumer acceptance is centralized in `BaseConsumer`.

### Disconnect

#### Games

- On disconnect, game consumers:
  - mark the player disconnected
  - broadcast `player_presence`
  - if the game is active, broadcast `game_paused`
  - schedule a 12-second grace timeout
- If the player does not return before timeout:
  - Pong: backend forces a forfeit and broadcasts `game_over`
  - Tic-Tac-Toe: backend forces a forfeit and broadcasts `game_over`

#### Matchmaking

- Disconnect immediately dequeues the user.
- There is no reconnect-to-same-queue-position behavior.

#### Notifications

- Disconnect just removes the channel from the user group.

### Reconnect

#### Games

- Frontend reconnects automatically.
- Backend allows the same user to reclaim their old slot if marked disconnected.
- On successful reconnect:
  - disconnect timer is canceled
  - state is resent
  - match resumes automatically when all players are connected

#### Matchmaking

- Frontend can reconnect the socket transport itself, but queue membership is not preserved because disconnect dequeues the player.
- Reconnect requires a fresh `find_match` request.

### Stale connection cleanup

- Matchmaking has explicit stale queue cleanup:
  - Redis metadata TTL
  - periodic cleanup loop
  - leader lock so only one worker performs cleanup
- Game sessions use per-slot disconnect timers rather than global stale sweeps.

## 7. Performance Considerations

### Good properties

- Server-authoritative simulation:
  - clients send input / moves
  - backend owns state
- No HTTP polling for live online match state
- Scoped fanout using groups
- Pong input sends only on direction change, which reduces upstream spam

### Costs and trade-offs

#### Pong

- Pong broadcasts a full state snapshot every tick at 60 Hz.
- This is appropriate for a twitch game, but it is the heaviest real-time path in the project.
- Payload size is still modest because the state is small:
  - ball
  - two paddles
  - two scores

#### Tic-Tac-Toe

- Very efficient.
- Only sends state on move / reconnect / terminal transition.

#### Matchmaking

- Queue updates are computed by periodic Redis scans (`LRANGE` + linear position search).
- This is acceptable for small queues.
- It is not ideal for large queues because:
  - work is repeated even when queue state did not change
  - updates are not immediate

### Fake real-time audit

I did not find HTTP polling used for online match state.

What I found:

- `PongPage.tsx` uses `setInterval(..., 16)` for keyboard sampling
  - this is not server polling
  - it is local input capture feeding the WebSocket
- Matchmaking uses a backend periodic loop for `queue_update`
  - this is not HTTP polling
  - but it is still periodic polling of Redis state on the server side
- Local / AI match creation uses HTTP only after the game finishes
  - this is not real-time and is explicitly separate from online play

## 8. Limitations

1. Matchmaking queue position is not truly event-driven.
   - `match_found` is instant push.
   - `queue_update` is only refreshed every 2 seconds.
   - Result: queue position is near-real-time, not strictly immediate.

2. Matchmaking reconnect is not graceful in terms of queue membership.
   - Disconnect dequeues the player immediately.
   - Reconnect requires rejoining the queue from scratch.

3. Notifications are not wired into the frontend.
   - Backend route and producer logic exist.
   - No frontend consumer is subscribed, so this is not an end-to-end real-time feature today.

4. XP / level notification payloads are internally inconsistent.
   - Producer in `backend/apps/analytics/xp_service.py` sends:
     - `new_xp`
     - `level_info`
   - Consumer in `backend/apps/analytics/notification_consumer.py` expects:
     - `total_xp`
     - `level`
   - Result:
     - XP notifications forwarded to clients would contain incorrect default values for `total_xp` and `level`
     - level-up notifications would contain incorrect default `total_xp`

5. `useGameSocket` ignores the configured `VITE_WS_URL`.
   - The hook always derives the socket host from `window.location.host`.
   - This works only if deployment preserves same-origin WebSocket proxying.

6. There is no generic heartbeat / keepalive in the frontend socket hook.
   - Nginx `proxy_read_timeout` is 60 seconds.
   - Active game sockets are safe because they regularly send traffic.
   - Matchmaking is safe because queue updates are frequent.
   - A future notifications socket could become idle and may require ping / pong traffic to stay alive reliably.

7. Pong queue status is not surfaced in the UI.
   - Backend can emit queue status.
   - Pong frontend currently only reacts to `match_found`.
   - This is not a correctness bug, but it wastes backend work if queue updates are being sent and ignored.

## 9. Code Blocks With Location

### Infrastructure bootstrap

Location: `docker-compose.yml:22-110`

```yaml
services:
  redis:
    image: redis:7-alpine
    container_name: ft_redis
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    ports:
      - "${REDIS_PORT:-6380}:6379"

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: ft_backend
    restart: unless-stopped
    command: >
      daphne -b 0.0.0.0 -p 8000 config.asgi:application
    environment:
      - DJANGO_SETTINGS_MODULE=config.settings
      - DATABASE_URL=postgres://${POSTGRES_USER:-ft_user}:${POSTGRES_PASSWORD:-ft_password}@db:5432/${POSTGRES_DB:-ft_transcendence}
      - REDIS_URL=redis://redis:6379/0

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: ft_frontend
    restart: unless-stopped
    environment:
      - VITE_API_URL=https://localhost:8443/api
      - VITE_WS_URL=

  nginx:
    build:
      context: ./nginx
      dockerfile: Dockerfile
    container_name: ft_nginx
    restart: unless-stopped
    ports:
      - "${HTTPS_PORT:-8443}:443"
```

Location: `nginx/nginx.conf:74-83`

```nginx
location /ws/ {
    proxy_pass         http://backend;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection "upgrade";
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
}
```

### Channels setup

Location: `backend/config/settings.py:185-193`

```python
REDIS_URL = config("REDIS_URL", default="redis://localhost:6379/0")

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [REDIS_URL],
        },
    },
}
```

Location: `backend/config/asgi.py:1-22`

```python
import os
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import OriginValidator
from django.conf import settings
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

django_asgi_app = get_asgi_application()

from config.channelsmiddleware import JWTAuthMiddleware  # noqa: E402
from config.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": OriginValidator(
            JWTAuthMiddleware(URLRouter(websocket_urlpatterns)),
            allowed_origins=settings.CORS_ALLOWED_ORIGINS,
        ),
    }
)
```

Location: `backend/config/routing.py:1-22`

```python
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
```

Location: `backend/config/channelsmiddleware.py:17-111`

```python
class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "websocket":
            await super().__call__(scope, receive, send)
            return

        scope["user"] = await self._authenticate(scope)
        await super().__call__(scope, receive, send)

    @staticmethod
    def _extract_token(scope: dict[str, Any]) -> str | None:
        raw_qs: bytes = scope.get("query_string", b"")

        try:
            qs = parse_qs(raw_qs.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            logger.debug("Unparseable query string on WebSocket connection")
            return None

        tokens = qs.get("token")
        if not tokens:
            return None

        qs.pop("token", None)
        scope["query_string"] = urlencode(qs, doseq=True).encode("utf-8")
        return tokens[0]

    @classmethod
    async def _authenticate(
        cls, scope: dict[str, Any],
    ) -> AnonymousUser | Any:
        raw_token = cls._extract_token(scope)
        if raw_token is None:
            logger.debug("WebSocket connection without JWT token")
            return AnonymousUser()

        try:
            validated = AccessToken(raw_token)
        except (InvalidToken, TokenError) as exc:
            logger.debug("JWT validation failed: %s", exc)
            return AnonymousUser()

        user_id = validated.get("user_id")
        if user_id is None:
            logger.debug("JWT payload missing user_id claim")
            return AnonymousUser()

        user = await cls._get_user(user_id)
        if user is None:
            logger.debug("No user found for user_id=%s", user_id)
            return AnonymousUser()

        if not getattr(user, "is_active", True):
            logger.debug("Inactive user attempted WebSocket auth user_id=%s", user_id)
            return AnonymousUser()

        return user
```

### Shared WebSocket consumer base

Location: `backend/apps/games/consumers.py:15-257`

```python
class BaseConsumer(AsyncWebsocketConsumer):
    require_auth: bool = True

    async def connect(self) -> None:
        self.user = self.scope.get("user")

        if self.require_auth and (
            self.user is None or not getattr(self.user, "is_authenticated", False)
        ):
            logger.info(
                "Rejected unauthenticated WebSocket from %s",
                self.scope.get("client", ("?", 0))[0],
            )
            await self.close(code=4401)
            return

        await self.accept()
        self._accepted = True
        self._connected_at = time.monotonic()
        logger.info(
            "WebSocket connected: user=%s channel=%s",
            getattr(self.user, "username", "anon"),
            self.channel_name,
        )
        await self.on_connect()

    async def disconnect(self, code: int) -> None:
        for group in list(self._groups):
            try:
                await self.leave_group(group)
            except Exception:
                logger.warning(
                    "Failed to leave group %s during disconnect", group,
                    exc_info=True,
                )
                self._groups.discard(group)

        await self.on_disconnect(code)

    async def send_json(self, data: dict[str, Any]) -> None:
        await self.send(text_data=json.dumps(data))

    async def broadcast(
        self,
        group: str,
        data: dict[str, Any],
        handler: str = "group.message",
    ) -> None:
        self._require_channel_layer()
        payload = {k: v for k, v in data.items() if k != "type"}
        payload["type"] = handler
        await self.channel_layer.group_send(group, payload)

    async def join_group(self, group: str) -> None:
        if not self._accepted:
            raise RuntimeError(
                "Cannot join a group before the connection is accepted"
            )
        self._require_channel_layer()
        await self.channel_layer.group_add(group, self.channel_name)
        self._groups.add(group)

    async def leave_group(self, group: str) -> None:
        self._require_channel_layer()
        await self.channel_layer.group_discard(group, self.channel_name)
        self._groups.discard(group)
```

### Matchmaking

Location: `backend/apps/games/matchmaking_consumer.py:88-140`

```python
async def _handle_find_match(self, content: dict[str, Any]) -> None:
    if self._game_type is not None:
        await self.send_error(
            "already_queued",
            "You are already in a matchmaking queue. "
            "Send 'cancel' first to leave.",
        )
        return

    game_type = content.get("game_type", "")
    if game_type not in _VALID_GAME_TYPES:
        await self.send_error(
            "invalid_game_type",
            f"game_type must be one of: {', '.join(sorted(_VALID_GAME_TYPES))}",
        )
        return

    user_id: int = self.user.pk
    username: str = getattr(self.user, "username", "anon")

    await self.join_group(self._user_group_name)
    await self._service.enqueue(
        user_id=user_id,
        username=username,
        game_type=game_type,
    )
    self._game_type = game_type

    match = await self._service.try_match(game_type)
    if match is not None:
        await self._notify_match(match)

    info = await self._service.get_queue_info(user_id, game_type)
    await self.send_json({
        "type": "queue_joined",
        "game_type": game_type,
        **info,
    })

    self._match_task = asyncio.create_task(
        self._queue_update_loop(game_type),
    )
```

Location: `backend/apps/games/matchmaking_consumer.py:177-229`

```python
async def _queue_update_loop(self, game_type: str) -> None:
    try:
        while True:
            still_queued = await self._service.is_queued(self.user.pk)
            if not still_queued:
                break

            info = await self._service.get_queue_info(
                self.user.pk, game_type,
            )
            await self.send_json({
                "type": "queue_update",
                **info,
            })

            await asyncio.sleep(MATCH_POLL_INTERVAL)
    except asyncio.CancelledError:
        pass

async def _notify_match(self, match: dict[str, Any]) -> None:
    p1 = match["player1"]
    p2 = match["player2"]
    game_id = match["game_id"]
    game_type = match["game_type"]

    p1_group = f"matchmaking_user_{p1['user_id']}"
    await self.channel_layer.group_send(p1_group, {
        "type": "match.found",
        "game_id": game_id,
        "game_type": game_type,
        "opponent": {
            "user_id": p2["user_id"],
            "username": p2["username"],
        },
    })

    p2_group = f"matchmaking_user_{p2['user_id']}"
    await self.channel_layer.group_send(p2_group, {
        "type": "match.found",
        "game_id": game_id,
        "game_type": game_type,
        "opponent": {
            "user_id": p1["user_id"],
            "username": p1["username"],
        },
    })
```

Location: `backend/apps/games/matchmaking.py:40-143`

```python
class MatchmakingService:
    async def enqueue(
        self,
        user_id: int,
        username: str,
        game_type: str,
    ) -> None:
        await self._remove_from_all_queues(user_id)

        pipe = self._redis.pipeline(transaction=True)
        player_key = _player_key(user_id)
        pipe.hset(player_key, mapping={
            "user_id": str(user_id),
            "username": username,
            "game_type": game_type,
            "enqueued_at": str(time.time()),
        })
        pipe.expire(player_key, 300)

        queue_key = _queue_key(game_type)
        pipe.rpush(queue_key, str(user_id))
        pipe.sadd(_active_key(), str(user_id))
        await pipe.execute()

    async def try_match(self, game_type: str) -> dict[str, Any] | None:
        queue_key = _queue_key(game_type)
        popped: list[bytes] | None = await self._redis.lpop(queue_key, 2)
        if popped is None or len(popped) < 2:
            if popped:
                await self._redis.rpush(queue_key, popped[0])
            return None

        p1_id = popped[0].decode() if isinstance(popped[0], bytes) else str(popped[0])
        p2_id = popped[1].decode() if isinstance(popped[1], bytes) else str(popped[1])

        p1_meta = await self._get_player_meta(p1_id)
        p2_meta = await self._get_player_meta(p2_id)
        if p1_meta is None or p2_meta is None:
            if p1_meta is not None:
                await self._redis.rpush(queue_key, str(p1_id))
            else:
                await self._cleanup_player_keys(p1_id)
            if p2_meta is not None:
                await self._redis.rpush(queue_key, str(p2_id))
            else:
                await self._cleanup_player_keys(p2_id)
            return None

        game_id = generate_game_id()
        pipe = self._redis.pipeline(transaction=True)
        pipe.delete(_player_key(p1_id))
        pipe.delete(_player_key(p2_id))
        pipe.srem(_active_key(), str(p1_id), str(p2_id))
        await pipe.execute()

        return {
            "game_id": game_id,
            "game_type": game_type,
            "player1": p1_meta,
            "player2": p2_meta,
        }
```

### Session state used by game rooms

Location: `backend/apps/games/session.py:32-183`

```python
@dataclass
class PlayerSlot:
    user_id: int
    username: str
    channel_name: str
    slot: int
    connected: bool = True
    disconnected_at: float | None = None

@dataclass
class GameSession:
    game_id: str
    game_type: GameType
    engine: Any
    ai: Any = None
    ai_slot: int | None = None
    ai_difficulty: str | None = None
    players: dict[int, PlayerSlot] = field(default_factory=dict)
    ready_slots: set = field(default_factory=set)
    both_connected_sent: bool = False
    status: SessionStatus = SessionStatus.WAITING
    group_name: str = ""
    created_at: float = field(default_factory=time.time)
    finished_at: float | None = None
    finish_reason: FinishReason | None = None
    winner_id: int | None = None
    paused: bool = False
    pause_reason: str | None = None
    tick_task: Any = None
    tick_owner: int | None = None
    disconnect_tasks: dict[int, Any] = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        if not self.group_name:
            self.group_name = f"game_{self.game_id}"

    def mark_player_disconnected(self, slot: int) -> None:
        if slot in self.players:
            self.players[slot].connected = False
            self.players[slot].disconnected_at = time.time()

    def mark_player_connected(
        self,
        slot: int,
        *,
        channel_name: str | None = None,
    ) -> None:
        if slot in self.players:
            self.players[slot].connected = True
            self.players[slot].disconnected_at = None
            if channel_name is not None:
                self.players[slot].channel_name = channel_name

    @property
    def all_players_connected(self) -> bool:
        if not self.players:
            return False
        return all(ps.connected for ps in self.players.values())

    def to_info(self) -> dict[str, Any]:
        return {
            "game_id": self.game_id,
            "game_type": self.game_type.value,
            "status": self.status.value,
            "players": {
                str(slot): {
                    "user_id": str(ps.user_id),
                    "username": ps.username,
                    "connected": ps.connected,
                }
                for slot, ps in self.players.items()
            },
            "ai_difficulty": self.ai_difficulty,
        }
```

### Pong real-time consumer

Location: `backend/apps/games/pong_consumer.py:49-187`

```python
async def on_disconnect(self, code: int) -> None:
    session = self._session
    slot = self._slot
    if session is None or slot is None:
        return

    if session.status in (SessionStatus.FINISHED, SessionStatus.ABANDONED):
        return

    session.mark_player_disconnected(slot)
    await self.broadcast(
        session.group_name,
        {
            "slot": slot,
            "connected": False,
            "game_info": session.to_info(),
        },
        handler="player.presence",
    )

    if session.status == SessionStatus.PLAYING:
        session.paused = True
        session.pause_reason = "player_disconnected"
        await self._stop_tick_loop(session, force=True)
        await self.broadcast(
            session.group_name,
            {
                "slot": slot,
                "reason": "player_disconnected",
                "resume_deadline_seconds": RECONNECT_GRACE_SECONDS,
            },
            handler="game.paused",
        )

    await self._schedule_disconnect_resolution(session, slot)

async def _handle_join(self, content: dict[str, Any]) -> None:
    game_id = content.get("game_id")
    session = get_session(game_id)
    if session is None:
        session = create_session(
            game_type=GameType.PONG,
            engine=PongEngine(),
            game_id=game_id,
        )

    user_id: int = self.user.pk
    existing_slot = session.get_player_slot(user_id)
    reconnected = False

    if existing_slot is not None:
        player = session.players.get(existing_slot)
        if player is None:
            await self.send_error("invalid_session", "Player slot is missing")
            return
        if player.connected:
            await self.send_error(
                "already_joined",
                "This player is already connected to the session",
            )
            return
        slot = existing_slot
        reconnected = True
        await self._cancel_disconnect_task(session, slot)
        session.mark_player_connected(slot, channel_name=self.channel_name)
    elif session.is_full:
        await self.send_error("game_full", "Game is already full")
        return
    else:
        slot = 1 if 1 not in session.players else 2
        session.engine.set_player(str(user_id), slot)
        session.players[slot] = PlayerSlot(
            user_id=user_id,
            username=getattr(self.user, "username", "anon"),
            channel_name=self.channel_name,
            slot=slot,
        )

    self._session = session
    self._slot = slot

    await self.join_group(session.group_name)
    await self.send_json({
        "type": "game_joined",
        "slot": slot,
        "reconnected": reconnected,
        "game_info": session.to_info(),
    })

    if session.is_full and session.status == SessionStatus.WAITING and not session.both_connected_sent:
        session.both_connected_sent = True
        await self.broadcast(
            session.group_name,
            {"game_info": session.to_info()},
            handler="both.connected",
        )
    elif reconnected and session.status == SessionStatus.PLAYING:
        await self.send_json({
            "type": "game_state",
            **session.engine.get_state(),
        })
        if session.paused and session.all_players_connected:
            await self._resume_game(session)
```

Location: `backend/apps/games/pong_consumer.py:189-225,289-304,463-540`

```python
async def _handle_ready(self) -> None:
    session = self._session
    if session is None or self._slot is None:
        await self.send_error("not_joined", "Not in a game session")
        return
    if session.status != SessionStatus.WAITING:
        return

    session.ready_slots.add(self._slot)
    await self.broadcast(
        session.group_name,
        {"slot": self._slot},
        handler="player.ready",
    )

    if session.ready_slots.issuperset({1, 2}) and session.is_full:
        await self._start_game(session)

async def _start_game(self, session: GameSession) -> None:
    if session.status != SessionStatus.WAITING:
        return
    if session.tick_task is not None:
        return

    session.engine.start()
    session.status = SessionStatus.PLAYING
    session.paused = False
    session.pause_reason = None

    await self.broadcast(
        session.group_name,
        {"game_info": session.to_info()},
        handler="game.start",
    )

    session.tick_task = asyncio.create_task(self._tick_loop(session))
    session.tick_owner = self.user.pk

async def _tick_loop(self, session: GameSession) -> None:
    try:
        while session.status == SessionStatus.PLAYING:
            if session.paused:
                await asyncio.sleep(0.1)
                continue

            tick_start = time.monotonic()
            state = session.engine.tick()

            await self.broadcast(
                session.group_name,
                {"state": state},
                handler="game.state",
            )
```

```python
async def _resume_game(self, session: GameSession) -> None:
    session.paused = False
    session.pause_reason = None
    await self.broadcast(
        session.group_name,
        {
            "game_info": session.to_info(),
            "state": session.engine.get_state(),
        },
        handler="game.resumed",
    )
    if session.tick_task is None:
        session.tick_task = asyncio.create_task(self._tick_loop(session))
        session.tick_owner = self.user.pk

async def game_state(self, event: dict[str, Any]) -> None:
    await self.send_json({
        "type": "game_state",
        **event.get("state", {}),
    })

async def player_presence(self, event: dict[str, Any]) -> None:
    await self.send_json({
        "type": "player_presence",
        "slot": event.get("slot"),
        "connected": event.get("connected", False),
        "game_info": event.get("game_info"),
    })

async def game_paused(self, event: dict[str, Any]) -> None:
    await self.send_json({
        "type": "game_paused",
        "slot": event.get("slot"),
        "reason": event.get("reason"),
        "resume_deadline_seconds": event.get("resume_deadline_seconds"),
    })

async def game_resumed(self, event: dict[str, Any]) -> None:
    payload: dict[str, Any] = {
        "type": "game_resumed",
        "game_info": event.get("game_info"),
    }
    state = event.get("state")
    if isinstance(state, dict):
        payload.update(state)
    await self.send_json(payload)
```

### Tic-Tac-Toe real-time consumer

Location: `backend/apps/games/tictaktoe_consumer.py:42-179`

```python
async def on_disconnect(self, code: int) -> None:
    session = self._session
    slot = self._slot
    if session is None or slot is None:
        return

    if session.status in (SessionStatus.FINISHED, SessionStatus.ABANDONED):
        return

    session.mark_player_disconnected(slot)
    await self.broadcast(
        session.group_name,
        {
            "slot": slot,
            "connected": False,
            "game_info": session.to_info(),
        },
        handler="player.presence",
    )

    if session.status == SessionStatus.PLAYING:
        session.paused = True
        session.pause_reason = "player_disconnected"
        await self.broadcast(
            session.group_name,
            {
                "slot": slot,
                "reason": "player_disconnected",
                "resume_deadline_seconds": RECONNECT_GRACE_SECONDS,
            },
            handler="game.paused",
        )

    await self._schedule_disconnect_resolution(session, slot)

async def _handle_join(self, content: dict[str, Any]) -> None:
    game_id = content.get("game_id")
    session = get_session(game_id)
    if session is None:
        session = create_session(
            game_type=GameType.TICTACTOE,
            engine=TicTacToeEngine(),
            game_id=game_id,
        )

    user_id: int = self.user.pk
    existing_slot = session.get_player_slot(user_id)
    reconnected = False

    if existing_slot is not None:
        player = session.players.get(existing_slot)
        if player is None:
            await self.send_error("invalid_session", "Player slot is missing")
            return
        if player.connected:
            await self.send_error(
                "already_joined",
                "This player is already connected to the session",
            )
            return
        slot = existing_slot
        reconnected = True
        await self._cancel_disconnect_task(session, slot)
        session.mark_player_connected(slot, channel_name=self.channel_name)
    elif session.is_full:
        await self.send_error("game_full", "Game is already full")
        return
    else:
        slot = 1 if 1 not in session.players else 2
        session.engine.set_player(str(user_id), slot)
        session.players[slot] = PlayerSlot(
            user_id=user_id,
            username=getattr(self.user, "username", "anon"),
            channel_name=self.channel_name,
            slot=slot,
        )
```

Location: `backend/apps/games/tictaktoe_consumer.py:215-253,292-311,383-461`

```python
async def _handle_move(self, content: dict[str, Any]) -> None:
    session = self._session
    if session is None or session.status != SessionStatus.PLAYING:
        await self.send_error("not_playing", "Game is not in progress")
        return
    if self._slot is None:
        return
    if session.paused:
        await self.send_error("game_paused", "Game is paused while a player reconnects")
        return

    cell = content.get("cell")
    if not isinstance(cell, int) or not (0 <= cell < 9):
        await self.send_error("invalid_cell", "Cell must be an integer 0–8")
        return

    result = session.engine.make_move(self._slot, cell)
    if result != MoveResult.OK:
        await self.send_json({
            "type": "move_error",
            "result": result.value,
        })
        return

    await self._broadcast_state(session)

    if session.engine.status == TTTStatus.FINISHED:
        reason = FinishReason.DRAW if session.engine.is_draw else FinishReason.SCORE
        winner_id = self._resolve_winner_id(session)
        session.mark_finished(reason=reason, winner_id=winner_id)
        await self._cancel_disconnect_tasks(session)
        await self._broadcast_game_over(
            session,
            reason="draw" if session.engine.is_draw else "win",
        )
        await record_match(session)
```

```python
async def _broadcast_state(self, session: GameSession) -> None:
    await self.broadcast(
        session.group_name,
        {"state": session.engine.get_state()},
        handler="game.state",
    )

async def _broadcast_game_over(self, session: GameSession, reason: str) -> None:
    winner = session.engine.winner
    winner_val = winner.value if winner else None
    await self.broadcast(
        session.group_name,
        {
            "winner": winner_val,
            "is_draw": session.engine.is_draw,
            "reason": reason,
            "final_state": session.engine.get_state(),
        },
        handler="game.over",
    )
```

```python
async def _resume_game(self, session: GameSession) -> None:
    session.paused = False
    session.pause_reason = None
    await self.broadcast(
        session.group_name,
        {
            "game_info": session.to_info(),
            "state": session.engine.get_state(),
        },
        handler="game.resumed",
    )

async def game_state(self, event: dict[str, Any]) -> None:
    await self.send_json({"type": "game_state", **event.get("state", {})})

async def player_presence(self, event: dict[str, Any]) -> None:
    await self.send_json({
        "type": "player_presence",
        "slot": event.get("slot"),
        "connected": event.get("connected", False),
        "game_info": event.get("game_info"),
    })

async def game_paused(self, event: dict[str, Any]) -> None:
    await self.send_json({
        "type": "game_paused",
        "slot": event.get("slot"),
        "reason": event.get("reason"),
        "resume_deadline_seconds": event.get("resume_deadline_seconds"),
    })

async def game_resumed(self, event: dict[str, Any]) -> None:
    payload: dict[str, Any] = {
        "type": "game_resumed",
        "game_info": event.get("game_info"),
    }
    state = event.get("state")
    if isinstance(state, dict):
        payload.update(state)
    await self.send_json(payload)
```

### Notification WebSocket path

Location: `backend/apps/analytics/notification_consumer.py:9-114`

```python
class NotificationConsumer(BaseConsumer):
    require_auth = True

    async def on_connect(self) -> None:
        self._notification_group = f"notifications_{self.user.pk}"
        await self.join_group(self._notification_group)
        await self.send_json({
            "type": "connected",
            "message": "Notification channel active.",
        })

    async def on_disconnect(self, code: int) -> None:
        group = getattr(self, "_notification_group", None)
        if group:
            await self.leave_group(group)

    async def on_message(self, content: dict[str, Any]) -> None:
        msg_type = content.get("type")
        if msg_type == "ping":
            await self.send_json({"type": "pong"})
        else:
            await self.send_error(
                "unsupported",
                "Notification channel is receive-only",
            )

    async def achievement_unlocked(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "achievement_unlocked",
            "achievement": event.get("achievement", {}),
        })

    async def xp_gained(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "xp_gained",
            "xp_gained": event.get("xp_gained", 0),
            "total_xp": event.get("total_xp", 0),
            "level": event.get("level", 1),
            "breakdown": event.get("breakdown", {}),
        })

    async def level_up(self, event: dict[str, Any]) -> None:
        await self.send_json({
            "type": "level_up",
            "new_level": event.get("new_level", 1),
            "total_xp": event.get("total_xp", 0),
        })
```

Location: `backend/apps/analytics/xp_service.py:378-426`

```python
async def _send_xp_notification(
    *,
    user_id: int,
    xp_gained: int,
    breakdown: dict[str, int],
    new_xp: int,
    new_level: int,
    old_level: int,
    leveled_up: bool,
) -> None:
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    group_name = f"notifications_{user_id}"
    level_info = get_xp_to_next_level(new_xp)

    await channel_layer.group_send(
        group_name,
        {
            "type": "xp.gained",
            "xp_gained": xp_gained,
            "breakdown": breakdown,
            "new_xp": new_xp,
            "level_info": level_info,
        },
    )

    if leveled_up:
        await channel_layer.group_send(
            group_name,
            {
                "type": "level.up",
                "old_level": old_level,
                "new_level": new_level,
                "new_xp": new_xp,
                "level_info": level_info,
            },
        )
```

Location: `backend/apps/analytics/achievement_service.py:435-462`

```python
async def _send_unlock_notifications(
    user_id: int,
    unlocked: list[dict[str, Any]],
) -> None:
    channel_layer = get_channel_layer()
    if channel_layer is None:
        logger.warning("No channel layer — cannot send achievement notifications")
        return

    group_name = f"notifications_{user_id}"

    for achievement_data in unlocked:
        await channel_layer.group_send(
            group_name,
            {
                "type": "achievement.unlocked",
                "achievement": achievement_data,
            },
        )
```

### Frontend socket layer

Location: `frontend/src/hooks/useGameSocket.ts:1-152`

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken, refreshAccessToken } from '../services/api';

export type WsStatus = 'connecting' | 'open' | 'closed' | 'error' | 'reconnecting';

interface UseGameSocketOptions {
  onMessage: (data: Record<string, unknown>) => void;
  onOpen?: () => void;
  onClose?: (event?: CloseEvent) => void;
  autoReconnect?: boolean;
}

const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 5000;

export function useGameSocket(path: string | null, opts: UseGameSocketOptions) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  const closedIntentionally = useRef(false);
  const optsRef = useRef(opts);
  const [status, setStatus] = useState<WsStatus>('closed');

  optsRef.current = opts;

  useEffect(() => {
    if (!path) {
      setStatus('closed');
      return;
    }

    let cancelled = false;
    closedIntentionally.current = false;
    reconnectAttempts.current = 0;

    const getSocketUrl = async (forceRefresh = false) => {
      let token = getAccessToken();
      if ((!token || forceRefresh) && !(await refreshAccessToken())) {
        return null;
      }
      token = getAccessToken();
      if (!token) return null;

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      return `${protocol}://${window.location.host}${path}?token=${encodeURIComponent(token)}`;
    };

    const scheduleReconnect = (forceRefresh = false) => {
      if (cancelled || closedIntentionally.current || optsRef.current.autoReconnect === false) {
        setStatus('closed');
        return;
      }

      reconnectAttempts.current += 1;
      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * (2 ** (reconnectAttempts.current - 1)),
        MAX_RECONNECT_DELAY_MS,
      );
      setStatus('reconnecting');
      reconnectTimer.current = window.setTimeout(() => {
        void connect(forceRefresh);
      }, delay);
    };

    const connect = async (forceRefresh = false) => {
      const url = await getSocketUrl(forceRefresh);
      if (!url) {
        setStatus('closed');
        return;
      }

      const socket = new WebSocket(url);
      ws.current = socket;

      socket.onopen = () => {
        reconnectAttempts.current = 0;
        setStatus('open');
        optsRef.current.onOpen?.();
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          optsRef.current.onMessage(data);
        } catch {
          // ignore malformed frames
        }
      };

      socket.onclose = (event) => {
        if (ws.current === socket) {
          ws.current = null;
        }
        optsRef.current.onClose?.(event);
        if (cancelled || closedIntentionally.current) {
          setStatus('closed');
          return;
        }
        scheduleReconnect(event.code === 4401);
      };
    };

    void connect();
    return () => {
      cancelled = true;
      closedIntentionally.current = true;
    };
  }, [path]);

  const send = useCallback((data: Record<string, unknown>) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  return { send, status };
}
```

### Frontend Pong integration

Location: `frontend/src/pages/PongPage.tsx:289-410`

```typescript
useEffect(() => {
  if (mode !== 'online' || onlinePhase !== 'playing') return;
  const interval = setInterval(() => {
    const keys = keysRef.current;
    let dir: 'up' | 'down' | 'stop' = 'stop';
    if (keys['w'] || keys['W'] || keys['ArrowUp']) dir = 'up';
    else if (keys['s'] || keys['S'] || keys['ArrowDown']) dir = 'down';

    if (dir !== prevDirectionRef.current) {
      prevDirectionRef.current = dir;
      gameSendRef.current({ type: 'input', direction: dir });
    }
  }, 16);
  return () => {
    clearInterval(interval);
    if (prevDirectionRef.current !== 'stop') {
      gameSendRef.current({ type: 'input', direction: 'stop' });
      prevDirectionRef.current = 'stop';
    }
  };
}, [mode, onlinePhase]);

const { send: mmSend } = useGameSocket(mmPath, {
  onOpen: useCallback(() => {
    mmSend({ type: 'find_match', game_type: 'pong' });
  }, []),
  onMessage: useCallback((data: Record<string, unknown>) => {
    if (data.type === 'match_found') {
      const gid = data.game_id as string;
      setGameId(gid);
      setMmPath(null);
      setGamePath(`/ws/game/pong/${gid}/`);
      setOnlinePhase('waiting');
    }
  }, []),
});

const { send: gameSend, status: gameSocketStatus } = useGameSocket(gamePath, {
  onOpen: useCallback(() => {
    if (gameId) gameSend({ type: 'join', game_id: gameId });
  }, [gameId]),
  onMessage: useCallback((data: Record<string, unknown>) => {
    const type = data.type as string;

    if (type === 'game_joined') {
      const slot = data.slot as number;
      setMySlot(slot);
      mySlotRef.current = slot;
    } else if (type === 'game_start') {
      setGamePaused(false);
      setOpponentLeft(false);
      setOnlinePhase('playing');
    } else if (type === 'game_state') {
      const ball = data.ball as { x: number; y: number; vx: number; vy: number };
      const p1 = data.player1 as { score: number; paddle: { y: number } } | undefined;
      const p2 = data.player2 as { score: number; paddle: { y: number } } | undefined;
      if (p1 && p2) {
        setOnlineGameState({ ball, paddles: { 1: { y: p1.paddle.y }, 2: { y: p2.paddle.y } } });
        setOnlineScore({ p1: p1.score, p2: p2.score });
      }
      setOnlinePhase((prev) => prev === 'waiting' ? 'playing' : prev);
    } else if (type === 'game_resumed') {
      setGamePaused(false);
      setOpponentLeft(false);
      setOnlinePhase('playing');
    } else if (type === 'player_presence') {
      const slot = data.slot as number;
      const connected = data.connected as boolean;
      if (slot !== mySlotRef.current) {
        setOpponentLeft(!connected);
      }
    } else if (type === 'game_paused') {
      setGamePaused(true);
    }
  }, []),
});
```

### Frontend Tic-Tac-Toe integration

Location: `frontend/src/pages/Tictactoepage.tsx:153-249`

```typescript
const { send: mmSend } = useGameSocket(mmPath, {
  onOpen: useCallback(() => {
    mmSend({ type: 'find_match', game_type: 'tictactoe' });
  }, []),
  onMessage: useCallback((data: Record<string, unknown>) => {
    if (data.type === 'match_found') {
      const gid = data.game_id as string;
      setGameId(gid);
      setMmPath(null);
      setGamePath(`/ws/game/tictactoe/${gid}/`);
      setOnlinePhase('waiting');
    } else if (data.type === 'queue_update') {
      setQueuePosition(data.position as number);
    }
  }, []),
});

const { send: gameSend, status: gameSocketStatus } = useGameSocket(gamePath, {
  onOpen: useCallback(() => {
    if (gameId) gameSend({ type: 'join', game_id: gameId });
  }, [gameId]),
  onMessage: useCallback((data: Record<string, unknown>) => {
    const type = data.type as string;

    if (type === 'game_joined') {
      const slot = data.slot as number;
      mySlotRef.current = slot;
      setMySymbol(slot === 1 ? 'X' : 'O');
    } else if (type === 'game_start') {
      setOnlinePhase('playing');
      setGamePaused(false);
      setOnlineGameState({
        board: Array(9).fill(null),
        current_turn: 'X',
      });
    } else if (type === 'game_state') {
      const boardData = data.board as CellValue[];
      const currentTurn = data.current_turn as 'X' | 'O';
      setOnlineGameState({
        board: boardData,
        current_turn: currentTurn,
      });
    } else if (type === 'game_resumed') {
      const boardData = data.board as CellValue[];
      const currentTurn = data.current_turn as 'X' | 'O';
      setOnlineGameState({
        board: boardData,
        current_turn: currentTurn,
      });
      setGamePaused(false);
      setOnlinePhase('playing');
    } else if (type === 'player_presence') {
      const slot = data.slot as number;
      const connected = data.connected as boolean;
      if (slot !== mySlotRef.current && connected) {
        setOpponentLeftMsg(null);
      }
    } else if (type === 'game_paused') {
      setGamePaused(true);
    } else if (type === 'game_over') {
      const winnerData = data.winner as 'X' | 'O' | 'draw' | null;
      setOnlineWinner(winnerData);
      setGamePaused(false);
      setOnlinePhase('game_over');
    }
  }, []),
});
```
