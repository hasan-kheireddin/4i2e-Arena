# 42 OAuth 2.0 Implementation Audit

## 1. Scope and Relevant Code

### Backend
- OAuth endpoints: `backend/apps/accounts/oauth_views.py`
- OAuth request validation: `backend/apps/accounts/oauth_serializers.py`
- Provider configuration and profile mapping: `backend/apps/accounts/oauth_providers.py`
- Account / OAuth models: `backend/apps/accounts/models.py`
- Route registration: `backend/apps/accounts/urls.py`, `backend/config/urls.py`
- JWT generation and profile serialization: `backend/apps/accounts/serializers.py`
- Session / cookie settings: `backend/config/settings.py`

### Frontend
- OAuth login button and redirect trigger: `frontend/src/pages/LoginPage.tsx`
- Frontend callback route: `frontend/src/pages/OAuthCallbackPage.tsx`
- Backend API wrappers: `frontend/src/services/auth.ts`
- JWT storage and authenticated fetch: `frontend/src/services/api.ts`
- Route wiring: `frontend/src/App.tsx`

## 2. Executive Summary

- The implementation is a **server-side Authorization Code Flow** with the backend performing:
  - code exchange
  - access-token retrieval
  - user-profile fetch from `https://api.intra.42.fr/v2/me`
  - local user lookup / creation
  - JWT issuance
- The frontend does **not** exchange the authorization code directly with 42 and does **not** hold the 42 client secret.
- The flow is **mostly correct** and includes a server-stored `state` parameter for CSRF protection.
- The main security strengths are:
  - client secret stays server-side
  - token exchange happens server-side
  - `state` is generated with `secrets.token_urlsafe(32)` and verified with `secrets.compare_digest`
  - session cookie for OAuth state is `HttpOnly`, `Secure`, and `SameSite=Lax`
- The main security issues found are:
  1. **Application JWTs are stored in `localStorage`**, exposing them to XSS theft.
  2. **42 access tokens are stored in plaintext in the database**.
  3. **PKCE is not used**.
  4. **HTTPS is assumed rather than fully enforced in Django settings**.
  5. **Automatic account linking by email trusts provider email without an explicit verified-email check in code**.

## 3. OAuth Flow Validation

### Required Flow vs Actual Implementation

| Required Step | Status | Implementation |
|---|---|---|
| 1. Redirect user to 42 authorization endpoint | Implemented | Backend builds the authorization URL in `OAuthInitiateView.get()` and frontend redirects the browser to it |
| 2. Receive `code` in callback | Implemented, but indirectly | 42 redirects to the frontend route `/oauth/callback`; the frontend reads `code` and `state` and POSTs them to the backend callback endpoint |
| 3. Backend exchanges `code` for `access_token` | Implemented | `OAuthCallbackView._exchange_code()` posts to `https://api.intra.42.fr/oauth/token` |
| 4. Backend fetches user data (`/v2/me`) | Implemented | `OAuthCallbackView._fetch_profile()` calls `https://api.intra.42.fr/v2/me` with the bearer token |
| 5. Backend creates or logs in user | Implemented | `_get_or_create_user()` finds an existing OAuth link, links by email, or creates a new user |
| 6. Backend generates session or JWT | Implemented | `get_tokens_for_user()` issues JWT access + refresh tokens |

### Correctness Assessment

- The backend does perform the sensitive OAuth operations.
- The only structural deviation from a pure backend callback flow is that the OAuth redirect terminates at the frontend route first:
  - `GET /oauth/callback` in the browser
  - then `POST /api/accounts/oauth/42/callback/` to the backend
- This still qualifies as server-side code exchange because the frontend only forwards `code` and `state`; it does not exchange the code itself.

## 4. Authentication Endpoints

## Authentication Endpoints

### GET `/api/accounts/oauth/42/initiate/`
- Purpose:
  - Start OAuth login with the 42 provider.
- What it does:
  - loads provider config via `get_provider("42")`
  - generates a cryptographically random `state`
  - stores `state` in the Django session under `oauth_state_42`
  - builds the 42 authorization URL with:
    - `client_id`
    - `redirect_uri`
    - `response_type=code`
    - `scope=public`
    - `state`
  - returns `{ "authorize_url": "..." }`
- Code:
  - `backend/apps/accounts/oauth_views.py:23-64`

### POST `/api/accounts/oauth/42/callback/`
- Purpose:
  - Finalize OAuth login after the browser returns from 42.
- Input:
  - JSON body:
    - `code`
    - `state`
- Processing steps:
  1. validate provider
  2. validate request body with `OAuthCallbackSerializer`
  3. load and pop `oauth_state_42` from session
  4. compare session state to request state
  5. exchange code for token at `https://api.intra.42.fr/oauth/token`
  6. fetch user info from `https://api.intra.42.fr/v2/me`
  7. map provider profile into local fields
  8. find or create the local user
  9. issue local JWT tokens
  10. return `{ user, tokens }`
- Output:
  - JWT access token
  - JWT refresh token
  - serialized user profile
- Code:
  - `backend/apps/accounts/oauth_views.py:66-146`

### GET `/oauth/callback` (frontend route)
- Purpose:
  - Receive the provider redirect in the browser and forward the callback payload to the backend.
- What it does:
  - reads `code` and `state` from the browser URL
  - reads `oauth_provider` from `sessionStorage`
  - calls `oauthCallback(provider, { code, state })`
  - stores returned JWTs client-side and navigates to `/home`
- Code:
  - `frontend/src/pages/OAuthCallbackPage.tsx:7-41`
  - route registration: `frontend/src/App.tsx:39`

## 5. OAuth Flow

1. The user clicks the 42 login button on `LoginPage`.
2. The frontend calls `GET /api/accounts/oauth/42/initiate/` with credentials included.
3. The backend generates a random `state`, stores it in the Django session, and returns the provider authorization URL.
4. The frontend stores `"42"` in `sessionStorage` and performs `window.location.href = authorize_url`.
5. The browser is redirected to the 42 authorization endpoint.
6. After user consent, 42 redirects the browser to the configured `redirect_uri`.
7. In this codebase, that redirect lands on the frontend route `/oauth/callback` with `code` and `state` in the query string.
8. `OAuthCallbackPage` extracts `code` and `state` and POSTs them to `/api/accounts/oauth/42/callback/`.
9. The backend callback endpoint validates the `state` against the session.
10. The backend exchanges the authorization code for an access token.
11. The backend calls `https://api.intra.42.fr/v2/me` using that access token.
12. The backend maps the returned profile into:
  - `provider_user_id`
  - `email`
  - `username`
  - `display_name`
  - `avatar_url`
13. The backend finds an existing `OAuthAccount`, or links by email, or creates a new local `User` and `OAuthAccount`.
14. The backend issues local JWT access and refresh tokens.
15. The frontend stores those JWTs and marks the user authenticated.

## 6. Implementation Breakdown

## Implementation Breakdown

### How the redirect URL is built
- `OAuthInitiateView.get()` loads the provider config from `get_provider(provider)`.
- The provider definition for 42 is in `backend/apps/accounts/oauth_providers.py:53-64`.
- The authorization URL is built from fixed backend-side configuration:
  - `authorize_url="https://api.intra.42.fr/oauth/authorize"`
  - `client_id` from environment
  - `redirect_uri` from environment
  - `response_type=code`
  - `scope=public`
  - `state`
- Code:
  - `backend/apps/accounts/oauth_views.py:54-63`

### How the token request is made
- `OAuthCallbackView._exchange_code()` performs a server-side `POST` using `requests.post(...)`.
- Request body includes:
  - `grant_type=authorization_code`
  - `client_id`
  - `client_secret`
  - `redirect_uri`
  - `code`
- Code:
  - `backend/apps/accounts/oauth_views.py:152-172`

### How user info is fetched
- After token exchange, the backend extracts `access_token = token_data.get("access_token", "")`.
- It then calls the 42 user-info endpoint:
  - `https://api.intra.42.fr/v2/me`
- The profile is mapped by `_map_42_profile(...)` into normalized local fields.
- Code:
  - fetch: `backend/apps/accounts/oauth_views.py:174-190`
  - mapping: `backend/apps/accounts/oauth_providers.py:37-50`

### How the user is created or reused
- `_get_or_create_user(...)` uses a three-step priority:
  1. Existing `OAuthAccount` by `(provider, provider_user_id)`
  2. Existing `User` by email, then create `OAuthAccount`
  3. Create a new `User`, then create `OAuthAccount`
- Uniqueness controls:
  - `User.email` is unique
  - `OAuthAccount(provider, provider_user_id)` is unique
- Code:
  - user model uniqueness: `backend/apps/accounts/models.py:14-16`
  - OAuth unique constraint: `backend/apps/accounts/models.py:89-93`
  - get/create logic: `backend/apps/accounts/oauth_views.py:192-258`

### How authentication is finalized
- After user resolution, the backend generates JWTs through `get_tokens_for_user(user)`.
- Tokens are returned in the callback response payload.
- The frontend stores them in `localStorage`.
- Code:
  - JWT generation: `backend/apps/accounts/serializers.py:230-237`
  - callback response: `backend/apps/accounts/oauth_views.py:131-145`
  - storage: `frontend/src/services/api.ts:1-17`

### OAuth-user restrictions in this codebase
- OAuth users are detected by whether they have linked `oauth_accounts`.
- Password login is blocked in `LoginSerializer`.
- Passwords are set unusable for OAuth-linked users.
- Email is updated from provider data on OAuth login in `_sync_oauth_user(...)`.
- Code:
  - detection: `backend/apps/accounts/models.py:60-63`
  - password-login block: `backend/apps/accounts/serializers.py:101-124`
  - unusable passwords and provider sync: `backend/apps/accounts/oauth_views.py:224-284`

## 7. Security Review

## Security Review

### What is implemented correctly

#### 1. Client secret is not exposed to the frontend
- I did not find any frontend code containing `client_secret`.
- The client secret is read only from backend environment variables:
  - `backend/apps/accounts/oauth_providers.py:29-31`
- Token exchange happens server-side only.
- Result:
  - **Pass**

#### 2. Authorization code exchange is not done in the frontend
- The frontend only calls:
  - `oauthInitiate("42")`
  - `oauthCallback(provider, { code, state })`
- The exchange with `https://api.intra.42.fr/oauth/token` is performed in backend Python code with `requests.post(...)`.
- Result:
  - **Pass**

#### 3. `state` parameter is present and validated
- `state` is generated with `secrets.token_urlsafe(32)`.
- It is stored server-side in the Django session.
- It is popped and checked with `secrets.compare_digest(...)`.
- Result:
  - **Pass**

#### 4. Open redirect exposure
- I did not find a user-controlled `next`, `redirect`, or callback target parameter.
- The provider authorization URL is built from fixed backend config, not from user input.
- Result:
  - **No open redirect found in this flow**

### Security Findings

#### Finding 1: Application JWTs are stored in `localStorage`
- Severity:
  - **High**
- Evidence:
  - `frontend/src/services/api.ts:1-17`
- Why it matters:
  - Any XSS in the frontend can read and exfiltrate both the access token and refresh token.
  - This affects the local app session, not the 42 provider token directly.
- Recommendation:
  - Prefer `HttpOnly`, `Secure`, `SameSite` cookies for application session tokens.
  - If JWTs must remain client-managed, reduce exposure with strict CSP, rigorous XSS hardening, and short token lifetimes.

#### Finding 2: 42 access tokens are stored in plaintext in the database
- Severity:
  - **Medium**
- Evidence:
  - `backend/apps/accounts/models.py:84-87`
  - `backend/apps/accounts/oauth_views.py:214-216`
- Why it matters:
  - The provider access token is persisted unencrypted and updated on login.
  - If the database or admin access is compromised, usable provider tokens can be exposed.
- Recommendation:
  - Do not persist provider access tokens unless they are actually needed beyond the login transaction.
  - If persistence is required, encrypt at rest and store token expiry metadata.

#### Finding 3: PKCE is not implemented
- Severity:
  - **Medium**
- Evidence:
  - No `code_challenge` is added in `OAuthInitiateView.get()`
  - No `code_verifier` is sent in `_exchange_code()`
- Why it matters:
  - The implementation relies on `state` and confidential-client authentication.
  - That is functional, but modern OAuth guidance recommends PKCE even for confidential clients.
- Recommendation:
  - Add PKCE (`code_challenge`, `code_verifier`) to strengthen authorization-code protection.

#### Finding 4: HTTPS is assumed rather than fully enforced in application settings
- Severity:
  - **Medium**
- Evidence:
  - Positive:
    - `SESSION_COOKIE_SECURE = True`
    - `SESSION_COOKIE_HTTPONLY = True`
    - `SESSION_COOKIE_SAMESITE = "Lax"`
  - Missing enforcement in the visible settings:
    - no `SECURE_SSL_REDIRECT`
    - no HSTS settings
    - no visible `SECURE_PROXY_SSL_HEADER`
- Why it matters:
  - The OAuth flow depends on secure transport, especially for the session cookie used to store `state`.
  - In production, HTTPS should be enforced end-to-end, not just assumed by cookie flags.
- Recommendation:
  - Enforce HTTPS at the application or reverse-proxy layer and enable HSTS.

#### Finding 5: Automatic account linking by email trusts provider email without an explicit verified-email check in code
- Severity:
  - **Medium**
- Evidence:
  - `backend/apps/accounts/oauth_views.py:224-237`
- Why it matters:
  - If an OAuth login returns an email matching an existing local account, the code automatically links that identity to the local user.
  - The code does not check a `verified_email` field because the mapped 42 profile does not include one.
  - If the provider does not guarantee that email is verified and stable, this can become an account-linking risk.
- Recommendation:
  - Only auto-link when the provider guarantees verified email, or require an authenticated link flow / explicit confirmation step.

#### Finding 6: Race conditions are possible during first-time OAuth login
- Severity:
  - **Low**
- Evidence:
  - `_get_or_create_user(...)` performs separate read and create operations without transaction handling.
- Why it matters:
  - Concurrent first logins for the same OAuth identity could hit uniqueness constraints and return 500-level failures unless integrity errors are handled higher up.
- Recommendation:
  - Wrap account creation/linking in a transaction and catch uniqueness collisions explicitly.

#### Finding 7: Callback completion depends on `sessionStorage` provider state in the browser
- Severity:
  - **Low**
- Evidence:
  - `frontend/src/pages/OAuthCallbackPage.tsx:13-19`
- Why it matters:
  - The callback page silently returns if `oauth_provider` is missing from `sessionStorage`.
  - Refreshing the callback page or opening it in a different tab can therefore break completion.
- Recommendation:
  - Encode the provider in the callback route or backend redirect URI rather than relying on transient browser storage.

## 8. User Handling Audit

### How OAuth users are matched
- Primary match:
  - `OAuthAccount(provider, provider_user_id)`
- Secondary match:
  - local `User` by email
- Code:
  - `backend/apps/accounts/oauth_views.py:207-237`

### Duplicate prevention
- `OAuthAccount` has a unique constraint on `(provider, provider_user_id)`.
- `User.email` is unique.
- `User.username` and `display_name` are also unique.
- Result:
  - **Duplicate prevention exists at the database layer**

### Is `get_or_create` used?
- No.
- Equivalent logic is implemented manually with:
  - lookup existing OAuth link
  - fallback email match
  - else create user + OAuthAccount
- Result:
  - Functionally acceptable, but race-safe handling is weaker than a transactionally guarded `get_or_create` / `update_or_create` pattern.

### Is user matched by `intra_id`?
- Not by a field named `intra_id` on `User`.
- Instead, the 42 user ID is stored as:
  - `OAuthAccount.provider_user_id`
- This is the correct place for provider-specific identity.

## 9. Limitations and Improvement Opportunities

- The provider redirect does not land directly on a backend callback URL; it lands on a frontend route first.
  - This is acceptable, but it means callback completion depends on frontend JavaScript being available.
- The backend stores provider access tokens but there is no visible use of those tokens after login.
  - This persistence may be unnecessary risk.
- The code does not validate whether the token response explicitly contains a non-empty `access_token` before continuing.
  - A malformed but 200 OK token response would fail later during profile fetch.
- `_sync_oauth_user(...)` updates email only if there is no collision with another user.
  - If a collision exists, the login still succeeds and the email remains stale locally.
- No PKCE support is implemented.
- No explicit transaction handling or integrity-error recovery is present around account-link creation.
- JWTs are browser-accessible because they are stored in `localStorage`.

## 10. Final Verdict

- **Correctness**:
  - The OAuth flow is correctly implemented as a server-side authorization-code exchange with backend token handling and backend user provisioning.
- **Security**:
  - The implementation gets the important basics right:
    - backend-only token exchange
    - server-side client secret
    - `state` protection
    - JWT issuance after backend verification
  - However, there are meaningful security issues that should be addressed:
    1. localStorage token storage
    2. plaintext provider-token storage
    3. missing PKCE
    4. deployment-dependent HTTPS enforcement
    5. trust-on-email auto-linking

## 11. Security Reference Links

- OAuth 2.0 (RFC 6749): https://www.ietf.org/rfc/rfc6749.txt.pdf
- OAuth 2.0 Security Best Current Practice draft: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics-26
- OAuth 2.0 for Browser-Based Apps draft: https://www.ietf.org/archive/id/draft-ietf-oauth-browser-based-apps-09.html
- 42 API user profile docs referenced by the code: https://api.intra.42.fr/apidoc/2.0/users/me.html

## 12. Code Blocks

### Location: `backend/apps/accounts/oauth_providers.py` (42 provider configuration)

```py
OAUTH_PROVIDERS: Dict[str, OAuthProvider] = {
    "42": OAuthProvider(
        name="42",
        authorize_url="https://api.intra.42.fr/oauth/authorize",
        token_url="https://api.intra.42.fr/oauth/token",
        user_info_url="https://api.intra.42.fr/v2/me",
        scopes=["public"],
        client_id_env="OAUTH_42_CLIENT_ID",
        client_secret_env="OAUTH_42_CLIENT_SECRET",
        redirect_uri_env="OAUTH_42_REDIRECT_URI",
        profile_mapper=_map_42_profile,
    ),
}
```

### Location: `backend/apps/accounts/oauth_providers.py` (42 profile mapping)

```py
def _map_42_profile(data: dict) -> dict:
    return {
        "provider_user_id": str(data.get("id", "")),
        "email": data.get("email", ""),
        "username": data.get("login", ""),
        "display_name": data.get("displayname") or data.get("login", ""),
        "avatar_url": (data.get("image") or {}).get("link", ""),
    }
```

### Location: `backend/apps/accounts/oauth_views.py` (OAuth initiate endpoint)

```py
class OAuthInitiateView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, provider):
        try:
            cfg = get_provider(provider)
        except ValueError:
            return Response(
                {"detail": f"Unknown OAuth provider: {provider}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not cfg.client_id:
            return Response(
                {"detail": f"OAuth provider '{provider}' is not configured."},
                status=status.HTTP_501_NOT_IMPLEMENTED,
            )

        state = secrets.token_urlsafe(32)
        request.session[f"oauth_state_{provider}"] = state
        request.session.modified = True

        params = {
            "client_id": cfg.client_id,
            "redirect_uri": cfg.redirect_uri,
            "response_type": "code",
            "scope": " ".join(cfg.scopes),
            "state": state,
        }
        authorize_url = f"{cfg.authorize_url}?{urlencode(params)}"

        return Response({"authorize_url": authorize_url})
```

### Location: `backend/apps/accounts/oauth_views.py` (OAuth callback endpoint)

```py
class OAuthCallbackView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, provider):
        try:
            cfg = get_provider(provider)
        except ValueError:
            return Response(
                {"detail": f"Unknown OAuth provider: {provider}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = OAuthCallbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]
        state = serializer.validated_data["state"]

        expected_state = request.session.pop(f"oauth_state_{provider}", None)
        if not expected_state or not secrets.compare_digest(expected_state, state):
            return Response(
                {"detail": "Invalid or expired state parameter."},
                status=status.HTTP_403_FORBIDDEN,
            )

        token_data = self._exchange_code(cfg, code)
        if token_data is None:
            return Response(
                {"detail": "Failed to exchange authorization code."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        access_token = token_data.get("access_token", "")
        profile = self._fetch_profile(cfg, access_token)
        if profile is None:
            return Response(
                {"detail": "Failed to fetch user profile from provider."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        mapped = cfg.profile_mapper(profile)
        provider_user_id = mapped["provider_user_id"]
        user = self._get_or_create_user(provider, provider_user_id, mapped, access_token)

        tokens = get_tokens_for_user(user)
        user_data = UserProfileSerializer(user).data

        return Response(
            {"user": user_data, "tokens": tokens},
            status=status.HTTP_200_OK,
        )
```

### Location: `backend/apps/accounts/oauth_views.py` (code exchange with 42)

```py
@staticmethod
def _exchange_code(cfg, code: str) -> dict | None:
    try:
        resp = requests.post(
            cfg.token_url,
            data={
                "grant_type": "authorization_code",
                "client_id": cfg.client_id,
                "client_secret": cfg.client_secret,
                "redirect_uri": cfg.redirect_uri,
                "code": code,
            },
            headers={"Accept": "application/json"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException:
        logger.exception("OAuth token exchange failed for %s", cfg.name)
        return None
```

### Location: `backend/apps/accounts/oauth_views.py` (fetching `/v2/me`)

```py
@staticmethod
def _fetch_profile(cfg, access_token: str) -> dict | None:
    try:
        resp = requests.get(
            cfg.user_info_url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            },
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException:
        logger.exception("OAuth profile fetch failed for %s", cfg.name)
        return None
```

### Location: `backend/apps/accounts/oauth_views.py` (user lookup, linking, and creation)

```py
@staticmethod
def _get_or_create_user(
    provider: str,
    provider_user_id: str,
    mapped: dict,
    access_token: str,
) -> User:
    try:
        oauth = OAuthAccount.objects.select_related("user").get(
            provider=provider,
            provider_user_id=provider_user_id,
        )
        if access_token and oauth.access_token != access_token:
            oauth.access_token = access_token
            oauth.save(update_fields=["access_token"])
        OAuthCallbackView._sync_oauth_user(oauth.user, mapped)
        return oauth.user
    except OAuthAccount.DoesNotExist:
        pass

    email = mapped.get("email", "").strip().lower()

    if email:
        try:
            existing_user = User.objects.get(email=email)
            OAuthAccount.objects.create(
                user=existing_user,
                provider=provider,
                provider_user_id=provider_user_id,
                access_token=access_token,
            )
            existing_user.set_unusable_password()
            existing_user.save(update_fields=["password"])
            OAuthCallbackView._sync_oauth_user(existing_user, mapped)
            return existing_user
        except User.DoesNotExist:
            pass

    username = _unique_username(mapped.get("username", "user"))
    user = User.objects.create_user(
        username=username,
        email=email,
        display_name=mapped.get("display_name", username),
        avatar_url=mapped.get("avatar_url", ""),
    )
    user.set_unusable_password()
    user.save(update_fields=["password"])
    OAuthAccount.objects.create(
        user=user,
        provider=provider,
        provider_user_id=provider_user_id,
        access_token=access_token,
    )
    OAuthCallbackView._sync_oauth_user(user, mapped)
    return user
```

### Location: `backend/apps/accounts/oauth_views.py` (provider-driven email sync)

```py
@staticmethod
def _sync_oauth_user(user: User, mapped: dict) -> None:
    update_fields: list[str] = []

    provider_email = mapped.get("email", "").strip().lower()
    if (
        provider_email
        and user.email != provider_email
        and not User.objects.filter(email__iexact=provider_email).exclude(pk=user.pk).exists()
    ):
        user.email = provider_email
        update_fields.append("email")

    if user.has_usable_password():
        user.set_unusable_password()
        update_fields.append("password")

    if update_fields:
        user.save(update_fields=update_fields)
```

### Location: `backend/apps/accounts/models.py` (OAuth account model and unique constraint)

```py
class OAuthAccount(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="oauth_accounts",
    )
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES)
    provider_user_id = models.CharField(max_length=100)
    access_token = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "oauth_accounts"
        unique_together = [("provider", "provider_user_id")]
```

### Location: `frontend/src/pages/LoginPage.tsx` (frontend initiation)

```ts
const handle42Login = async () => {
  try {
    const { authorize_url } = await oauthInitiate("42");
    sessionStorage.setItem("oauth_provider", "42");
    window.location.href = authorize_url;
  } catch {
    setServerError(t("errors.login_42_failed"));
  }
};
```

### Location: `frontend/src/pages/OAuthCallbackPage.tsx` (frontend callback relay)

```ts
useEffect(() => {
  const provider = sessionStorage.getItem("oauth_provider");
  if (!provider) return;
  sessionStorage.removeItem("oauth_provider");

  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    setError("Invalid callback parameters. Missing authorization code or state.");
    return;
  }

  const handleCallback = async () => {
    try {
      const res = await oauthCallback(provider, { code, state });
      setUser(res.user);
      navigate("/home");
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      setError(apiErr.detail ?? "Authentication failed. Please try again.");
    }
  };

  handleCallback();
}, [searchParams, navigate, setUser]);
```

### Location: `frontend/src/services/api.ts` (JWT storage)

```ts
export function getAccessToken(): string | null {
  return localStorage.getItem("access_token");
}

export function getRefreshToken(): string | null {
  return localStorage.getItem("refresh_token");
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
}

export function clearTokens(): void {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}
```
