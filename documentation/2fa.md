# Two-Factor Authentication (2FA)

## 1. Overview
- The project implements TOTP-based 2FA, not email-based or static verification codes.
- Backend enforcement is handled in [backend/apps/accounts/twofa_views.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/accounts/twofa_views.py), [backend/apps/accounts/views.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/accounts/views.py), and [backend/apps/accounts/oauth_views.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/accounts/oauth_views.py).
- The persistent 2FA state is split into:
  - `User.is_2fa_enabled` in [backend/apps/accounts/models.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/accounts/models.py)
  - `TOTPDevice` in the same file, which stores the encrypted TOTP secret and confirmation state
- Frontend integration is handled in [frontend/src/services/auth.ts](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/frontend/src/services/auth.ts), [frontend/src/pages/LoginPage.tsx](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/frontend/src/pages/LoginPage.tsx), [frontend/src/pages/OAuthCallbackPage.tsx](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/frontend/src/pages/OAuthCallbackPage.tsx), and [frontend/src/pages/Verify2fapage.tsx](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/frontend/src/pages/Verify2fapage.tsx).

## 2. Setup Flow
1. The authenticated user calls `POST /api/accounts/2fa/setup/`.
2. The backend refuses re-enrollment if the user already has a confirmed device.
3. Any unconfirmed device for that user is deleted.
4. A new Base32 secret is generated with `pyotp.random_base32()`.
5. The backend creates an `otpauth://` URI for authenticator apps.
6. A QR code is generated from that URI and returned as base64 PNG.
7. The secret is encrypted before being stored in `TOTPDevice.encrypted_secret`.
8. 2FA is still disabled at this stage because `confirmed=False` and `user.is_2fa_enabled` is not changed yet.

Code location: [backend/apps/accounts/twofa_views.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/accounts/twofa_views.py)

```python
class TwoFactorSetupView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user

        if hasattr(user, "totp_device") and user.totp_device.confirmed:
            return Response(
                {"detail": "2FA is already enabled. Disable it first to re-enroll."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        TOTPDevice.objects.filter(user=user, confirmed=False).delete()

        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        otpauth_uri = totp.provisioning_uri(
            name=user.email or user.username,
            issuer_name=TOTP_ISSUER,
        )

        qr_img = qrcode.make(otpauth_uri, box_size=6, border=2)
        buf = io.BytesIO()
        qr_img.save(buf, format="PNG")
        qr_b64 = base64.b64encode(buf.getvalue()).decode()

        device = TOTPDevice(user=user)
        device.set_secret(secret)
        device.save()

        return Response(
            {
                "secret": secret,
                "otpauth_uri": otpauth_uri,
                "qr_code": f"data:image/png;base64,{qr_b64}",
            },
            status=status.HTTP_200_OK,
        )
```

## 3. Verification Flow
1. The user submits the first 6-digit authenticator code to `POST /api/accounts/2fa/verify/`.
2. The backend validates the code format with `TwoFactorConfirmSerializer`.
3. The backend loads the pending `TOTPDevice`.
4. The decrypted secret is verified with `pyotp.TOTP(secret).verify(code, valid_window=1)`.
5. On success:
   - `device.confirmed = True`
   - `user.is_2fa_enabled = True`
6. On failure:
   - the setup is not enabled
   - the failed-attempt counter is incremented
7. A backward-compatible alias exists at `POST /api/accounts/2fa/confirm/`, but the main setup-verification endpoint is `/api/accounts/2fa/verify/`.

Code location: [backend/apps/accounts/twofa_views.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/accounts/twofa_views.py)

```python
class TwoFactorConfirmView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = TwoFactorConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"]

        user = request.user
        rate_key = _attempt_cache_key("setup", user.pk)
        try:
            device = TOTPDevice.objects.get(user=user)
        except TOTPDevice.DoesNotExist:
            return Response(
                {"detail": "No 2FA setup found. Call /2fa/setup/ first."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if device.confirmed:
            return Response(
                {"detail": "2FA is already confirmed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if _is_rate_limited(rate_key):
            return Response(
                {"detail": "Too many invalid 2FA attempts. Please wait a few minutes and try again."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        secret = device.get_secret()
        totp = pyotp.TOTP(secret)
        if not totp.verify(code, valid_window=1):
            _record_failed_attempt(rate_key)
            return Response(
                {"detail": "Invalid code. Please try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        _clear_failed_attempts(rate_key)
        device.confirmed = True
        device.save(update_fields=["confirmed"])

        user.is_2fa_enabled = True
        user.save(update_fields=["is_2fa_enabled"])

        return Response(
            {"detail": "Two-factor authentication enabled successfully."},
            status=status.HTTP_200_OK,
        )
```

## 4. Login Flow
1. The first factor is either password login or OAuth login.
2. Both login paths check `user.is_2fa_enabled`.
3. If 2FA is disabled, the backend immediately issues normal JWTs.
4. If 2FA is enabled and a confirmed `TOTPDevice` exists, the backend returns:
   - `requires_2fa: true`
   - `temp_token`
   - `user_id`
5. The frontend must not consider the user authenticated yet.
6. The frontend stores the pending `temp_token` in `sessionStorage` under `pending_2fa`.
7. The frontend redirects the user to `/verify-2fa`.
8. The verify page submits `temp_token` and `code` to `POST /api/accounts/2fa/login-verify/`.
9. Only after successful TOTP verification does the backend return final JWTs.

Backend password-login gate location: [backend/apps/accounts/views.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/accounts/views.py)

```python
class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]

        user.last_activity = timezone.now()
        user.save(update_fields=["last_activity"])

        if user.is_2fa_enabled:
            has_confirmed_device = TOTPDevice.objects.filter(
                user=user,
                confirmed=True,
            ).exists()
            if not has_confirmed_device:
                logger.warning(
                    "User %s has is_2fa_enabled=True but no confirmed TOTP device",
                    user.pk,
                )
                user.is_2fa_enabled = False
                user.save(update_fields=["is_2fa_enabled"])
            else:
                return Response(
                    {
                        "requires_2fa": True,
                        "temp_token": _issue_temp_token(user, auth_method="password"),
                        "user_id": str(user.id),
                    },
                    status=status.HTTP_200_OK,
                )

        tokens = get_tokens_for_user(user)
        profile = UserProfileSerializer(user).data
        return Response({"user": profile, "tokens": tokens}, status=status.HTTP_200_OK)
```

Frontend login handling location: [frontend/src/services/auth.ts](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/frontend/src/services/auth.ts)

```ts
export async function login(data: {
  username: string;
  password: string;
}): Promise<LoginResponse> {
  const res = await apiFetch<LoginResponse>(`${AUTH}/login/`, {
    method: "POST",
    body: data,
    auth: false,
  });
  if (isTwoFARequired(res)) {
    clearTokens();
    storePendingTwoFA(res.temp_token, res.user_id);
  } else {
    clearPendingTwoFA();
    setTokens(res.tokens.access, res.tokens.refresh);
  }
  return res;
}
```

Frontend navigation from the login page location: [frontend/src/pages/LoginPage.tsx](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/frontend/src/pages/LoginPage.tsx)

```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!validate()) return;
  setLoading(true);
  setServerError("");
  clearPendingTwoFA();

  try {
    const res = await apiLogin({
      username: formData.username,
      password: formData.password,
    });

    if (isTwoFARequired(res)) {
      clearTokens();
      setUser(null);
      navigate("/verify-2fa");
    } else {
      setUser(res.user);
      navigate("/home");
    }
  } catch (err: unknown) {
    ...
  } finally {
    setLoading(false);
  }
};
```

## 5. OAuth Integration
- 42 OAuth is integrated into the same backend 2FA gate as password login.
- The backend completes the OAuth first-factor steps first:
  - provider validation
  - `code` + `state` validation
  - token exchange
  - user-profile fetch
  - user lookup or creation
- After that, it checks `user.is_2fa_enabled`.
- If 2FA is enabled and a confirmed device exists, OAuth does not issue final JWTs. It returns the pending 2FA response instead.
- The frontend handles this the same way as password login: it clears any existing JWTs, stores the pending token, and redirects to `/verify-2fa`.

Backend OAuth gate location: [backend/apps/accounts/oauth_views.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/accounts/oauth_views.py)

```python
if user.is_2fa_enabled:
    has_confirmed_device = TOTPDevice.objects.filter(
        user=user,
        confirmed=True,
    ).exists()
    if has_confirmed_device:
        return Response(
            {
                "requires_2fa": True,
                "temp_token": _issue_temp_token(
                    user,
                    auth_method="oauth",
                    provider=provider,
                ),
                "user_id": str(user.id),
            },
            status=status.HTTP_200_OK,
        )

    logger.warning(
        "User %s has is_2fa_enabled=True but no confirmed TOTP device during OAuth login",
        user.pk,
    )
    user.is_2fa_enabled = False
    user.save(update_fields=["is_2fa_enabled"])
```

Frontend OAuth callback location: [frontend/src/pages/OAuthCallbackPage.tsx](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/frontend/src/pages/OAuthCallbackPage.tsx)

```tsx
const handleCallback = async () => {
  try {
    const res = await oauthCallback(provider, { code, state });
    if (isTwoFARequired(res)) {
      clearTokens();
      setUser(null);
      navigate("/verify-2fa", { replace: true });
    } else {
      setUser(res.user);
      navigate("/home", { replace: true });
    }
  } catch (err: unknown) {
    ...
  }
};
```

## 6. Endpoints
- `POST /api/accounts/2fa/setup/`
  - Generate TOTP secret, provisioning URI, and QR code
  - Does not enable 2FA yet
- `POST /api/accounts/2fa/verify/`
  - Verify the first TOTP code during enrollment
  - Marks the device confirmed and enables 2FA
- `POST /api/accounts/2fa/login-verify/`
  - Verify the TOTP code during login
  - Requires a temporary pending-2FA token
  - Returns final JWTs on success
- `POST /api/accounts/2fa/disable/`
  - Requires a valid TOTP code
  - Deletes the device and disables 2FA
- `GET /api/accounts/2fa/status/`
  - Returns current 2FA status
- `POST /api/accounts/2fa/confirm/`
  - Backward-compatible alias for setup verification

Endpoint registration location: [backend/apps/accounts/urls.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/accounts/urls.py)

```python
path("2fa/setup/", twofa_views.TwoFactorSetupView.as_view(), name="2fa-setup"),
path("2fa/verify/", twofa_views.TwoFactorConfirmView.as_view(), name="2fa-verify-setup"),
path("2fa/login-verify/", twofa_views.TwoFactorVerifyView.as_view(), name="2fa-login-verify"),
path("2fa/confirm/", twofa_views.TwoFactorConfirmView.as_view(), name="2fa-confirm"),
path("2fa/disable/", twofa_views.TwoFactorDisableView.as_view(), name="2fa-disable"),
path("2fa/status/", twofa_views.TwoFactorStatusView.as_view(), name="2fa-status"),
```

## 7. Security Considerations
- The TOTP secret is encrypted at rest and is not stored in plaintext.
- TOTP verification is backend-enforced for both login methods.
- The temporary token used between first factor and second factor is short-lived and marked with `twofa_pending=True`.
- The login verification endpoint rejects invalid or expired temporary tokens.
- Rate limiting exists for:
  - setup verification
  - login verification
  - disable flow
- The current rate-limit values are:
  - `TWOFA_ATTEMPT_LIMIT = 5`
  - `TWOFA_ATTEMPT_WINDOW = 300`
- TOTP verification uses `valid_window=1`, which tolerates small clock drift without accepting arbitrary stale codes.

Encrypted-secret storage location: [backend/apps/accounts/models.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/accounts/models.py)

```python
class TOTPDevice(models.Model):
    user = models.OneToOneField(
        "User",
        on_delete=models.CASCADE,
        related_name="totp_device",
    )
    encrypted_secret = models.TextField()
    recovery_codes = models.JSONField(default=list, blank=True)
    confirmed = models.BooleanField(default=False)

    @staticmethod
    def _derive_key() -> bytes:
        import base64
        dk = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
        return base64.urlsafe_b64encode(dk)

    def set_secret(self, plain_secret: str) -> None:
        from cryptography.fernet import Fernet
        f = Fernet(self._derive_key())
        self.encrypted_secret = f.encrypt(plain_secret.encode()).decode()

    def get_secret(self) -> str:
        from cryptography.fernet import Fernet
        f = Fernet(self._derive_key())
        return f.decrypt(self.encrypted_secret.encode()).decode()
```

Temporary-token and rate-limit helpers location: [backend/apps/accounts/twofa_views.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/accounts/twofa_views.py)

```python
TWOFA_ATTEMPT_LIMIT = 5
TWOFA_ATTEMPT_WINDOW = 300

def _issue_temp_token(user: User, *, auth_method: str, provider: str = "") -> str:
    temp_token = AccessToken.for_user(user)
    temp_token.set_exp(lifetime=timezone.timedelta(minutes=5))
    temp_token["twofa_pending"] = True
    temp_token["auth_method"] = auth_method
    if provider:
        temp_token["oauth_provider"] = provider
    return str(temp_token)

def _is_rate_limited(key: str) -> bool:
    return int(cache.get(key, 0)) >= TWOFA_ATTEMPT_LIMIT

def _record_failed_attempt(key: str) -> None:
    current = int(cache.get(key, 0))
    cache.set(key, current + 1, timeout=TWOFA_ATTEMPT_WINDOW)
```

## 8. Limitations
- Recovery codes exist in the `TOTPDevice` model but are not exposed through an active login-verification endpoint.
- The current second-factor login flow supports authenticator-app TOTP only.
- Rate limiting is basic and cache-backed. It is not per-IP and does not implement more advanced anti-automation controls.
- There is no self-service recovery path for users who lose access to the authenticator app and do not have an administrative recovery process.
- Secrets are encrypted with a key derived from Django `SECRET_KEY`, so secret-rotation strategy is not implemented separately.
- The views assume secure deployment with HTTPS and correct session/cookie configuration around OAuth.

## 9. Code Blocks
This section collects the most important implementation blocks in one place with file locations.

### A. Backend model fields
Location: [backend/apps/accounts/models.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/accounts/models.py)

```python
class User(AbstractUser):
    ...
    is_2fa_enabled = models.BooleanField(default=False)

class TOTPDevice(models.Model):
    ...
    encrypted_secret = models.TextField()
    recovery_codes = models.JSONField(default=list, blank=True)
    confirmed = models.BooleanField(default=False)
```

### B. Backend pending-2FA token issuance
Location: [backend/apps/accounts/twofa_views.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/accounts/twofa_views.py)

```python
def _issue_temp_token(user: User, *, auth_method: str, provider: str = "") -> str:
    temp_token = AccessToken.for_user(user)
    temp_token.set_exp(lifetime=timezone.timedelta(minutes=5))
    temp_token["twofa_pending"] = True
    temp_token["auth_method"] = auth_method
    if provider:
        temp_token["oauth_provider"] = provider
    return str(temp_token)
```

### C. Backend login verification endpoint
Location: [backend/apps/accounts/twofa_views.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/accounts/twofa_views.py)

```python
class TwoFactorVerifyView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = TwoFactorVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        temp_token = serializer.validated_data["temp_token"]
        code = serializer.validated_data["code"]

        user = _user_from_temp_token(temp_token)
        if user is None:
            return Response(
                {"detail": "Invalid or expired temporary token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        device = TOTPDevice.objects.get(user=user, confirmed=True)
        secret = device.get_secret()
        totp = pyotp.TOTP(secret)
        if not totp.verify(code, valid_window=1):
            return Response({"detail": "Invalid TOTP code."}, status=status.HTTP_400_BAD_REQUEST)

        tokens = get_tokens_for_user(user)
        profile = UserProfileSerializer(user).data
        return Response({"user": profile, "tokens": tokens}, status=status.HTTP_200_OK)
```

### D. Frontend pending-2FA storage
Location: [frontend/src/services/auth.ts](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/frontend/src/services/auth.ts)

```ts
const PENDING_TWOFA_STORAGE_KEY = "pending_2fa";

export function storePendingTwoFA(tempToken: string, userId?: string): void {
  sessionStorage.setItem(
    PENDING_TWOFA_STORAGE_KEY,
    JSON.stringify({
      temp_token: tempToken,
      user_id: userId,
    }),
  );
}

export function getPendingTwoFA(): PendingTwoFAState | null {
  const raw = sessionStorage.getItem(PENDING_TWOFA_STORAGE_KEY);
  if (!raw) return null;
  ...
}

export function clearPendingTwoFA(): void {
  sessionStorage.removeItem(PENDING_TWOFA_STORAGE_KEY);
}
```

### E. Frontend 2FA verification request
Location: [frontend/src/services/auth.ts](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/frontend/src/services/auth.ts)

```ts
export async function twoFAVerify(data: {
  temp_token: string;
  code: string;
}): Promise<AuthResponse> {
  const res = await apiFetch<AuthResponse>(`${AUTH}/2fa/login-verify/`, {
    method: "POST",
    body: data,
    auth: false,
  });
  clearPendingTwoFA();
  setTokens(res.tokens.access, res.tokens.refresh);
  return res;
}
```

### F. Frontend verify page submission
Location: [frontend/src/pages/Verify2fapage.tsx](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/frontend/src/pages/Verify2fapage.tsx)

```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  const codeString = code.join("");

  if (codeString.length !== 6) {
    setError(t("errors.code_length"));
    return;
  }
  if (!tempToken) {
    setError(t("2fa.back_to_login"));
    return;
  }

  setLoading(true);
  setError("");

  try {
    const res = await twoFAVerify({ temp_token: tempToken, code: codeString });
    setUser(res.user);
    navigate("/home");
  } catch (err: unknown) {
    ...
  } finally {
    setLoading(false);
  }
};
```
