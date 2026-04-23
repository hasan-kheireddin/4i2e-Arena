# Match History Advanced Search — Backend-Driven Documentation

> Status: implemented
> Scope: authenticated match history advanced search for `/api/games/matches/` and `/api/games/matches/me/`
> Goal: replace frontend-only filtering with real backend querying, sorting, and pagination

---

## 1. Overview

The match history search system is now a real backend-driven advanced search flow.

Before this change, the page worked like this:

- frontend loaded one chunk of matches
- search and mode filtering happened only in the browser
- "load more" appended more rows to the current array
- results depended on what had already been loaded

That design had an important limitation:

- if a match was not already loaded into the browser, it could not be found by search or filters

The new system fixes that by moving the search pipeline to Django + DRF.

Now the workflow is:

1. user changes search text, result filter, mode filter, sort, or page
2. frontend sends query params to the API
3. backend validates params
4. backend builds a Django ORM queryset dynamically
5. backend applies filters, search, sort, and pagination together
6. backend returns a paginated JSON response
7. frontend renders only the returned page

This means search is now based on the database, not on cached frontend state.

---

## 2. Supported Endpoints

### Primary endpoints

- `GET /api/games/matches/`
- `GET /api/games/matches/me/`

### Public user history endpoint

- `GET /api/games/matches/user/<uuid:user_id>/`

The authenticated "my matches" endpoint is the one used by `MatchHistoryPage.tsx`.

---

## 3. Supported Query Parameters

The backend now supports these query parameters for match history:

- `search`
- `result`
- `mode`
- `ordering`
- `page`
- `page_size`

The implementation also keeps compatibility with some legacy params already present in the project:

- `outcome` as an alias for `result`
- `game_mode` as an alias path that is normalized internally

### Parameter behavior

#### `search`

Case-insensitive partial matching using Django ORM `icontains`.

Search checks:

- opponent username
- opponent display name
- local player names stored in `metadata.local_players.player1_name`
- local player names stored in `metadata.local_players.player2_name`
- AI difficulty text for AI matches

#### `result`

Filters the authenticated user's participation outcome:

- `win`
- `loss`
- `draw`

This is not a raw `Match` field. It is filtered through `MatchPlayer.outcome` for the current user.

#### `mode`

Supports:

- `pvp`
- `pva`
- `local`

Mode handling is special because local matches are not stored as `game_mode="local"` in the database.

Instead:

- local human-vs-human matches are identified using `game_session_id__startswith="local-"`
- AI matches may exist as `pva` or older `pve` rows depending on which path created them

So mode normalization is part of the backend algorithm.

#### `ordering`

Supported safe values:

- `date`
- `-date`
- `score`
- `-score`
- `duration`
- `-duration`

These do not pass raw user input into `order_by()`. They are mapped through a whitelist.

#### `page`

DRF page number.

#### `page_size`

DRF page size with:

- default: `20`
- max: `100`

---

## 4. Response Shape

Pagination uses DRF `PageNumberPagination`, so the API returns:

```json
{
  "count": 137,
  "next": "http://localhost/api/games/matches/me/?page=2",
  "previous": null,
  "results": [
    {
      "id": "uuid",
      "game_session_id": "local-abc123",
      "game_type": "pong",
      "game_mode": "pvp",
      "finish_reason": "score",
      "winner_id": "uuid-or-null",
      "winner_username": "name-or-null",
      "player1_score": 11,
      "player2_score": 5,
      "started_at": "iso-datetime",
      "finished_at": "iso-datetime",
      "duration_seconds": 142.0,
      "ai_difficulty": "",
      "metadata": {},
      "players": []
    }
  ]
}
```

This structure is important because the frontend now uses:

- `count` to compute total pages
- `results` to render the current page only
- page state instead of array appending

---

## 5. Backend Architecture

### Files involved

- `backend/apps/games/views.py`
- `backend/apps/games/serializers.py`
- `frontend/src/services/games.ts`
- `frontend/src/pages/MatchHistoryPage.tsx`

### Backend pieces

#### `MatchQuerySerializer`

This serializer validates incoming query params before queryset construction.

It protects the API from:

- invalid `ordering` values
- invalid `result` values
- invalid `mode` values
- malformed date values

This is the first layer of safety.

#### `MatchPagination`

The pagination class is:

- default page size `20`
- configurable through `page_size`
- capped at `100`

#### `ORDERING_MAP`

This is the whitelist that maps supported user ordering values to actual ORM order fields.

That matters because raw `order_by(request.GET["ordering"])` would be too open and fragile.

#### `_get_match_query_params()`

This function:

1. validates query params through `MatchQuerySerializer`
2. normalizes aliases

Normalization currently includes:

- `outcome -> result`
- `game_mode=pve -> mode=pva`

This preserves compatibility with older callers and existing stored rows.

#### `_apply_match_filters()`

This function applies filters that operate at the match level:

- game type
- mode
- finish reason
- search
- date range

#### `_apply_user_filters()`

This function applies filters that depend on the authenticated user:

- opponent
- result

This separation is intentional because result filtering depends on `MatchPlayer` rows for the current user.

#### `_annotate_sort_score()`

This function computes the score used for sorting.

Behavior:

- for authenticated match history, it tries to sort by the current user's score
- if no user-specific score is available, it falls back to `Greatest(player1_score, player2_score)`

This is done using ORM annotation, not frontend logic.

#### `_apply_ordering()`

This applies the mapped ordering fields from `ORDERING_MAP`.

---

## 6. Search and Filtering Algorithm

This is the actual algorithm used by the backend.

### Step 1: validate query params

Incoming params are validated with `MatchQuerySerializer`.

If the request contains an unsupported value, DRF returns a validation error instead of building a broken queryset.

### Step 2: normalize aliases

The backend converts legacy or alternate params into the canonical internal form.

Examples:

- `outcome=win` becomes internal `result=win`
- `game_mode=pve` becomes internal `mode=pva`

### Step 3: build base queryset

For `/matches/me/`, the base queryset is:

- matches where `players__user == request.user`

For `/matches/`, the base queryset is:

- all matches visible to authenticated users

### Step 4: apply mode logic

Mode is not a simple one-column filter because the data model has historical behavior.

#### `mode=local`

The backend matches:

- `game_session_id` starts with `local-`
- `ai_difficulty` is empty or null

This isolates local human-vs-human matches.

#### `mode=pvp`

The backend matches:

- `game_mode="pvp"`
- excludes `game_session_id` starting with `local-`

This isolates network/standard PvP history from local-only games.

#### `mode=pva`

The backend matches:

- `game_mode in ["pva", "pve"]`
- or non-empty `ai_difficulty`

This is done to support both:

- current canonical AI mode rows
- older AI rows stored with `pve`

### Step 5: apply text search

If `search` exists, the backend uses case-insensitive partial matching.

For authenticated user history:

- it uses an `Exists(...)` subquery to detect whether a non-self opponent matches username or display name
- it also checks local player names inside `metadata`
- it also checks `ai_difficulty`

This allows one search field to work across:

- online PvP opponents
- local human-vs-human player names
- AI matches

### Step 6: apply result filter

If `result` exists, the backend filters by:

- `players__user=request.user`
- `players__outcome=result`

This is the correct model-level interpretation of "my result" and avoids trying to derive win/loss from denormalized scores.

### Step 7: annotate sortable score

For score ordering:

- backend annotates `sort_score`
- for the current user, it pulls the user's `MatchPlayer.score` using a subquery
- if that score is unavailable, it falls back to the greater of `player1_score` and `player2_score`

This is the scoring algorithm used by `score` / `-score`.

### Step 8: apply safe ordering

Only whitelisted ordering aliases are accepted.

Mappings:

- `date -> ("finished_at", "id")`
- `-date -> ("-finished_at", "-id")`
- `score -> ("sort_score", "-finished_at", "-id")`
- `-score -> ("-sort_score", "-finished_at", "-id")`
- `duration -> ("duration_seconds", "-finished_at", "-id")`
- `-duration -> ("-duration_seconds", "-finished_at", "-id")`

The extra `id` or `-id` tie-breakers keep ordering stable.

### Step 9: paginate

After filtering and sorting, DRF paginates the queryset.

This is important:

- filtering happens before pagination
- sorting happens before pagination
- pagination happens on the final filtered result set

So combinations such as:

```text
?search=hasan&result=win&ordering=-date&page=2
```

work correctly because the second page is taken from the already filtered and ordered database result, not from a frontend array slice.

---

## 7. Frontend Architecture

### Service layer

`frontend/src/services/games.ts` now supports these extra request fields:

- `search`
- `result`
- `mode`
- `ordering`

The request builder converts them into query string params and calls:

- `GET /api/games/matches/me/`

### Page state

`MatchHistoryPage.tsx` now manages:

- game filter
- result filter
- mode filter
- search input
- debounced search value
- ordering
- page number
- total count

### Debounced search behavior

The page uses a short debounce before applying the typed text.

That reduces redundant requests while the user is still typing.

Algorithm:

1. user types in the input
2. `searchInput` updates immediately
3. 300ms timer runs
4. after the timer, trimmed value becomes `search`
5. effect triggers backend request

### Query reset behavior

When filters or search change, page state is reset to page 1.

This prevents stale pagination like:

- user is on page 4
- changes search
- backend has only 1 page for the new query

Without resetting, the request would ask for a page that may not exist.

### Rendering behavior

The page now renders:

- only the current page of results
- pagination controls using `count` and `PAGE_SIZE`

The old client-side filtering step has been removed.

---

## 8. Why This Is Better Than the Old Approach

### Old approach

- worked only on already loaded rows
- search accuracy depended on prior loading
- more data in browser memory
- "load more" mixed transport and UI state
- hard to guarantee correct combinations of filter + search + sorting

### New approach

- search is done against the database
- filters, sorting, and pagination are composed in one query pipeline
- backend becomes the source of truth
- UI stays the same, data source changes
- query combinations are predictable and testable

---

## 9. Combination Examples

### Example 1

```text
/api/games/matches/me/?search=hasan
```

Returns matches where the opponent, local player name, or AI label matches `hasan` partially and case-insensitively.

### Example 2

```text
/api/games/matches/me/?result=win&mode=pvp&ordering=-date
```

Returns the authenticated user's PvP wins ordered from newest to oldest.

### Example 3

```text
/api/games/matches/me/?mode=local&page=2&page_size=20
```

Returns the second page of local human-vs-human matches.

### Example 4

```text
/api/games/matches/me/?search=hasan&result=win&ordering=-date&page=2
```

This is the required advanced combination case and now works correctly end to end.

---

## 10. Edge Cases and Design Notes

### Local mode is not stored as a dedicated DB enum

This is why the backend uses:

- `game_session_id__startswith("local-")`

instead of:

- `game_mode="local"`

### AI rows may be stored as `pva` or `pve`

This comes from older code paths and migrations already present in the repo.

The backend intentionally supports both so search remains compatible with real stored data.

### Search is ORM-based, not full-text index search

The algorithm here is:

- Django ORM
- `icontains`
- `Exists` subquery
- JSON field lookups

This is not:

- PostgreSQL full-text search
- trigram similarity
- Elasticsearch
- ranking-based search

That is acceptable for the current module because the requirement was advanced search with filters, sorting, and pagination, not search-engine ranking.

### Score sorting is user-aware on `/matches/me/`

This means score ordering tries to use the authenticated player's recorded score first.

That is more useful than ordering by raw `player1_score` or `player2_score` alone because the user may not always be player 1 in all contexts.

---

## 11. Main Files

- [backend/apps/games/views.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/games/views.py)
- [backend/apps/games/serializers.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/games/serializers.py)
- [frontend/src/services/games.ts](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/frontend/src/services/games.ts)
- [frontend/src/pages/MatchHistoryPage.tsx](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/frontend/src/pages/MatchHistoryPage.tsx)

---

## 12. Code Blocks Appendix

The following blocks summarize the implementation in code form.

### A. Query param validation

```python
class MatchQuerySerializer(serializers.Serializer):
    game_type = serializers.ChoiceField(
        choices=["pong", "tictactoe"],
        required=False,
        allow_null=True,
    )
    search = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    result = serializers.ChoiceField(
        choices=["win", "loss", "draw"],
        required=False,
    )
    outcome = serializers.ChoiceField(
        choices=["win", "loss", "draw"],
        required=False,
    )
    mode = serializers.ChoiceField(
        choices=["pvp", "pva", "local"],
        required=False,
    )
    game_mode = serializers.ChoiceField(
        choices=["pvp", "pva", "pve"],
        required=False,
    )
    ordering = serializers.ChoiceField(
        choices=["date", "-date", "score", "-score", "duration", "-duration"],
        required=False,
        default="-date",
    )
```

### B. Ordering whitelist

```python
ORDERING_MAP = {
    "date": ("finished_at", "id"),
    "-date": ("-finished_at", "-id"),
    "score": ("sort_score", "-finished_at", "-id"),
    "-score": ("-sort_score", "-finished_at", "-id"),
    "duration": ("duration_seconds", "-finished_at", "-id"),
    "-duration": ("-duration_seconds", "-finished_at", "-id"),
}
```

### C. Query normalization

```python
def _get_match_query_params(request):
    serializer = MatchQuerySerializer(data=request.query_params)
    serializer.is_valid(raise_exception=True)

    params = dict(serializer.validated_data)
    params["result"] = params.get("result") or params.get("outcome")

    if "mode" not in params and "game_mode" in params:
        legacy_mode = params["game_mode"]
        params["mode"] = "pva" if legacy_mode == "pve" else legacy_mode

    return params
```

### D. Backend search/filter pipeline

```python
def _apply_match_filters(queryset, params, user=None):
    game_type = params.get("game_type")
    if game_type:
        queryset = queryset.filter(game_type=game_type)

    mode = params.get("mode")
    if mode == "local":
        queryset = queryset.filter(
            game_session_id__startswith="local-",
        ).filter(
            Q(ai_difficulty="") | Q(ai_difficulty__isnull=True),
        )
    elif mode == "pvp":
        queryset = queryset.filter(game_mode="pvp").exclude(
            game_session_id__startswith="local-",
        )
    elif mode == "pva":
        queryset = queryset.filter(
            Q(game_mode__in=["pva", "pve"]) | ~Q(ai_difficulty=""),
        )

    search = params.get("search")
    if search and user is not None:
        matching_opponent = MatchPlayer.objects.filter(
            match_id=OuterRef("pk"),
        ).exclude(
            user_id=user.pk,
        ).filter(
            Q(user__username__icontains=search)
            | Q(user__display_name__icontains=search),
        )
        queryset = queryset.annotate(
            has_matching_opponent=Exists(matching_opponent),
        ).filter(
            Q(has_matching_opponent=True)
            | Q(metadata__local_players__player1_name__icontains=search)
            | Q(metadata__local_players__player2_name__icontains=search)
            | Q(ai_difficulty__icontains=search),
        )

    return queryset
```

### E. User result filter

```python
def _apply_user_filters(queryset, params, user):
    result = params.get("result")
    if result:
        queryset = queryset.filter(
            players__user=user,
            players__outcome=result,
        )
    return queryset
```

### F. Score annotation algorithm

```python
def _annotate_sort_score(queryset, user=None):
    if user is None:
        return queryset.annotate(
            sort_score=Greatest("player1_score", "player2_score"),
        )

    user_score = MatchPlayer.objects.filter(
        match_id=OuterRef("pk"),
        user_id=user.pk,
    ).values("score")[:1]

    return queryset.annotate(
        sort_score=Coalesce(
            Subquery(user_score, output_field=IntegerField()),
            Greatest("player1_score", "player2_score"),
            Value(0),
        ),
    )
```

### G. Final queryset assembly

```python
def get_queryset(self):
    params = _get_match_query_params(self.request)
    qs = (
        Match.objects
        .filter(players__user=self.request.user)
        .select_related("winner")
        .prefetch_related("players__user")
    )
    qs = _apply_match_filters(qs, params, user=self.request.user)
    qs = _apply_user_filters(qs, params, self.request.user)
    qs = _annotate_sort_score(qs, user=self.request.user)
    qs = _apply_ordering(qs, params.get("ordering"))
    return qs.distinct()
```

### H. Frontend request construction

```ts
const filters: MatchFilters = {
  ordering,
  page,
  page_size: PAGE_SIZE,
};

if (gameFilter !== 'all') filters.game_type = gameFilter;
if (resultFilter !== 'all') filters.result = resultFilter;
if (modeFilter !== 'all') {
  filters.mode = modeFilter === '2p' ? 'local' : modeFilter;
}
if (search) filters.search = search;

const data = await getMyMatches(filters);
setMatches(data.results);
setCount(data.count);
```

### I. Frontend debounce algorithm

```ts
useEffect(() => {
  const timeoutId = window.setTimeout(() => {
    setSearch(searchInput.trim());
  }, 300);

  return () => window.clearTimeout(timeoutId);
}, [searchInput]);
```

### J. Example production query

```http
GET /api/games/matches/me/?search=hasan&result=win&mode=pvp&ordering=-date&page=2&page_size=20
```
