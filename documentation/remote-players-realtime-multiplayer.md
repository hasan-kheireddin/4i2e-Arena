# Remote Players (Real-Time Multiplayer)

## 1. Overview

### What “Remote Players” means

Remote Players allows two authenticated users on different computers to join the same game session and play in real time through WebSockets.  
The backend is server-authoritative: clients send intents (join/ready/move/input), and the server validates and broadcasts canonical state.

### High-level architecture

- **Frontend (React):** matchmaking UI, game UI, reconnect UX, connection status feedback.
- **Backend (Django + Channels):** WebSocket routing, matchmaking, session lifecycle, game consumers.
- **Redis + channel layer:** group fanout and cross-process messaging; session snapshots are also persisted.

---

## 2. System Architecture

### Client ↔ Server interaction

1. Client opens `/ws/matchmaking/` and sends `find_match`.
2. Matchmaking pairs users and emits `match_found`.
3. Client opens `/ws/game/{game_type}/{game_id}/` and sends `join`.
4. Server assigns/reclaims slot, then handles `ready` and gameplay messages.
5. Server broadcasts authoritative state/events to the game group.

### WebSocket communication flow

- **Matchmaking socket:** queue state and match assignment.
- **Game socket:** join/ready, game state, disconnect/reconnect, pause/resume, game over.
- **Auth middleware:** validates JWT and sets `scope["user"]`.

### Matchmaking flow

- Queue entry with `find_match`.
- Service attempts pairing.
- If paired, each player receives `match_found` with `game_id` and game metadata.
- Client transitions from matchmaking socket to game socket.

### Game session lifecycle

- `WAITING` → `PLAYING` → `FINISHED` or `ABANDONED`.
- On disconnect during `PLAYING`, the session pauses and starts grace timeout.
- Reconnect can reclaim slot and resume; timeout can lead to disconnect forfeit.

---

## 3. Real-Time Communication

WebSockets are used for bidirectional, low-latency events between browser and backend consumers.

| Category | Example message types |
|---|---|
| Matchmaking | `find_match`, `queue_joined`, `queue_update`, `match_found`, `cancel` |
| Session/lobby | `join`, `game_joined`, `player_ready`, `game_start` |
| Gameplay | `input` (Pong), `move` (Tic-Tac-Toe), `game_state`, `game_over`, `forfeit` |
| Presence/recovery | `player_presence`, `game_paused`, `game_resumed`, `player_left` |
| Connectivity telemetry | `ping`, `pong` |

---

## 4. Reconnection Logic

### Client-side strategy

- Automatic reconnect with exponential backoff.
- Token refresh path when server closes with auth error (e.g., 4401).
- Re-run open handlers on reconnect (re-join flow).
- UI receives socket status (`connecting`, `reconnecting`, `open`, etc.).

### Server-side strategy

- Reclaim player slot by user identity when reconnecting.
- Mark disconnected players, broadcast presence updates.
- Pause active games on disconnect.
- Cancel disconnect timeout tasks when user reconnects.
- Resume when all required players are connected.

### Grace timeout + forfeit

- If a disconnected player does not return before grace deadline:
  - Active game: disconnect forfeit path.
  - Waiting lobby: session/lobby cancellation behavior.

---

## 5. Disconnection Handling

### Automatic pause behavior

When a player disconnects during an active match, the server pauses gameplay and broadcasts a pause event with reconnect window information.

### Resume conditions

- Player reconnects in time.
- Slot is reclaimed successfully.
- Consumer/session confirms both sides are connected and game can continue.

### Edge cases handled

- Disconnect during waiting lobby.
- Reconnect while grace timer is already running.
- Duplicate joins from same user/channel.
- Opponent-left notifications and controlled match termination.

---

## 6. User Experience Considerations

- Explicit connectivity state badges (`reconnecting`, `paused`, `live`).
- Realtime recovery overlays during temporary connection loss.
- Opponent presence feedback.
- Server-authoritative updates to avoid client divergence.
- RTT display in online HUD for visibility into network quality.

---

## 7. Known Limitations

1. **No full latency compensation architecture:** there is no full rollback/prediction pipeline.
2. **Session continuity risk remains around runtime ownership/tasks:** process-local runtime session map still exists (`_sessions`) and can be sensitive to restart/coordination boundaries.
3. **Matchmaking queue reconnection is not a fully durable ticket system across all failure modes.**
4. **Deployment defaults are development-oriented:** production requires explicit host/origin/TLS hardening.

---

## 8. Possible Improvements

1. Add full netcode compensation: sequence IDs, prediction/reconciliation, rollback where needed.
2. Move session authority to fully durable shared store with worker-safe ownership and recovery.
3. Implement durable matchmaking tickets for robust reconnect/resume across restarts.
4. Add production deployment profile (strict CORS/CSRF/origin policy, observability, health checks).

---

# Relevant Code by File

## Frontend (React / hooks / pages)

### File: `frontend/src/hooks/useGameSocket.ts`

```ts
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 5000;

// Builds authenticated socket URL, optionally refreshing token first.
const getSocketUrl = async (forceRefresh = false): Promise<string | null> => {
  let token = getAccessToken();
  if ((!token || forceRefresh) && !(await refreshAccessToken())) return null;
  token = getAccessToken();
  if (!token) return null;

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}${path}?token=${encodeURIComponent(token)}`;
};

// Exponential backoff reconnect path.
const scheduleReconnect = (forceRefresh = false) => {
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

socket.onclose = (event) => {
  socketRef.current = null;
  optsRef.current.onClose?.(event);
  if (closedIntentionally.current) {
    setStatus('closed');
    return;
  }
  const forceRefresh = event.code === 4401; // auth-related close
  scheduleReconnect(forceRefresh);
};
```

### File: `frontend/src/pages/PongPage.tsx`

```tsx
// Matchmaking socket starts queueing for online Pong.
const { send: mmSend } = useGameSocket(mmPath, {
  onOpen: useCallback(() => {
    mmSend({ type: 'find_match', game_type: 'pong' });
  }, [mmSend]),
  onMessage: useCallback((msg) => {
    if (msg.type === 'match_found') {
      setGameId(msg.game_id);
      setGamePath(`/ws/game/pong/${msg.game_id}/`);
      setMmPath(null);
      setOnlinePhase('waiting');
    }
  }, []),
});

// Game socket handles join/ready/state/pause/resume.
const { send: gameSend, status: gameSocketStatus, latency: gameLatency } = useGameSocket(gamePath, {
  enableLatencyProbe: true,
  onOpen: useCallback(() => {
    if (gameId) gameSend({ type: 'join', game_id: gameId });
  }, [gameId, gameSend]),
  onMessage: useCallback((msg) => {
    if (msg.type === 'game_state') {
      setOnlineGameState(msg.state);
    } else if (msg.type === 'game_paused') {
      setGamePaused(true);
    } else if (msg.type === 'game_resumed') {
      setGamePaused(false);
      setOnlinePhase('playing');
    }
  }, []),
});

// Recovery overlay for reconnect/pause states.
const showRealtimeRecoveryOverlay =
  mode === 'online'
  && onlinePhase === 'playing'
  && (gamePaused || gameSocketStatus === 'reconnecting' || gameSocketStatus === 'connecting');

// HUD latency feedback.
// RTT {gameLatency.rttMs === null ? '--' : `${Math.round(gameLatency.rttMs)}ms`}
```

### File: `frontend/src/pages/Tictactoepage.tsx`

```tsx
// Matchmaking flow for online Tic-Tac-Toe.
const { send: mmSend } = useGameSocket(mmPath, {
  onOpen: useCallback(() => {
    mmSend({ type: 'find_match', game_type: 'tictactoe' });
  }, [mmSend]),
  onMessage: useCallback((msg) => {
    if (msg.type === 'match_found') {
      setGameId(msg.game_id);
      setGamePath(`/ws/game/tictactoe/${msg.game_id}/`);
      setMmPath(null);
      setOnlinePhase('waiting');
    }
  }, []),
});

// Online game socket with reconnect-aware status and pause handling.
const { send: gameSend, status: gameSocketStatus, latency: gameLatency } = useGameSocket(gamePath, {
  enableLatencyProbe: true,
  onOpen: useCallback(() => {
    if (gameId) gameSend({ type: 'join', game_id: gameId });
  }, [gameId, gameSend]),
  onMessage: useCallback((msg) => {
    if (msg.type === 'game_state') setOnlineGameState(msg);
    if (msg.type === 'game_paused') setGamePaused(true);
    if (msg.type === 'game_resumed') setGamePaused(false);
  }, []),
});
```

## Backend (WebSocket consumers, session management, matchmaking)

### File: `backend/config/routing.py`

```py
websocket_urlpatterns = [
    re_path(r"ws/game/pong/(?P<game_id>[^/]+)/$", PongConsumer.as_asgi()),
    re_path(r"ws/game/tictactoe/(?P<game_id>[^/]+)/$", TicTacToeConsumer.as_asgi()),
    re_path(r"ws/matchmaking/$", MatchmakingConsumer.as_asgi()),
]
```

### File: `backend/config/asgi.py`

```py
websocket_app = JWTAuthMiddleware(URLRouter(websocket_urlpatterns))

# Origin validation strategy is config-driven.
if settings.CORS_ALLOW_ALL_ORIGINS:
    websocket_app = AllowedHostsOriginValidator(websocket_app)
else:
    websocket_app = OriginValidator(
        websocket_app,
        allowed_origins=settings.CORS_ALLOWED_ORIGINS,
    )

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": websocket_app,
})
```

### File: `backend/config/channelsmiddleware.py`

```py
class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        if scope["type"] != "websocket":
            await super().__call__(scope, receive, send)
            return
        scope["user"] = await self._authenticate(scope)
        await super().__call__(scope, receive, send)

    @staticmethod
    def _extract_token(scope):
        qs = parse_qs(scope.get("query_string", b"").decode("utf-8"))
        tokens = qs.get("token")
        if not tokens:
            return None
        qs.pop("token", None)  # Prevent token leakage to downstream handlers/logs.
        scope["query_string"] = urlencode(qs, doseq=True).encode("utf-8")
        return tokens[0]
```

### File: `backend/apps/games/consumers.py`

```py
class BaseConsumer(AsyncWebsocketConsumer):
    require_auth: bool = True

    async def connect(self):
        self.user = self.scope.get("user")
        if self.require_auth and (
            self.user is None or not getattr(self.user, "is_authenticated", False)
        ):
            await self.close(code=4401)
            return
        await self.accept()
        await self.on_connect()

    async def send_error(self, error_code, message, details=None):
        payload = {"type": "error", "error": error_code, "message": message}
        if details is not None:
            payload["details"] = details
        await self.send_json(payload)

    async def broadcast(self, group, data, handler="group.message"):
        payload = {k: v for k, v in data.items() if k != "type"}
        payload["type"] = handler
        await self.channel_layer.group_send(group, payload)
```

### File: `backend/apps/games/matchmaking_consumer.py`

```py
class MatchmakingConsumer(BaseConsumer):
    async def on_message(self, content):
        message_type = content.get("type", "")
        if message_type == "find_match":
            await self._handle_find_match(content)
        elif message_type == "cancel":
            await self._handle_cancel()
        elif message_type == "status":
            await self._handle_status()
        else:
            await self.send_error("unknown_message_type", "Unsupported message type")

    async def _handle_find_match(self, content):
        game_type = content.get("game_type")
        enqueue_result = await self._service.enqueue(
            user_id=self.user.pk,
            username=getattr(self.user, "username", f"user-{self.user.pk}"),
            game_type=game_type,
        )
        await self.send_json({
            "type": "queue_joined",
            "game_type": game_type,
            "resumed": enqueue_result["resumed"],
        })
```

### File: `backend/apps/games/matchmaking.py`

```py
class MatchmakingService:
    # Enqueue user metadata and return whether this was queue resume.
    async def enqueue(self, user_id: int, username: str, game_type: str) -> dict[str, bool]:
        ...

    # Try to atomically pop two queued users and create a match payload.
    async def try_match(self, game_type: str) -> dict | None:
        ...

    # Remove stale queue members and metadata.
    async def cleanup_disconnected(self) -> int:
        ...
```

### File: `backend/apps/games/pong_consumer.py`

```py
async def on_disconnect(self, code: int) -> None:
    if self._session is None or self._slot is None:
        return

    session = self._session
    slot = self._slot
    session.mark_player_disconnected(slot)

    await self.broadcast(
        session.group_name,
        {"slot": slot, "connected": False, "game_info": session.to_info()},
        handler="player.presence",
    )

    if session.status == SessionStatus.PLAYING:
        session.paused = True
        session.pause_reason = "player_disconnected"
        await self.broadcast(
            session.group_name,
            {"slot": slot, "reason": "player_disconnected", "resume_deadline_seconds": RECONNECT_GRACE_SECONDS},
            handler="game.paused",
        )

    await self._schedule_disconnect_resolution(session, slot)

async def _resolve_disconnect_after_grace(self, game_id: str, slot: int) -> None:
    await asyncio.sleep(RECONNECT_GRACE_SECONDS)
    session = await get_session_async(game_id)
    if session is None:
        return
    player = session.players.get(slot)
    if player is None or player.connected:
        return
    # If still disconnected after grace, finish as disconnect forfeit.
    if session.status == SessionStatus.PLAYING:
        ...
```

### File: `backend/apps/games/tictaktoe_consumer.py`

```py
async def on_message(self, content: dict) -> None:
    message_type = content.get("type", "")
    if message_type == "join":
        await self._handle_join(content)
    elif message_type == "ready":
        await self._handle_ready()
    elif message_type == "move":
        await self._handle_move(content)
    elif message_type == "forfeit":
        await self._handle_forfeit()
    elif message_type == "ping":
        await self.send_json({
            "type": "pong",
            "client_ts_ms": content.get("client_ts_ms"),
            "server_ts_ms": int(time.time() * 1000),
        })

async def _resolve_disconnect_after_grace(self, game_id: str, slot: int) -> None:
    await asyncio.sleep(RECONNECT_GRACE_SECONDS)
    session = await get_session_async(game_id)
    if session is None:
        return
    player = session.players.get(slot)
    if player is None or player.connected:
        return
    if session.status == SessionStatus.PLAYING:
        # Disconnect timeout => forfeit.
        ...
```

### File: `backend/apps/games/session.py`

```py
_sessions: dict[str, GameSession] = {}

async def persist_session(session: GameSession) -> None:
    redis_client = _get_redis_client()
    if redis_client is None:
        return
    raw = json.dumps(_serialize_session(session))
    await redis_client.set(_session_key(session.game_id), raw, ex=_SESSION_STORE_TTL_SECONDS)

async def get_session_async(game_id: str) -> Optional[GameSession]:
    local = get_session(game_id)
    if local is not None:
        return local
    redis_client = _get_redis_client()
    if redis_client is None:
        return None
    raw = await redis_client.get(_session_key(game_id))
    if not raw:
        return None
    payload = json.loads(raw)
    recovered = _prepare_recovered_session(_deserialize_session(payload))
    _sessions[game_id] = recovered
    return recovered

async def remove_session_async(game_id: str) -> Optional[GameSession]:
    session = remove_session(game_id)
    redis_client = _get_redis_client()
    if redis_client is not None:
        await redis_client.delete(_session_key(game_id))
    return session
```

### File: `backend/config/settings.py`

```py
ALLOWED_HOSTS = [h.strip() for h in config("DJANGO_ALLOWED_HOSTS", default="localhost,127.0.0.1").split(",") if h.strip()]

CORS_ALLOW_ALL_ORIGINS = config("CORS_ALLOW_ALL_ORIGINS", default=DEBUG, cast=bool)
_cors_raw = config("CORS_ALLOWED_ORIGINS", default="")
CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_raw.split(",") if o.strip()] if not CORS_ALLOW_ALL_ORIGINS else []

_csrf_raw = config("CSRF_TRUSTED_ORIGINS", default="")
CSRF_TRUSTED_ORIGINS = [o.strip() for o in _csrf_raw.split(",") if o.strip()]
```

### File: `docker-compose.yml`

```yaml
environment:
  - DJANGO_ALLOWED_HOSTS=${DJANGO_ALLOWED_HOSTS:-*}
  - CORS_ALLOW_ALL_ORIGINS=${CORS_ALLOW_ALL_ORIGINS:-True}
  - CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS:-https://localhost:8443,https://127.0.0.1:8443,https://host.docker.internal:8443}
  - CSRF_TRUSTED_ORIGINS=${CSRF_TRUSTED_ORIGINS:-https://localhost:8443,https://127.0.0.1:8443,https://host.docker.internal:8443}
  - GAME_SESSION_TTL_SECONDS=${GAME_SESSION_TTL_SECONDS:-1800}
```
