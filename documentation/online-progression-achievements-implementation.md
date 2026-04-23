# Online Progression & Achievements Implementation (Pong + Tic-Tac-Toe)

## 1. Executive Summary

This implementation completed the requested progression overhaul by:

1. Enforcing **online-only** progression/achievement logic for both games.
2. Applying a unified post-match pipeline for **both Pong and Tic-Tac-Toe**:
   - award match XP
   - persist match (+ per-player XP)
   - evaluate and unlock achievements
3. Replacing the previous mixed catalog with a dedicated **25-achievement canvas** (13 Pong + 12 Tic-Tac-Toe).
4. Extending engine telemetry and persisted session snapshots to support skill-based unlock conditions.
5. Restricting achievement APIs to the active catalog keys so UI/stats only represent this canvas.
6. Adding and validating a proper management command package for catalog seeding.

---

## 2. What Was Changed (Detailed)

## 2.1 Unified online post-match pipeline in both consumers

### Before
- Pong consumer already had XP + achievements integration.
- Tic-Tac-Toe consumer recorded matches but did not run the same progression pipeline.

### After
Both consumers now run the same progression sequence on all terminal online paths (normal win/draw, forfeit, disconnect-forfeit):

1. `award_xp_after_game(session)`
2. `record_match(session, xp_awards=xp_awards)`
3. `check_achievements_after_game(session)`

### Why this order
- Achievement logic relies on persisted `Match`/`MatchPlayer` data for leaderboard and streak checks.
- XP must be calculated on final match state and then recorded per-player in `MatchPlayer.xp_earned`.
- Achievement rewards (extra XP) are awarded separately at unlock time (`award_xp_for_achievement`), which avoids depending on pre-recorded base XP only.

---

## 2.2 Online-only gate for achievements

Achievement evaluation now hard-gates to online PvP sessions:

- Rejects AI sessions (`session.ai is not None`)
- Rejects local sessions (`session.game_id.startswith("local-")`)
- Rejects incomplete sessions (`len(session.players) < 2`)
- Rejects canceled/server-error sessions

This guarantees that unlock progress for this canvas only reflects competitive online play.

---

## 2.3 New 25-achievement catalog

The achievement catalog was fully replaced with 25 online-focused entries:

## Pong (13)
- `pong_first_rally`
- `pong_getting_warm`
- `pong_rally_master`
- `pong_speed_demon`
- `pong_unstoppable`
- `pong_precision_player`
- `pong_comeback_king`
- `pong_defensive_wall`
- `pong_dominator`
- `pong_veteran`
- `pong_grinder`
- `pong_champion`
- `pong_legend`

## Tic-Tac-Toe (12)
- `ttt_first_move`
- `ttt_first_victory`
- `ttt_quick_thinker`
- `ttt_strategist`
- `ttt_mind_reader`
- `ttt_perfect_game`
- `ttt_draw_master`
- `ttt_veteran`
- `ttt_grinder`
- `ttt_unbeatable`
- `ttt_champion`
- `ttt_legend`

### Important implementation adaptation
The canvas said Pong “10–0” for Dominator, but engine win target is configurable and currently defaults to 7. Implementation detects **perfect shutout** (`opponent score == 0`) and winner reaching engine win target.

---

## 2.4 Engine telemetry added for skill achievements

Skill achievements require in-match signals that were not previously persisted.  
Both engines were extended to emit this telemetry in game state.

## Pong telemetry added
- `current_rally_hits`
- `max_rally_hits`
- `player_hits`
- `player_current_consecutive_blocks`
- `player_max_consecutive_blocks`
- `player_misses`
- `player_max_deficit`
- `player_point_timestamps`
- `player_scored_three_under_ten`

### How it is tracked
- On each paddle collision: rally/hit/block counters update.
- On scoring: miss is assigned to conceded side, rally resets, scoring window for “3 in under 10s” is evaluated, comeback deficit maxima are updated.

## Tic-Tac-Toe telemetry added
- `player_block_counts`

### How it is tracked
- Before a move is applied, engine computes opponent immediate winning cells.
- If the chosen cell is one of those cells, it increments `player_block_counts[player_slot]`.

---

## 2.5 Session snapshot persistence updated

Session serialization/deserialization in `games/session.py` now includes the new telemetry fields for both engines.  
This matters for reconnect/server-recovery scenarios because achievement conditions remain consistent even if a match session is restored from Redis.

---

## 2.6 Match metadata enrichment

`_extract_metadata()` in `match_recording_service.py` now records:
- `pong_stats` subset from engine telemetry
- `ttt_stats` subset (block counts)

This improves analytics explainability and post-hoc inspection of why skill achievements unlocked.

---

## 2.7 Achievement evaluator rewritten

`achievement_service.py` now evaluates the new canvas with explicit per-game logic:

## Pong unlock logic highlights
- Participation milestones (`pong_first_rally`, `pong_veteran`, `pong_grinder`)
- First win (`pong_getting_warm`)
- Rally threshold (`pong_rally_master`)
- Fast scoring (`pong_speed_demon`)
- Defense streak (`pong_defensive_wall`)
- No misses win (`pong_precision_player`)
- Comeback win (`pong_comeback_king`)
- Perfect shutout (`pong_dominator`)
- Win streak (`pong_unstoppable`)
- Leaderboard milestones (`pong_champion`, `pong_legend`)

## Tic-Tac-Toe unlock logic highlights
- Participation milestones (`ttt_first_move`, `ttt_veteran`, `ttt_grinder`)
- First win (`ttt_first_victory`)
- Quick win by move count (`ttt_quick_thinker`)
- Defensive block accumulation (`ttt_mind_reader`)
- Dominant win (`ttt_perfect_game`)
- Draw accumulation (`ttt_draw_master`)
- Win streak milestones (`ttt_strategist`, `ttt_unbeatable`)
- Leaderboard milestones (`ttt_champion`, `ttt_legend`)

## Leaderboard checks
Leaderboard achievements use `get_leaderboard(game_type=..., period="all", limit=N)` and verify whether user appears in:
- top 10
- top 1

---

## 2.8 Catalog filtering in Analytics APIs

`analytics/views.py` now imports `ACHIEVEMENT_MAP` and builds `CATALOG_KEYS`, then filters:
- list
- unlocked list
- progress list
- stats aggregation
- detail queryset

This prevents legacy/internal achievements from polluting UI totals and percentages.

---

## 2.9 Management command package fix and seeding

A proper Django command package path was added:
- `backend/apps/analytics/management/__init__.py`
- `backend/apps/analytics/management/commands/__init__.py`
- `backend/apps/analytics/management/commands/seed_achievements.py`

Then `python manage.py seed_achievements --update` successfully created all 25 achievements.

---

## 3. End-to-End Flow (Online Match)

1. Players join online room.
2. Engine runs and emits state snapshots with telemetry.
3. Match ends (score/draw/forfeit/disconnect-forfeit).
4. Consumer calls:
   - `award_xp_after_game`
   - `record_match(...xp_awards...)`
   - `check_achievements_after_game`
5. Achievement service computes unlocks from:
   - final engine state telemetry
   - persisted match history (for streak/ranking checks)
6. Unlock rows are created idempotently (`IntegrityError` guarded).
7. Unlock notifications are sent to `notifications_<user_id>` channel group.
8. Achievement XP rewards are awarded.

---

## 4. Validation Performed

- Backend:
  - `python manage.py test` (0 tests in suite, command passed)
  - `python manage.py check` (no issues)
- Catalog seeding:
  - `python manage.py seed_achievements --update` (25 created)
- Frontend:
  - `npm run build` passed

---

## 5. Known Constraints / Notes

1. Leaderboard achievements depend on current leaderboard implementation and ranking strategy.
2. Level achievement hook is intentionally disabled in this canvas (`check_level_achievements` no-op).
3. Existing old achievement rows may still exist in DB, but APIs now filter to active `CATALOG_KEYS`.

---

## 6. Related Code (with file locations)

Below are the key code areas that implement this work.

## A) Consumer pipeline integration (both games)

**File:** `backend/apps/games/tictaktoe_consumer.py`
```python
from apps.analytics.achievement_service import check_achievements_after_game
from apps.analytics.xp_service import award_xp_after_game

...
xp_awards = await award_xp_after_game(session)
await record_match(session, xp_awards=xp_awards)
await check_achievements_after_game(session)
```

**File:** `backend/apps/games/pong_consumer.py`
```python
...
xp_awards = await award_xp_after_game(session)
await record_match(session, xp_awards=xp_awards)
await check_achievements_after_game(session)
```

## B) New achievement catalog (25 total)

**File:** `backend/apps/analytics/achievement_definitions.py`
```python
ACHIEVEMENTS: list[AchievementDef] = [
    AchievementDef(key="pong_first_rally", ...),
    ...
    AchievementDef(key="pong_legend", ...),
    AchievementDef(key="ttt_first_move", ...),
    ...
    AchievementDef(key="ttt_legend", ...),
]
```

## C) Online-only gate + evaluator

**File:** `backend/apps/analytics/achievement_service.py`
```python
def _is_online_pvp_session(session: GameSession) -> bool:
    if session.ai is not None:
        return False
    if session.game_id.startswith("local-"):
        return False
    if len(session.players) < 2:
        return False
    return True
```

```python
async def check_achievements_after_game(session: GameSession) -> None:
    if session.finish_reason in (FinishReason.CANCELED, FinishReason.SERVER_ERROR):
        return
    if not _is_online_pvp_session(session):
        return
    ...
```

## D) Pong telemetry for skill conditions

**File:** `backend/apps/games/pong_engine.py`
```python
self.current_rally_hits: int = 0
self.max_rally_hits: int = 0
self.player_hits: dict[int, int] = {1: 0, 2: 0}
self.player_current_consecutive_blocks: dict[int, int] = {1: 0, 2: 0}
self.player_max_consecutive_blocks: dict[int, int] = {1: 0, 2: 0}
self.player_misses: dict[int, int] = {1: 0, 2: 0}
self.player_max_deficit: dict[int, int] = {1: 0, 2: 0}
self.player_point_timestamps: dict[int, list[float]] = {1: [], 2: []}
self.player_scored_three_under_ten: dict[int, bool] = {1: False, 2: False}
```

```python
def _on_point_scored(self, scorer: int) -> None:
    loser = 2 if scorer == 1 else 1
    self.player_misses[loser] += 1
    ...
```

## E) Tic-Tac-Toe defensive telemetry

**File:** `backend/apps/games/tictactoe_engine.py`
```python
self.player_block_counts: dict[int, int] = {1: 0, 2: 0}

opponent_mark = Mark.O if mark == Mark.X else Mark.X
threat_cells = self._get_immediate_winning_cells(opponent_mark)
if cell in threat_cells:
    self.player_block_counts[player_slot] += 1
```

## F) Session snapshot persistence for telemetry

**File:** `backend/apps/games/session.py`
```python
"stats": {
    "current_rally_hits": engine.current_rally_hits,
    ...
    "player_point_timestamps": engine.player_point_timestamps,
}
```

```python
"stats": {
    "player_block_counts": engine.player_block_counts,
}
```

## G) Match metadata enrichment

**File:** `backend/apps/games/match_recording_service.py`
```python
if session.game_type == GameType.PONG:
    ...
    metadata["pong_stats"] = {...}
elif session.game_type == GameType.TICTACTOE:
    ...
    metadata["ttt_stats"] = {"player_block_counts": ...}
```

## H) API catalog scoping

**File:** `backend/apps/analytics/views.py`
```python
from .achievement_definitions import ACHIEVEMENT_MAP
CATALOG_KEYS = tuple(ACHIEVEMENT_MAP.keys())

Achievement.objects.filter(key__in=CATALOG_KEYS)
...
AchievementUnlock.objects.filter(..., achievement__key__in=CATALOG_KEYS)
...
AchievementProgress.objects.filter(..., achievement__key__in=CATALOG_KEYS)
```

## I) Seed command

**File:** `backend/apps/analytics/management/commands/seed_achievements.py`
```python
for defn in ACHIEVEMENTS:
    achievement, created = Achievement.objects.get_or_create(
        key=defn.key,
        defaults=defaults,
    )
```
