# Game Statistics & Match History

## Overview

This audit validates whether the current implementation satisfies the feature requirements for game stats, match history, achievements/progression, and leaderboard integration across the Django backend and React frontend.

Requirement baseline:
1. Track user game statistics (wins/losses, ranking/rating, level/progression)
2. Display match history (1v1, date/time, opponent, result)
3. Show achievements and progression
4. Integrate leaderboard ranking and display

---

## 1) Implementation Audit (strict, evidence-based)

### Requirement: Track user game statistics

**Status: ⚠️ Partial**

**Findings:**
- `backend/apps/games/models.py:144-199` → `MatchPlayer` stores `outcome`, `score`, and `xp_earned` per player.
- `backend/apps/games/stats_service.py:118-268` → user stats aggregation includes wins/losses/draws, streaks, trend, and per-game stats.
- `backend/apps/accounts/models.py:23-24` → user model stores persistent `xp` and `level`.
- `backend/apps/analytics/xp_service.py:114-159` and `306-349` → XP awarding and level update logic is implemented.
- `backend/apps/analytics/views.py:344-379` → rank is computed in XP detail endpoint.

**Gaps:**
- No rating/ELO field exists in the user model (`backend/apps/accounts/models.py:11-25`), so “ranking/rating” is only partially met (ranking yes, rating no).
- Tic-Tac-Toe online flow records matches but does not trigger XP/achievement pipeline (`backend/apps/games/tictaktoe_consumer.py:9-23`, `261-272`, `292`, `404`) while Pong does (`backend/apps/games/pong_consumer.py:8-12`, `315-317`, `350-352`, `485-487`).
- Mode taxonomy is inconsistent (`pva` vs `pve`): model choices are `pvp/pva` (`backend/apps/games/models.py:28-31`) but stats breakdown loops `pvp/pve` (`backend/apps/games/stats_service.py:183-195`) and local create accepts `pve` (`backend/apps/games/views.py:557-560`).

---

### Requirement: Display match history (1v1, date/time, opponent, result)

**Status: ✅ Fully implemented (with quality gaps)**

**Findings:**
- `backend/apps/games/models.py:33-141` → match entity stores start/end times, duration, winner, scores, metadata.
- `backend/apps/games/views.py:43-47`, `226-253` → paginated authenticated user history endpoint exists.
- `backend/apps/games/views.py:98-172`, `175-193` → filtering by game/mode/result/search/date is implemented.
- `frontend/src/pages/MatchHistoryPage.tsx:71-124` → UI fetches paginated history with filters and sorting.
- `frontend/src/pages/MatchHistoryPage.tsx:126-145`, `157-178`, `353-453` → opponent resolution, outcome badges, mode labels, result and score rendering.
- `frontend/src/pages/MatchHistoryPage.tsx:456-488` → pagination controls and state are implemented.

**Gaps:**
- Date/time is shown as relative “time ago” only (`frontend/src/pages/MatchHistoryPage.tsx:27-34`, `447`), no absolute localized datetime display.
- UI updates are refresh/filter driven, not real-time subscribed.

---

### Requirement: Show achievements and progression

**Status: ⚠️ Partial**

**Findings:**
- `backend/apps/analytics/models.py:24-172` → achievements, unlocks, and progress tables are implemented.
- `backend/apps/analytics/achievement_definitions.py:20-247` → unlockable catalog is defined.
- `backend/apps/analytics/views.py:68-250` → achievements list/progress/stats APIs exist.
- `frontend/src/pages/AchievementsPage.tsx:35-43`, `65-83`, `230-314` → achievements page fetches, filters, and renders progression.
- `frontend/src/App.tsx:107-114` and `frontend/src/components/Navbar.tsx:22` → achievements page is routed and reachable from nav.

**Gaps:**
- Achievement and XP checks run in Pong consumer but not Tic-Tac-Toe consumer (`backend/apps/games/pong_consumer.py:315-317` vs `backend/apps/games/tictaktoe_consumer.py:271`, `292`, `404`).
- Unique-opponent progression is explicitly simplified and not true unique deduplication (`backend/apps/analytics/achievement_service.py:289-299` comment+logic).
- Achievement catalog seeding is manual (`backend/apps/analytics/mangement/commands/seed_achievements.py:6-65`); no automatic startup/migration hook was found.

---

### Requirement: Leaderboard integration

**Status: ⚠️ Partial**

**Findings:**
- `backend/apps/games/views.py:487-531` → game leaderboard endpoint exists and is exposed via `backend/apps/games/urls.py:63-67`.
- `frontend/src/pages/LeaderboardPage.tsx:25-33` → leaderboard UI calls backend and renders rankings.
- `backend/apps/analytics/views.py:308-341` → separate global XP leaderboard API exists with pagination and `DenseRank`.

**Gaps:**
- Games leaderboard is hard-limited to Pong + win metric (`backend/apps/games/views.py:509-524`), not global/per-game-flexible.
- Tie handling in games leaderboard is positional only (`backend/apps/games/stats_service.py:647-649`, `652-665`), unlike analytics DenseRank.
- Bug: `total_matches` is incorrectly mapped to wins in leaderboard payload (`backend/apps/games/stats_service.py:656`).
- Frontend leaderboard consumes only Pong wins (`frontend/src/pages/LeaderboardPage.tsx:25`), not analytics global XP leaderboard.

---

## 2) Data Model Analysis

### Backend structure

- **Game records**
  - `Match` (`backend/apps/games/models.py:33-141`)
  - `MatchPlayer` (`backend/apps/games/models.py:144-204`)
- **Progression**
  - `User.xp`, `User.level` (`backend/apps/accounts/models.py:23-24`)
- **Achievements**
  - `Achievement`, `AchievementUnlock`, `AchievementProgress` (`backend/apps/analytics/models.py:24-172`)

### Relationships

- `User -> MatchPlayer -> Match` (many participations per user, two players per 1v1 match in online mode).
- `User -> AchievementUnlock` and `User -> AchievementProgress`.
- `Achievement -> Unlocks/Progress` through FKs.

### Query efficiency & scalability

**Good:**
- Match indexes on finished timestamp, type+time, mode+time (`backend/apps/games/models.py:123-136`).
- MatchPlayer user+match index (`backend/apps/games/models.py:194-199`).
- Match list APIs use `select_related/prefetch_related` (`backend/apps/games/views.py:215-218`, `245-247`, `290-291`).

**Risks / debt:**
- Cache invalidation loops through every leaderboard limit 1..100 across modes/periods (`backend/apps/games/stats_service.py:72-75`) and can become expensive under load.
- Some stat calculations iterate Python-side over match subsets (`backend/apps/games/stats_service.py:324-344`, `417-426`).
- Unique-opponent progress is intentionally approximate, not normalized (`backend/apps/analytics/achievement_service.py:289-299`).

---

## 3) API Layer Review

### Exposed endpoints

- API roots: `backend/config/urls.py:17-23`
- Games endpoints: `backend/apps/games/urls.py:16-68`
- Analytics endpoints: `backend/apps/analytics/urls.py:26-125`

### Consistency, efficiency, security

**Consistent/secure parts**
- Most feature endpoints require authentication (`backend/apps/games/views.py:209`, `236`, `440`, `502`; `backend/apps/analytics/views.py:78`, `153`, `184`, `318`, `350`).
- Match history endpoints support pagination (`backend/apps/games/views.py:43-47`, `210`, `237`, `279`).
- Analytics leaderboard also paginates (`backend/apps/analytics/views.py:302-305`, `319`).

**Problems**
- Mode naming inconsistency across API/model (`pve` accepted in multiple API paths while model enum defines `pva`): `backend/apps/games/serializers.py:70-77`, `backend/apps/games/views.py:557-560`, `backend/apps/games/models.py:28-31`.
- Games leaderboard lacks pagination object and returns top N list only (limit param), unlike analytics pagination.
- Match-history UI uses `getMyStats()` for summary cards (`frontend/src/pages/MatchHistoryPage.tsx:61-68`) though stats payload includes broader heavy sections (`frontend/src/services/games.ts:51-98`) → over-fetching for this page.

---

## 4) Frontend Integration Review

### Where feature is shown

- **Home dashboard:** recent matches + leaderboard preview (`frontend/src/pages/HomePage.tsx:56-60`, `219-340`)
- **Match history page:** full history (`frontend/src/pages/MatchHistoryPage.tsx:71-124`, `353-488`)
- **Leaderboard page:** standings (`frontend/src/pages/LeaderboardPage.tsx:23-33`, `120-151`)
- **Profile page:** pong stats, XP rank, recent unlocks (`frontend/src/pages/ProfilePage.tsx:46-52`, `69-84`, `293-347`)
- **Achievements page:** catalog/progress (`frontend/src/pages/AchievementsPage.tsx:35-43`, `230-314`)

### UX behavior assessment

- **Update model:** refresh-based API fetches (`useEffect`) on page load/filter change; no realtime subscription for history/leaderboard/achievements.
- **States:** loading and empty states are implemented in core pages.
- **Formatting:** date/time is mostly relative labels (`timeAgo`) instead of explicit localized date+time on history rows.
- **Error handling:** several pages suppress fetch errors with empty catches, limiting diagnosability.

---

## 5) Leaderboard Evaluation

### Ranking logic

- **Games leaderboard**: wins-first ordering, then XP, then total (`backend/apps/games/stats_service.py:647-649`).
- **Rank assignment**: simple `enumerate` (`backend/apps/games/stats_service.py:652-665`), no tie-aware ranking.
- **Analytics leaderboard**: `DenseRank` over XP (`backend/apps/analytics/views.py:334-337`) with paginated response.

### Correctness and performance

- Correct for “top by wins in Pong PvP”, but not generalized.
- Tie handling in games leaderboard is not mathematically stable for equal scores.
- Data bug present: `total_matches` incorrectly set from `wins` (`backend/apps/games/stats_service.py:656`).

---

## 6) Achievements & Progression

- Achievements are persisted and exposed through API/UI (`backend/apps/analytics/models.py:24-172`, `backend/apps/analytics/views.py:68-250`, `frontend/src/pages/AchievementsPage.tsx:21-317`).
- XP/levels are persisted and computed (`backend/apps/accounts/models.py:23-24`, `backend/apps/analytics/xp_service.py:58-113`, `306-349`).
- Current trigger coverage is incomplete across games:
  - Pong: achievement+XP+record pipeline present (`backend/apps/games/pong_consumer.py:315-317`, `350-352`, `485-487`)
  - Tic-Tac-Toe: only `record_match` calls (`backend/apps/games/tictaktoe_consumer.py:271`, `292`, `404`)

---

## 7) Code Extraction (relevant snippets)

### Backend — Models

**File:** `backend/apps/games/models.py`  
**Why:** Core match + per-player stat schema.

```python
class Match(models.Model):
    game_type = models.CharField(max_length=12, choices=GameType.choices, db_index=True)
    game_mode = models.CharField(max_length=12, choices=GameMode.choices, default=GameMode.PVP, db_index=True)
    winner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    started_at = models.DateTimeField()
    finished_at = models.DateTimeField()
    duration_seconds = models.FloatField(default=0.0)
    player1_score = models.IntegerField(default=0)
    player2_score = models.IntegerField(default=0)

class MatchPlayer(models.Model):
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name="players")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="match_participations")
    outcome = models.CharField(max_length=6, choices=MatchOutcome.choices, db_index=True)
    score = models.IntegerField(default=0)
    xp_earned = models.PositiveIntegerField(default=0)
```

**File:** `backend/apps/analytics/models.py`  
**Why:** Achievement storage and progression state.

```python
class Achievement(models.Model):
    key = models.CharField(max_length=60, unique=True, db_index=True)
    category = models.CharField(max_length=20, choices=AchievementCategory.choices, db_index=True)
    tier = models.CharField(max_length=12, choices=AchievementTier.choices, default=AchievementTier.BRONZE)
    xp_reward = models.PositiveIntegerField(default=0)
    threshold = models.PositiveIntegerField(default=1)

class AchievementUnlock(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="achievement_unlocks")
    achievement = models.ForeignKey(Achievement, on_delete=models.CASCADE, related_name="unlocks")
    unlocked_at = models.DateTimeField(default=timezone.now, db_index=True)

class AchievementProgress(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="achievement_progress")
    achievement = models.ForeignKey(Achievement, on_delete=models.CASCADE, related_name="progress_records")
    current = models.PositiveIntegerField(default=0)
```

### Backend — Views / APIs

**File:** `backend/apps/games/views.py`  
**Why:** Match history + stats + games leaderboard endpoints.

```python
class UserMatchListView(generics.ListAPIView):
    serializer_class = MatchListSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = MatchPagination

class UserStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def get(self, request):
        game_type = StatsQuerySerializer(data=request.query_params).validated_data.get("game_type")
        stats = get_user_stats(request.user.pk, game_type=game_type)
        return Response(stats)

class LeaderboardView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def get(self, request):
        if requested_game_type and requested_game_type != "pong":
            return Response({"detail": "Only online Pong leaderboard is supported."}, status=400)
        return Response(get_leaderboard(game_type="pong", period=period, limit=limit))
```

**File:** `backend/apps/analytics/views.py`  
**Why:** Achievement APIs + global XP leaderboard + user XP rank.

```python
class AchievementListView(generics.ListAPIView):
    serializer_class = AchievementWithUserStatusSerializer
    permission_classes = [permissions.IsAuthenticated]

class AchievementStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def get(self, request):
        # total/unlocked/locked/xp/category/tier breakdown
        return Response(data)

class LeaderboardView(generics.ListAPIView):
    serializer_class = LeaderboardEntrySerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = LeaderboardPagination
```

### Backend — Services / Logic

**File:** `backend/apps/games/match_recording_service.py`  
**Why:** Persists finished sessions, writes Match/MatchPlayer rows.

```python
match = Match.objects.create(
    game_session_id=session.game_id,
    game_type=game_type,
    game_mode=game_mode,
    winner=winner_user,
    duration_seconds=round(max(duration, 0), 2),
)

MatchPlayer.objects.create(
    match=match,
    user_id=player_slot.user_id,
    outcome=outcome,
    score=score,
    xp_earned=int(xp_awards.get(player_slot.user_id, 0)) if xp_awards else 0,
)
```

**File:** `backend/apps/games/stats_service.py`  
**Why:** Aggregates stats and leaderboard.

```python
player_stats = player_stats.order_by("-wins", "-total_xp", "-total")[:limit]
return [
    {
        "rank": idx + 1,
        "user_id": str(row["user_id"]),
        "total_matches": row["wins"],  # current implementation
        "wins": row["wins"],
    }
    for idx, row in enumerate(player_stats)
]
```

**File:** `backend/apps/analytics/achievement_service.py`  
**Why:** Unlock/progress orchestration.

```python
async def check_achievements_after_game(session: GameSession) -> None:
    for slot, player_slot in session.players.items():
        newly_unlocked = await _evaluate_all_checkers(...)
        if newly_unlocked:
            await _send_unlock_notifications(player_slot.user_id, newly_unlocked)
```

### Frontend — Pages

**File:** `frontend/src/pages/MatchHistoryPage.tsx`  
**Why:** Main history UX (filters, pagination, outcomes/opponents).

```tsx
const data = await getMyMatches(filters);
setMatches(data.results);
setCount(data.count);

const outcome = getMyOutcome(match);
const opponent = getOpponent(match);
const score = getScore(match);
```

**File:** `frontend/src/pages/LeaderboardPage.tsx`  
**Why:** Leaderboard UI integration.

```tsx
getLeaderboard({ game_type: 'pong', metric: 'wins', period, limit: 50 }).then((lb) => {
  setPlayers(lb);
});
```

**File:** `frontend/src/pages/AchievementsPage.tsx`  
**Why:** Achievements/progression presentation.

```tsx
const [achievementData, statsData, xpData] = await Promise.all([
  getAchievements(),
  getAchievementStats(),
  getMyXP(),
]);
setAchievements(achievementData);
setStats(statsData);
setRank(xpData.rank);
```

### Frontend — Components / Hooks / Services

**File:** `frontend/src/components/Navbar.tsx`  
**Why:** Exposes achievements navigation globally.

```tsx
{ label: t("navbar.achievements"), to: "/achievements", icon: <Award className="w-4 h-4" /> }
```

**File:** `frontend/src/hooks/useGameSocket.ts`  
**Why:** Realtime gameplay socket management (reconnect + latency), but not used for history/leaderboard refresh.

```ts
const [status, setStatus] = useState<WsStatus>('closed');
const [latency, setLatency] = useState<WsLatency>({ rttMs: null, clockOffsetMs: null });
```

**File:** `frontend/src/services/games.ts`  
**Why:** API contracts for stats/history/leaderboard/local match creation.

```ts
export function getMyMatches(filters: MatchFilters = {}): Promise<PaginatedMatches> { ... }
export function getMyStats(game_type?: string): Promise<UserStats> { ... }
export function getLeaderboard(params: { game_type?: string; metric?: 'wins'; ... } = {}): Promise<LeaderboardEntry[]> { ... }
```

---

## 8) Features Implemented

- Match persistence for Pong and Tic-Tac-Toe with per-player outcomes/scores.
- User match history API with filtering + pagination.
- User statistics API with streaks/trends/game-specific metrics.
- Achievements DB model + progress/unlock APIs.
- XP/level progression and notifications.
- Leaderboard UI and endpoint integration.
- Dedicated achievements page integrated into routing/nav.

---

## 9) Limitations

- Tic-Tac-Toe path does not trigger XP/achievement awarding.
- No rating/ELO implementation.
- Games leaderboard is Pong-only and win-only.
- Games leaderboard tie handling is not dense-rank and includes a `total_matches` mapping bug.
- `pve`/`pva` mode inconsistency across model, serializer, and view logic.
- Date/time shown relatively in key UIs rather than explicit localized datetime.
- Some frontend fetch failures are silently swallowed.

---

## 10) Improvements (actionable)

1. Unify progression pipeline across all online games:
   - Call `check_achievements_after_game` and `award_xp_after_game` in Tic-Tac-Toe consumer before `record_match`.
2. Fix leaderboard payload bug:
   - `total_matches` should map to aggregated `total`, not `wins`.
3. Standardize mode values:
   - Use one canonical enum (`pvp`, `pva`, `local`) across backend model/serializer/view and frontend types.
4. Add rating system if required:
   - Add rating column (e.g., ELO/MMR), update post-match, expose in stats+leaderboard.
5. Make unique-opponent tracking accurate:
   - Add normalized opponent-encounter table or dedupe query from historical matches.
6. Improve leaderboard flexibility:
   - Support per-game and global modes with explicit metric options and consistent pagination.
7. Improve UX/i18n formatting:
   - Display localized absolute datetime alongside relative labels in history cards.
8. Operational hardening:
   - Auto-seed achievements via migration/startup hook (not manual command only).

---

## Final Verdict

**Estimated completion: 70%**

The feature is **partially implemented**. Core match history and baseline stats are solid, and achievements/progression infrastructure exists, but key requirement gaps remain around progression parity (Tic-Tac-Toe), leaderboard correctness/flexibility, rating support, and a few schema/logic inconsistencies that impact accuracy.
