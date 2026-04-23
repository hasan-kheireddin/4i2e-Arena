# User Activity Analytics & Insights Dashboard — Detailed Implementation Documentation

## 1) Scope and objective

This document explains, in detail, what was implemented to make the **User Activity Analytics and Insights Dashboard** work end-to-end, including:

1. Backend API hardening and response-shape alignment.
2. Cache freshness fixes for activity analytics.
3. Frontend service-layer and dashboard wiring.
4. Route-level page view tracking.
5. Navigation fix for dashboard route consistency.
6. Build and validation outcomes in the current environment.

---

## 2) What was wrong before implementation

### 2.1 Partial backend/frontend integration
- Backend had activity endpoints (`summary`, `timeline`, `heatmap`, `recent`, `track`, `global`) but frontend consumed only a subset.
- The dashboard did not present user activity insights data in the Home page UI.

### 2.2 API contract mismatch risk
- Frontend model expected keys like `today_count`, `week_count`, `by_type`.
- Backend summary primarily produced `events_today`, `events_this_week`, `top_event_types`.
- This mismatch could lead to incorrect rendering or defensive fallback logic everywhere.

### 2.3 Stale analytics cache risk
- Aggregation cache invalidation existed but was not guaranteed to run on every new tracked event.
- As a result, activity widgets could show stale values for up to cache TTL.

### 2.4 Parameter parsing robustness
- Some endpoints parsed query params using raw `int(...)`.
- Invalid user input (e.g., non-numeric values) could trigger `500` instead of clean `400` responses.

### 2.5 Dashboard route inconsistency
- Sidebar dashboard link path used `/Home` while router and active-state logic expected lowercase `/home`.

---

## 3) Detailed backend changes

## 3.1 Aggregation service improvements
**File:** `backend/apps/analytics/aggregration_service.py`

### 3.1.1 Cache invalidation scope expanded
- Added `"analytics:global_summary"` to invalidation keys.
- Reason: new activity events should invalidate both per-user and global aggregate caches to keep admin/global analytics current.

### 3.1.2 Summary payload compatibility and richness
- Added `by_type` map for direct event-type-to-count access.
- Added backward-compatible aliases:
  - `today_count` (alias of `events_today`)
  - `week_count` (alias of `events_this_week`)
- Added `latest_event_at` for direct timestamp access.
- Preserved existing fields so old clients keep working.

### 3.1.3 Why this shape
- Keeps existing API consumers stable.
- Supports newer frontend with simpler rendering logic.
- Avoids repeated frontend transformations.

---

## 3.2 Event tracking now guarantees cache freshness
**File:** `backend/apps/analytics/tracking_service.py`

### 3.2.1 `track_event(...)` flow updated
- After creating an `ActivityEvent`, now calls:
  - `invalidate_user_activity_cache(user_id)`

### 3.2.2 Impact
- Any tracked event (login/logout/profile update/match completion/page view/etc.) now invalidates related cached analytics.
- Activity summary/timeline/heatmap/recent/global views are refreshed quickly and stay coherent with tracked telemetry.

---

## 3.3 Activity and level endpoints hardened for invalid params
**File:** `backend/apps/analytics/views.py`

### 3.3.1 Added shared parser
- New helper: `_parse_bounded_int_param(...)`
- Features:
  - Handles missing params with default.
  - Validates integer conversion.
  - Enforces minimum.
  - Caps at maximum.
  - Raises clear validation error messages.

### 3.3.2 Applied to endpoints
- `LevelTableView`: validates `max_level`.
- `ActivityTimelineView`: validates `days`.
- `RecentActivityView`: validates `limit`.

### 3.3.3 Error behavior
- Validation errors now return structured `400` responses (`{"detail": "...error..."}`).
- Prevents accidental `500` caused by invalid query param types.

### 3.3.4 Track endpoint input normalization
- `TrackEventView.post(...)` now normalizes `path` via `str(...).strip()`.
- Empty/whitespace-only paths are rejected with `400`.

---

## 4) Detailed frontend changes

## 4.1 Analytics service expanded and typed
**File:** `frontend/src/services/analytics.ts`

### 4.1.1 Query builder utility
- Added `buildQuery(...)` for reusable query parameter generation.

### 4.1.2 Activity types expanded
- `ActivitySummary` now includes both:
  - existing backend keys (`events_today`, `events_this_week`, `top_event_types`, etc.)
  - compatibility keys (`today_count`, `week_count`, `by_type`, etc.)
- Added:
  - `ActivityTimelinePoint`
  - `ActivityHeatmapCell`
  - `RecentActivityEvent`
  - `GlobalActivitySummary`

### 4.1.3 New API methods
- `getActivityTimeline(...)`
- `getActivityHeatmap()`
- `getRecentActivity(...)`
- `getGlobalActivitySummary()`

### 4.1.4 Why this matters
- Frontend now has a complete service contract for the backend analytics endpoints.
- Enables scalable dashboard widgets without ad-hoc fetch logic in pages.

---

## 4.2 Route-level page view tracking added
**File:** `frontend/src/components/Layout.tsx`

### 4.2.1 Implementation
- Uses `useLocation()` from React Router.
- On `pathname/search` changes, sends:
  - `trackPageView(pathWithQuery)`

### 4.2.2 Behavior
- Runs centrally for all pages wrapped by `Layout`.
- Tracking failures are intentionally non-blocking (`catch`) to avoid UI disruption.

---

## 4.3 Home dashboard now renders activity insights
**File:** `frontend/src/pages/HomePage.tsx`

### 4.3.1 Data fetching strategy updated
- Added activity calls to startup load:
  - `getActivitySummary()`
  - `getRecentActivity({ limit: 5 })`
- Switched to `Promise.allSettled(...)` for resilience:
  - If one endpoint fails, other dashboard data still renders.

### 4.3.2 New state and derivations
- Added:
  - `activitySummary`
  - `recentActivity`
- Derived values with compatibility fallback:
  - `eventsToday = events_today ?? today_count ?? 0`
  - `eventsThisWeek = events_this_week ?? week_count ?? 0`

### 4.3.3 New UI block: **Activity Insights**
- Added card on the right panel with:
  - today count
  - week count
  - most active day
  - most active hour
  - recent activity feed (event type + category + relative time)

### 4.3.4 Event label formatting
- Added helper `formatEventType(...)` to convert snake_case to readable labels.

---

## 4.4 Dashboard navigation route fixed
**File:** `frontend/src/components/Sidebar.tsx`

- Updated dashboard nav target to `/home` (lowercase).
- Updated active-state branch to compare with `/home`.
- This aligns sidebar behavior with router definitions and eliminates route mismatch.

---

## 4.5 New user-facing strings added
**File:** `frontend/src/i18n/locales/en.json`

Added Home keys:
- `activity_insights`
- `activity_today`
- `activity_week`
- `activity_peak_day`
- `activity_peak_hour`
- `recent_activity`
- `no_activity`

---

## 5) Validation and execution outcomes

## 5.1 Successful
- **Frontend build succeeded** after implementation:
  - `cd frontend && npm run build`

## 5.2 Environment constraints (blocked items)
- Backend container-based tests could not run because Docker integration is unavailable in current WSL context.
- Installing backend dependencies directly to system Python is restricted by environment policy (externally managed Python), and full backend test execution remained blocked here.

## 5.3 Additional confidence step performed
- Python syntax compilation passed for modified backend files:
  - `python3 -m py_compile apps/analytics/aggregration_service.py apps/analytics/tracking_service.py apps/analytics/views.py`

---

## 6) Architecture and behavior after changes

1. User navigates within app routes wrapped by `Layout`.
2. `Layout` triggers `trackPageView(path)`.
3. Backend `TrackEventView` validates input and writes event.
4. `track_event(...)` invalidates user/global analytics caches.
5. Home page loads summary + recent activity via service APIs.
6. Dashboard shows fresh insights with compatibility-safe fallback fields.

This closes the previous “backend exists, frontend partial” gap and makes analytics insights visible and consistent.

---

## 7) Related code and file locations

## 7.1 File index (all touched implementation files)

1. `backend/apps/analytics/aggregration_service.py`
2. `backend/apps/analytics/tracking_service.py`
3. `backend/apps/analytics/views.py`
4. `frontend/src/services/analytics.ts`
5. `frontend/src/components/Layout.tsx`
6. `frontend/src/pages/HomePage.tsx`
7. `frontend/src/components/Sidebar.tsx`
8. `frontend/src/i18n/locales/en.json`

## 7.2 Key code locations (line-oriented index)

1. **Backend aggregation compatibility fields and cache scope**
   - `backend/apps/analytics/aggregration_service.py:32, 44, 121-127, 136`
2. **Backend tracking-triggered cache invalidation**
   - `backend/apps/analytics/tracking_service.py:7, 12, 56`
3. **Backend bounded int parsing + endpoint usage**
   - `backend/apps/analytics/views.py:468, 408, 525, 582, 608`
4. **Frontend analytics service expansion**
   - `frontend/src/services/analytics.ts:5, 99, 205, 213, 218, 226`
5. **Route-level page view tracking**
   - `frontend/src/components/Layout.tsx:1-2, 5, 12, 14-16`
6. **Home activity insights integration**
   - `frontend/src/pages/HomePage.tsx:13-14, 71-77, 109-110, 373`
7. **Sidebar route fix**
   - `frontend/src/components/Sidebar.tsx:54, 84-85`
8. **New Home i18n keys**
   - `frontend/src/i18n/locales/en.json:245-251`

---

## 8) Related code excerpts (with file locations)

### 8.1 Backend — cache invalidation and compatibility fields
**File:** `backend/apps/analytics/aggregration_service.py`
```python
def invalidate_user_activity_cache(user_id: UUID | int) -> None:
    keys = [
        _user_summary_key(user_id),
        _user_heatmap_key(user_id),
        "analytics:global_summary",
    ]
    ...

result = {
    "events_today": today_count,
    "events_this_week": week_count,
    "today_count": today_count,
    "week_count": week_count,
    "by_type": by_type,
    "latest_event_at": latest["created_at"].isoformat() if latest else None,
}
```

### 8.2 Backend — event tracking now refreshes cache
**File:** `backend/apps/analytics/tracking_service.py`
```python
from apps.analytics.aggregation_service import invalidate_user_activity_cache

def track_event(...):
    event = ActivityEvent.objects.create(...)
    ...
    invalidate_user_activity_cache(user_id)
    return event
```

### 8.3 Backend — robust bounded integer parsing
**File:** `backend/apps/analytics/views.py`
```python
def _parse_bounded_int_param(request, *, name, default, min_value, max_value):
    raw = request.query_params.get(name)
    if raw is None:
        return default
    try:
        parsed = int(raw)
    except (TypeError, ValueError):
        raise ValueError(f"'{name}' must be an integer.")
    if parsed < min_value:
        raise ValueError(f"'{name}' must be >= {min_value}.")
    return min(parsed, max_value)
```

### 8.4 Frontend — activity API coverage in service layer
**File:** `frontend/src/services/analytics.ts`
```ts
export function getActivityTimeline(params = {}): Promise<ActivityTimelinePoint[]> {
  return apiFetch<ActivityTimelinePoint[]>(`${A}/activity/timeline/${buildQuery(params)}`);
}

export function getRecentActivity(params = {}): Promise<RecentActivityEvent[]> {
  return apiFetch<RecentActivityEvent[]>(`${A}/activity/recent/${buildQuery(params)}`);
}

export function getGlobalActivitySummary(): Promise<GlobalActivitySummary> {
  return apiFetch<GlobalActivitySummary>(`${A}/activity/global/`);
}
```

### 8.5 Frontend — route-based page view tracking
**File:** `frontend/src/components/Layout.tsx`
```tsx
const location = useLocation();

useEffect(() => {
  const pathWithQuery = `${location.pathname}${location.search}`;
  trackPageView(pathWithQuery).catch(() => {
    // Do not block UI rendering when telemetry fails.
  });
}, [location.pathname, location.search]);
```

### 8.6 Frontend — Home insights card and resilient fetch strategy
**File:** `frontend/src/pages/HomePage.tsx`
```tsx
const [statsRes, matchesRes, lbRes, xpRes, activitySummaryRes, recentActivityRes] =
  await Promise.allSettled([
    getMyStats(),
    getMyMatches({ page_size: 5 }),
    getLeaderboard({ game_type: "pong", metric: "wins", limit: 5 }),
    getMyXP(),
    getActivitySummary(),
    getRecentActivity({ limit: 5 }),
  ]);
```

```tsx
<Section title={t("home.activity_insights")} icon={<BarChart3 className="w-4 h-4" />}>
  ...
</Section>
```

### 8.7 Frontend — dashboard route fix
**File:** `frontend/src/components/Sidebar.tsx`
```tsx
{ label: t('sidebar.dashboard'), icon: <Home className="w-5 h-5" />, to: '/home' }
...
item.to === '/home' ? location.pathname === '/home' : location.pathname.startsWith(item.to)
```

### 8.8 Frontend — English localization keys
**File:** `frontend/src/i18n/locales/en.json`
```json
"activity_insights": "Activity Insights",
"activity_today": "Today",
"activity_week": "This Week",
"activity_peak_day": "Most active day",
"activity_peak_hour": "Most active hour",
"recent_activity": "Recent Activity",
"no_activity": "No activity yet."
```

