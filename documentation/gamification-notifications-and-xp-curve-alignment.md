# Gamification Gap Fix: Real-Time Notifications + XP Curve Alignment

## 1. Purpose of this document

This document describes, in detail, the implementation completed to close two gamification gaps:

1. Missing **frontend visual feedback** for live gamification events (achievement unlocks, XP gains, level-ups) even though backend WebSocket events already existed.
2. Incorrect **frontend XP progression math** based on a hardcoded `200 XP per level` assumption instead of the backend level curve.

The goal was to make the user-facing gamification experience consistent with backend rules and to provide immediate visual feedback for progression events.

---

## 2. Problem statement before the fix

## 2.1 Gap A - no live gamification feedback in UI

Backend already emitted personal notification events on `ws/notifications/`, including:

- `achievement_unlocked`
- `xp_gained`
- `level_up`

But frontend had no listener connected to this WebSocket route for global app usage, so users did not receive real-time feedback when progression events happened.

## 2.2 Gap B - frontend level progress did not match backend progression

Frontend pages (notably Home and Profile) calculated progression using a linear, hardcoded formula:

- `level = floor(totalXp / 200) + 1`
- `xpToNext = 200 - (totalXp % 200)`
- progress bar based on `200`

Backend uses a non-linear level curve and exposes canonical values in `level_info` (`xp_in_level`, `xp_needed`, etc.).  
This mismatch caused incorrect progress bars and incorrect "XP to next level" text.

---

## 3. Scope and non-scope

## 3.1 In scope

- Add a global frontend listener for gamification notification events.
- Show user-visible toasts for gamification events.
- Align Home/Profile XP progression calculations with backend `level_info`.
- Strengthen TypeScript types for XP payloads.
- Keep existing navigation and page structure unchanged.

## 3.2 Not in scope

- No backend algorithm changes for XP/levels.
- No redesign of notification center/history.
- No persistence of viewed notifications.
- No localization file changes were required because fallback strings were used via `defaultValue`.

---

## 4. Implementation details

## 4.1 New global notification bridge component

### What was added

A new component was introduced:

- `frontend/src/components/GamificationNotifications.tsx`

### Why this location

This component is mounted at the Layout level so it is active across authenticated pages that use `Layout`.  
This avoids duplicating WebSocket listeners per page and ensures consistent behavior.

### Internal behavior

The component:

1. Reads auth state using `useAuth`.
2. Opens WebSocket path `/ws/notifications/` only when authenticated.
3. Subscribes via existing reusable hook `useGameSocket`.
4. Interprets incoming event payloads by `type`.
5. Enqueues user-facing messages into an internal queue.
6. Displays toasts sequentially (one at a time) using `Toast`.

### Queueing model

- `queue: string[]` stores pending messages.
- `activeToast: string | null` stores current displayed message.
- A `useEffect` activates next queued message only when current toast is closed.

This prevents overlap and message loss during bursty event sequences (for example, XP gained + level-up + achievement unlock in the same match end flow).

### Event mapping

- `connected`: ignored (handshake signal only).
- `achievement_unlocked`: renders `"Achievement unlocked: <name> (+<xp> XP)"`.
- `xp_gained`: renders `"+<xp> XP gained"` when positive.
- `level_up`: renders `"Level up! You reached level <n>"`.

### Translation behavior

Messages are passed through `t(...)` with `defaultValue` strings.  
This means:

- Existing locale files are not required immediately for functionality.
- If translation keys are later added, they are used automatically.

### Error tolerance

Defensive parsing is used:

- Non-string `type` values are ignored.
- Missing fields default safely (`xp_reward` -> `0`, `name` -> `"Achievement"`).
- Invalid numerical values are normalized through `Number(...)`.

---

## 4.2 Layout integration for global availability

### What changed

`frontend/src/components/Layout.tsx` now mounts:

- `<GamificationNotifications />`

immediately below `<Navbar />`.

### Why this matters

All pages wrapped by `Layout` now share the same notification channel and toast behavior without additional per-page code.

---

## 4.3 XP progression alignment on Profile page

### Previous logic (incorrect)

Profile used:

- `xpInLevel = totalXp % 200`
- `xpProgress = xpInLevel / 200`
- `remaining = 200 - xpInLevel`

### New logic (correct)

Profile now uses backend-provided `level_info`:

- `xpInLevel = level_info.xp_in_level`
- `xpNeeded = level_info.xp_needed`
- `xpRemaining = max(xpNeeded - xpInLevel, 0)`
- `xpProgress = xpNeeded > 0 ? min((xpInLevel / xpNeeded) * 100, 100) : 100`

Next level label is also derived safely:

- `nextLevel = xpNeeded > 0 ? level + 1 : level`

### Result

Profile progress bar and "XP to level" label now match backend progression exactly, including non-linear level boundaries and edge cases.

---

## 4.4 XP progression alignment on Home page

### Previous logic (incorrect)

Home computed level/progress from `stats.overview.total_xp` using the same 200-XP assumption.

### New logic (correct)

Home now fetches canonical XP detail from `/api/analytics/xp/me/` and uses:

- `xpDetail.level`
- `xpDetail.level_info.xp_in_level`
- `xpDetail.level_info.xp_needed`

with identical guard logic as Profile for progress and remaining XP.

### Data fetch update

Home's `Promise.all(...)` now includes `getMyXP()` and stores result in:

- `xpDetail: UserXPDetail | null`

### Fallback strategy

To keep UI resilient:

- `totalXp` falls back to `stats?.overview.total_xp` if needed.
- `level` falls back to `user?.level` or `1`.
- Progress calculations guard against missing/zero thresholds.

---

## 4.5 TypeScript contract improvements

### What changed

In `frontend/src/services/analytics.ts`:

- Added explicit `LevelInfo` interface:
  - `level`
  - `current_xp`
  - `xp_for_current_level`
  - `xp_for_next_level`
  - `xp_in_level`
  - `xp_needed`
- Updated `UserXPDetail.level_info` to `LevelInfo`.
- Updated leaderboard entry optional field typing to `LevelInfo` shape.

### Why it matters

- Removes weak `Record<string, unknown>` typing for key progression payload.
- Prevents accidental math on unknown structures.
- Improves editor hints and compile-time safety for XP UI logic.

---

## 5. Runtime flow after this change

## 5.1 Match-completion progression flow (end-to-end)

1. Game concludes on backend.
2. Backend awards base XP and computes level transitions.
3. Backend checks achievements and awards achievement XP.
4. Backend emits notification events to personal channel group.
5. Frontend global listener receives events from `/ws/notifications/`.
6. Frontend queues and displays toast feedback in order.
7. Home/Profile pages show correct progress relative to backend level curve.

## 5.2 User-visible outcomes

- Immediate toast when an achievement unlocks.
- Immediate toast when XP is gained.
- Immediate toast when level-up occurs.
- Correct XP progress bars and next-level remaining XP values on Home/Profile.

---

## 6. Edge cases and handling

1. **Not authenticated**  
   WebSocket path is not opened.

2. **Notification handshake frame**  
   `connected` frame is ignored to avoid noisy toasts.

3. **Rapid event bursts**  
   Queue model prevents overlap and preserves order.

4. **Max level or zero threshold case**  
   If `xp_needed <= 0`, progress is treated as complete (`100%`) and next level label does not increment.

5. **Partial payloads**  
   Missing achievement fields fallback to safe defaults.

---

## 7. Validation performed

Commands executed after implementation:

```bash
docker compose exec backend python manage.py test
docker compose exec frontend npm run build
```

Result:

- Backend test command executed successfully (no tests discovered in current suite).
- Frontend build/type-check succeeded.

---

## 8. Behavior impact summary

### Before

- No live visual feedback for backend gamification events.
- Home/Profile progression display could diverge from backend level system.

### After

- Real-time gamification toasts are now visible in app.
- Progress bars and XP-to-next-level are backend-accurate.
- Type contracts for XP payloads are explicit and safer.

---

## 9. Known limitations

1. Toast messages currently rely on `defaultValue` fallback strings; dedicated locale keys can be added later for full i18n control.
2. Notifications are ephemeral (no persisted notification inbox/history yet).
3. This fix does not add unread counters or a notifications panel UI.

---

## 10. Related code with file locations

## Frontend (new/updated)

- `frontend/src/components/GamificationNotifications.tsx`  
  Global listener for `ws/notifications/`; event mapping; toast queue.

- `frontend/src/components/Layout.tsx`  
  Mount point for global gamification notifications component.

- `frontend/src/pages/HomePage.tsx`  
  Replaced hardcoded 200-XP progression math with `getMyXP()` + `level_info`.

- `frontend/src/pages/ProfilePage.tsx`  
  Replaced hardcoded 200-XP progression math with backend `level_info`.

- `frontend/src/services/analytics.ts`  
  Added `LevelInfo` interface and tightened XP-related typing.

- `frontend/src/components/Toast.tsx`  
  Reused as rendering primitive for gamification feedback.

- `frontend/src/hooks/useGameSocket.ts`  
  Existing reusable WebSocket hook used by the new global notifications component.

## Backend (existing, relied on by this fix)

- `backend/apps/analytics/xp_service.py`  
  Canonical XP and level progression logic; emits `xp.gained` and `level.up`.

- `backend/apps/analytics/achievement_service.py`  
  Achievement unlock logic; emits `achievement.unlocked`.

- `backend/apps/analytics/notification_consumer.py`  
  Notification WebSocket consumer that forwards event payloads to clients.

- `backend/config/routing.py`  
  WebSocket route registration for `ws/notifications/`.

- `backend/apps/analytics/views.py`  
  `/api/analytics/xp/me/` response used by Home/Profile for canonical progression data.
