# Major Implementation Documentation  
## Add another game with user history and matchmaking

This document explains, in detail, how the major requirement was implemented across backend and frontend:

1. Implement a second distinct game.
2. Track user history and statistics for this game.
3. Implement matchmaking.
4. Maintain performance and responsiveness.

It also includes the corrective work applied to close gaps found during review (notably leaderboard/game-mode consistency), and ends with a code index + key snippets and exact file locations.

---

## 1) High-level result

The platform now supports **two distinct games**:

- **Pong**
- **Tic-Tac-Toe (`tictactoe`)**

Both games are integrated with:

- match persistence,
- per-user history,
- aggregate and game-specific stats,
- online realtime play,
- centralized matchmaking queue for online mode.

In addition, leaderboard behavior was aligned so that it can filter by game type (`pong`, `tictactoe`, or all), and game-mode naming was normalized around `pva` (with legacy `pve` compatibility).

---

## 2) Architecture overview

### 2.1 Core backend layers

1. **Realtime game/session layer**
   - In-memory + Redis-backed session model and game lifecycle.
   - Authoritative game engines.
   - WebSocket consumers for live gameplay.

2. **Match recording layer**
   - Converts finished in-memory sessions into persistent DB records (`Match`, `MatchPlayer`).
   - Stores metadata, scores, outcomes, winner, finish reason, XP earned.

3. **History/stats API layer**
   - REST endpoints for list/detail/history filters and statistics.
   - Cached analytics (overview, trends, game-specific metrics, H2H, leaderboard).

4. **Matchmaking layer**
   - Redis queues per game type.
   - Queue resume on reconnect + stale cleanup + atomic pairing.

### 2.2 Core frontend layers

1. **Game selection and routing**
   - Select game + mode (online/local/AI where applicable), route to game pages.

2. **Realtime game UIs**
   - Pong page and Tic-Tac-Toe page support online sockets + matchmaking handoff.
   - Local mode writes match records via API.

3. **History/stats UIs**
   - Match history supports filters including both games.
   - Leaderboard supports period and game filter.

4. **Realtime connectivity helper**
   - Shared WebSocket hook with reconnect backoff and latency probing.

---

## 3) Backend implementation details

## 3.1 Second game domain model support

The persistent match model supports both game types and outcomes:

- `GameType`: `pong`, `tictactoe`
- `GameMode`: `pvp`, `pva`
- finish reasons: score/draw/forfeit/disconnect_forfeit/canceled/server_error
- per-player participation rows (`MatchPlayer`) with outcome + score + XP.

**File:** `backend/apps/games/models.py`  
**Key lines:** `8-31`, `33-205`

---

## 3.2 Session engine support for both games

The game-session core defines:

- `GameType` enum including `TICTACTOE`,
- session states (`WAITING`, `PLAYING`, `FINISHED`, `ABANDONED`),
- disconnect/pause/resume tracking,
- winner and finish reason bookkeeping.

**File:** `backend/apps/games/session.py`  
**Key lines:** `23-42`, `55-160`

---

## 3.3 Tic-Tac-Toe engine (distinct second game)

The Tic-Tac-Toe engine provides complete server-authoritative logic:

- board model, turn order, move validation,
- invalid move reasons (`NOT_YOUR_TURN`, `CELL_OCCUPIED`, etc.),
- win/draw detection,
- block-count stats in engine state,
- serializable state for WS broadcast.

**File:** `backend/apps/games/tictactoe_engine.py`  
**Key lines:** `58-76`, `82-353`

---

## 3.4 Tic-Tac-Toe realtime consumer

The Tic-Tac-Toe WS consumer supports:

- join/rejoin,
- ready handshake,
- move handling + validation + state broadcast,
- game over handling + XP + achievements + DB recording,
- forfeit flow,
- disconnect grace handling (`12s`) with pause/resume and disconnect forfeit.

**File:** `backend/apps/games/tictaktoe_consumer.py`  
**Key lines:** `28-31`, `82-312`, `381-513`

> Note: filename uses `tictaktoe_consumer.py` (typo in filename), but the route correctly maps it to `/ws/game/tictactoe/<game_id>/`.

---

## 3.5 Match recording for both games

Finished sessions are persisted via `record_match(...)`:

- creates `Match`,
- creates `MatchPlayer` rows per human player,
- maps winners/outcomes/scores per game type,
- extracts game-specific metadata (`pong_stats`, `ttt_stats`, board, total_moves),
- invalidates user stats cache,
- tracks analytics for online Pong PvP.

**File:** `backend/apps/games/match_recording_service.py`  
**Key lines:** `27-53`, `55-167`, `238-358`

---

## 3.6 Matchmaking implementation

### Service layer (`MatchmakingService`)

- Queue per game type in Redis.
- Reconnect resume behavior (preserve queue slot while disconnected).
- Atomic pairing using `LPOP key 2`.
- Candidate status model: `ready`, `waiting`, `expired`, `stale`.
- Periodic cleanup of stale/expired entries.
- Queue info: position/queue length/estimated wait.

**File:** `backend/apps/games/matchmaking.py`  
**Key lines:** `10-31`, `49-131`, `132-175`, `176-246`, `247-327`, `370-388`

### Consumer layer (`MatchmakingConsumer`)

- WS message types: `find_match`, `cancel`, `status`.
- Validates `game_type` using enum-derived set.
- Immediate match attempt on enqueue.
- Queue update loop for position updates.
- Per-user channel-layer groups for match notifications.
- Leader-election lock for distributed cleanup sweeps.
- Queue resume grace on disconnect.

**File:** `backend/apps/games/matchmaking_consumer.py`  
**Key lines:** `13-29`, `49-84`, `85-153`, `188-210`, `242-263`, `264-293`

---

## 3.7 History/statistics APIs

The REST layer provides:

- match list/detail/history endpoints,
- flexible query filters (`game_type`, `mode`, `result`, search, ordering),
- user stats and public stats,
- head-to-head stats,
- leaderboard endpoint with period/game filters.

**Files:**

- `backend/apps/games/urls.py` (`18-68`)
- `backend/apps/games/views.py` (`59-173`, `196-297`, `299-529`, `531-629`)
- `backend/apps/games/serializers.py` (`6-95`)

---

## 3.8 Stats computation and caching

Stats service supports:

- cached user overview and breakdowns,
- streaks, trends, finish-reason breakdown,
- game-specific analytics:
  - Pong: score differential, shutouts, forfeit stats
  - Tic-Tac-Toe: draw rate, win-as-X/O, avg moves, perfect wins
- head-to-head aggregation,
- leaderboard ranking by wins + tie-breakers.

**File:** `backend/apps/games/stats_service.py`  
**Key lines:** `34-77`, `80-271`, `274-452`, `455-574`, `577-668`

---

## 3.9 Important corrective fixes applied

During audit, several inconsistencies were fixed:

1. **Leaderboard no longer hardcoded to Pong**
   - Endpoint now accepts serializer-validated `game_type` and forwards it to stats service.
   - **File:** `backend/apps/games/views.py` (`491-528`)

2. **Leaderboard `total_matches` corrected**
   - Previously mapped to wins; now mapped to aggregate total.
   - **File:** `backend/apps/games/stats_service.py` (`653-666`, specifically `659`)

3. **Game mode consistency (`pva` with legacy `pve` compatibility)**
   - Filters and summaries now aggregate AI matches through `("pva", game_mode in ["pva", "pve"])`.
   - Local-match create endpoint accepts both and normalizes to `pva`.
   - **Files:**  
     - `backend/apps/games/views.py` (`66-69`, `127-130`, `352-355`, `554-558`, `576-577`)  
     - `backend/apps/games/stats_service.py` (`183-186`)

4. **Public stats hide AI mode robustly**
   - Removes `pva` and legacy `pve` keys.
   - **File:** `backend/apps/games/views.py` (`472-474`)

---

## 4) Frontend implementation details

## 4.1 Game routes and navigation

Protected full-screen routes exist for both games:

- `/games/pong`
- `/games/tictactoe`

**File:** `frontend/src/App.tsx`  
**Key lines:** `129-146`

---

## 4.2 Game selection flow

Play page supports selecting game and mode:

- Pong: online / AI / local
- Tic-Tac-Toe: online / local

Then routes to proper game page with mode query params.

**File:** `frontend/src/pages/PlayPage.tsx`  
**Key lines:** `7-10`, `18-28`, `56-67`

---

## 4.3 Tic-Tac-Toe page (local + online + matchmaking)

Implements:

- local gameplay and local match persistence (`createLocalMatch` with `game_type: tictactoe`),
- matchmaking socket (`find_match`, queue updates),
- game socket lifecycle (`join`, `ready`, `move`, pause/resume, game over),
- reconnect-aware UX states.

**File:** `frontend/src/pages/Tictactoepage.tsx`  
**Key lines:** `34-40`, `78-127`, `152-171`, `173-254`, `257-271`

---

## 4.4 Pong page integration

Pong page includes:

- online matchmaking + game WS,
- local/AI modes with local match creation,
- latency-aware interpolation buffers for smooth rendering,
- reconnect and pause handling in online sessions.

**File:** `frontend/src/pages/PongPage.tsx`  
**Key lines:** `11-37`, `243-277`, `329-346`, `349-443`

---

## 4.5 Match history page for both games

History page supports:

- game filter (`all`, `pong`, `tictactoe`),
- result filter, mode filter, search, ordering,
- paginated API fetch and user-friendly card rendering.

**File:** `frontend/src/pages/MatchHistoryPage.tsx`  
**Key lines:** `14-18`, `88-100`, `170-178`, `225-240`

---

## 4.6 Leaderboard page enhancements

Leaderboard UI now supports:

- period filter (`daily`, `weekly`, `monthly`),
- game filter (`all`, `pong`, `tictactoe`),
- corresponding API query forwarding.

**File:** `frontend/src/pages/LeaderboardPage.tsx`  
**Key lines:** `7`, `19-21`, `25-37`, `66-118`

---

## 4.7 Shared game service API contracts

The games service layer defines all client-side contracts for:

- matches/history,
- stats,
- leaderboard,
- local match creation.

Types include both game types and both AI mode spellings for compatibility.

**File:** `frontend/src/services/games.ts`  
**Key lines:** `26-42`, `51-99`, `115-128`, `132-193`

---

## 4.8 Realtime socket resiliency and latency

Shared socket hook includes:

- JWT-refresh-aware reconnect,
- exponential backoff reconnect scheduling,
- optional ping/pong latency probe with smoothed RTT and clock offset.

This is used by game pages for responsiveness under unstable networks.

**File:** `frontend/src/hooks/useGameSocket.ts`  
**Key lines:** `20-23`, `81-119`, `153-205`

---

## 5) Matchmaking + game flow walkthrough (end-to-end)

## 5.1 Online Tic-Tac-Toe flow

1. Client opens `/ws/matchmaking/` and sends `find_match` with `game_type: tictactoe`.
2. Backend enqueues user in per-game Redis queue.
3. Backend attempts immediate pair creation (`try_match`).
4. On pairing, both users receive `match_found` with `game_id` + opponent info.
5. Clients connect to `/ws/game/tictactoe/<game_id>/`.
6. Both join and send `ready`; game starts when both ready.
7. Moves are validated server-side; authoritative state broadcasts to both clients.
8. On finish, backend awards XP, records match, invalidates stats cache.

---

## 5.2 Local Tic-Tac-Toe flow

1. Game runs entirely on frontend for board interactions.
2. At game end, frontend posts `/api/games/matches/create/` with:
   - `game_type: tictactoe`
   - mode + winner + duration + scores + metadata.
3. Backend stores `Match` + one `MatchPlayer` (the authenticated player).
4. User stats cache is invalidated.

---

## 5.3 Disconnect/reconnect handling

- During online game:
  - disconnect sets game paused,
  - grace window allows reconnect,
  - reconnect resumes state if both present,
  - if grace expires, disconnected player forfeits.

- During matchmaking:
  - queue slot can be temporarily preserved,
  - cleanup removes stale/expired queued users,
  - lock ensures only one consumer performs cleanup cycle at a time.

---

## 6) Performance and responsiveness considerations

Implemented mechanisms:

1. **Realtime rate limiting**
   - TTT move rate limit (`MOVE_RATE_LIMIT`, `MOVE_RATE_WINDOW`).
   - Pong input rate limit (in Pong consumer).

2. **Session pause/resume instead of immediate termination**
   - Reduces accidental loss from transient network blips.

3. **Cached stats + leaderboard**
   - `STATS_CACHE_TTL` and `LEADERBOARD_CACHE_TTL` reduce repeated heavy aggregates.

4. **Latency compensation on frontend**
   - ping/pong RTT and clock offset smoothing,
   - interpolation/extrapolation window for Pong rendering.

5. **Atomic matchmaking pops**
   - `LPOP key 2` avoids race conditions between workers while pairing.

---

## 7) Validation status

In this environment:

- Frontend production build succeeds.
- Frontend type-check succeeds.
- Backend Python module syntax compile succeeds.

Full containerized backend integration tests were not runnable here due missing Docker runtime in this shell, but implementation consistency was verified by tracing all connected paths and schema/API contracts.

---

## 8) Related code (locations + purpose)

### Backend core

- `backend/apps/games/models.py`  
  Defines `Match` / `MatchPlayer`, game types, modes, outcomes, finish reasons.

- `backend/apps/games/session.py`  
  In-memory session lifecycle for both game types; pause/resume/disconnect metadata.

- `backend/apps/games/tictactoe_engine.py`  
  Authoritative Tic-Tac-Toe game logic.

- `backend/apps/games/tictaktoe_consumer.py`  
  Realtime Tic-Tac-Toe multiplayer consumer (join, ready, move, reconnect, finalize).

- `backend/apps/games/pong_consumer.py`  
  Realtime Pong multiplayer consumer with reconnect and tick loop.

- `backend/apps/games/match_recording_service.py`  
  Converts finished sessions to DB match records + metadata + outcomes + XP.

- `backend/apps/games/matchmaking.py`  
  Redis matchmaking queue implementation.

- `backend/apps/games/matchmaking_consumer.py`  
  WebSocket API for matchmaking operations and queue notifications.

- `backend/apps/games/stats_service.py`  
  Cached stats, H2H, leaderboard computations, game-specific metrics.

- `backend/apps/games/views.py`  
  REST endpoints for matches/stats/leaderboard/local record creation.

- `backend/apps/games/serializers.py`  
  Query param validation for filters and leaderboard/stat endpoints.

- `backend/apps/games/urls.py`  
  REST route map.

- `backend/config/routing.py`  
  WebSocket route map (`pong`, `tictactoe`, `matchmaking`).

### Frontend core

- `frontend/src/App.tsx`  
  Protected routes for `/games/pong` and `/games/tictactoe`.

- `frontend/src/pages/PlayPage.tsx`  
  Game + mode selection workflow.

- `frontend/src/pages/Tictactoepage.tsx`  
  Local and online TTT UI, matchmaking and game socket handling.

- `frontend/src/pages/PongPage.tsx`  
  Local/AI/online Pong UI, matchmaking/game sockets, interpolation.

- `frontend/src/pages/MatchHistoryPage.tsx`  
  Unified history UI across `pong` + `tictactoe`.

- `frontend/src/pages/LeaderboardPage.tsx`  
  Leaderboard filters for period + game type.

- `frontend/src/services/games.ts`  
  Typed API client for games/matches/stats/leaderboard/local record.

- `frontend/src/hooks/useGameSocket.ts`  
  Shared reconnecting WebSocket hook with latency probes.

---

## 9) Key code excerpts with location

### 9.1 Matchmaking queue is game-type aware
**File:** `backend/apps/games/matchmaking.py` (`14-17`, `176-190`)

```python
def _queue_key(game_type: str) -> str:
    return f"{_KEY_PREFIX}:queue:{game_type}"

async def try_match(self, game_type: str) -> dict[str, Any] | None:
    queue_key = _queue_key(game_type)
    popped: list[bytes] | None = await self._redis.lpop(queue_key, 2)
```

### 9.2 Tic-Tac-Toe engine included in session/game type enum
**File:** `backend/apps/games/session.py` (`23-26`)

```python
class GameType(str, enum.Enum):
    PONG = "pong"
    TICTACTOE = "tictactoe"
```

### 9.3 Tic-Tac-Toe match recording from consumer
**File:** `backend/apps/games/tictaktoe_consumer.py` (`273-275`)

```python
xp_awards = await award_xp_after_game(session)
await record_match(session, xp_awards=xp_awards)
await check_achievements_after_game(session)
```

### 9.4 Stats support both game types and normalized AI mode
**File:** `backend/apps/games/stats_service.py` (`161-162`, `183-186`)

```python
for gt in ["pong", "tictactoe"]:
    ...
for gm, gm_filter in (
    ("pvp", Q(match__game_mode="pvp")),
    ("pva", Q(match__game_mode__in=["pva", "pve"])),
):
```

### 9.5 Leaderboard no longer hardcoded to Pong
**File:** `backend/apps/games/views.py` (`519-527`)

```python
game_type = query.validated_data.get("game_type")
data = get_leaderboard(
    game_type=game_type,
    period=period,
    limit=limit,
)
```

### 9.6 Frontend leaderboard game filter
**File:** `frontend/src/pages/LeaderboardPage.tsx` (`20`, `27-29`, `93-100`)

```tsx
const [gameFilter, setGameFilter] = useState<LeaderboardGameFilter>('all');
const gameType = gameFilter === 'all' ? undefined : gameFilter;
getLeaderboard({ game_type: gameType, metric: 'wins', period, limit: 50 })
```

### 9.7 Match history includes Tic-Tac-Toe filter
**File:** `frontend/src/pages/MatchHistoryPage.tsx` (`14`, `94`, `225`)

```tsx
type GameFilter = 'all' | 'pong' | 'tictactoe';
if (gameFilter !== 'all') filters.game_type = gameFilter;
{(['all', 'pong', 'tictactoe'] as GameFilter[]).map(...)}
```

---

If this major evolves further (e.g., adding a third game), this architecture already supports extension via:

- `GameType` enum,
- new engine + consumer,
- shared matchmaking keyed by game type,
- shared stats aggregation patterns and frontend filter model.
