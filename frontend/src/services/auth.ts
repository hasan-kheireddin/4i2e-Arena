import { apiFetch, setTokens, clearTokens, getRefreshToken, ApiError } from "./api";

export interface User {
  id: string;            // UUID
  username: string;
  email: string;
  display_name: string;
  avatar_url: string;
  preferred_language: string;
  xp: number;
  level: number;
  is_2fa_enabled: boolean;
  is_oauth_user: boolean;
  last_activity: string | null;
  date_joined: string;
}

export interface Tokens {
  access: string;
  refresh: string;
}

export interface AuthResponse {
  user: User;
  tokens: Tokens;
}

export interface RegisterResponse {
  requires_verification: true;
  email: string;
  detail: string;
}

export interface TwoFARequired {
  requires_2fa: true;
  temp_token: string;
  user_id: string;
}

interface PendingTwoFAState {
  temp_token: string;
  user_id?: string;
}

export type LoginResponse = AuthResponse | TwoFARequired;

export function isTwoFARequired(res: LoginResponse): res is TwoFARequired {
  return "requires_2fa" in res && res.requires_2fa === true;
}

export type OAuthCallbackResponse = AuthResponse | TwoFARequired;

export interface TwoFASetupResponse {
  secret: string;
  otpauth_uri: string;
  qr_code: string;           // base64 data URI
}

// Re-export for convenience
export type { ApiError };

const AUTH = "/api/accounts";
const PENDING_TWOFA_STORAGE_KEY = "pending_2fa";

export function storePendingTwoFA(tempToken: string, userId?: string): void {
  sessionStorage.setItem(
    PENDING_TWOFA_STORAGE_KEY,
    JSON.stringify({
      temp_token: tempToken,
      user_id: userId,
    } satisfies PendingTwoFAState),
  );
}

export function getPendingTwoFA(): PendingTwoFAState | null {
  const raw = sessionStorage.getItem(PENDING_TWOFA_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingTwoFAState;
    if (!parsed.temp_token || typeof parsed.temp_token !== "string") {
      clearPendingTwoFA();
      return null;
    }
    return parsed;
  } catch {
    clearPendingTwoFA();
    return null;
  }
}

export function clearPendingTwoFA(): void {
  sessionStorage.removeItem(PENDING_TWOFA_STORAGE_KEY);
}

/** POST /api/accounts/register/ */
export async function register(data: {
  username: string;
  email: string;
  password: string;
  password2: string;
  display_name?: string;
}): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>(`${AUTH}/register/`, {
    method: "POST",
    body: data,
    auth: false,
  });
}

/** POST /api/accounts/verify-email/ */
export async function verifyEmail(data: {
  email: string;
  code: string;
}): Promise<AuthResponse> {
  const res = await apiFetch<AuthResponse>(`${AUTH}/verify-email/`, {
    method: "POST",
    body: data,
    auth: false,
  });
  clearPendingTwoFA();
  setTokens(res.tokens.access, res.tokens.refresh);
  return res;
}

/** POST /api/accounts/resend-otp/ */
export async function resendOTP(email: string): Promise<{ detail: string }> {
  return apiFetch(`${AUTH}/resend-otp/`, {
    method: "POST",
    body: { email },
    auth: false,
  });
}

/** POST /api/accounts/password-reset/ */
export async function requestPasswordReset(email: string): Promise<{ detail: string }> {
  return apiFetch(`${AUTH}/password-reset/`, {
    method: "POST",
    body: { email },
    auth: false,
  });
}

/** POST /api/accounts/password-reset/confirm/ */
export async function confirmPasswordReset(data: {
  token: string;
  password: string;
  password2: string;
}): Promise<{ detail: string }> {
  return apiFetch(`${AUTH}/password-reset/confirm/`, {
    method: "POST",
    body: data,
    auth: false,
  });
}

/** POST /api/accounts/login/ */
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

/** POST /api/accounts/logout/ */
export async function logout(): Promise<void> {
  const refresh = getRefreshToken();
  try {
    await apiFetch(`${AUTH}/logout/`, {
      method: "POST",
      body: { refresh },
    });
  } catch {
    // Even if the server call fails, clear local tokens
  }
  clearPendingTwoFA();
  clearTokens();
}

/** GET /api/accounts/me/ — fetch current user profile */
export async function getProfile(): Promise<User> {
  return apiFetch<User>(`${AUTH}/me/`);
}

/** PATCH /api/accounts/me/update/ */
export async function updateProfile(data: {
  display_name?: string;
  avatar_url?: string;
  preferred_language?: string;
}): Promise<User> {
  return apiFetch<User>(`${AUTH}/me/update/`, {
    method: "PATCH",
    body: data,
  });
}

/** POST /api/accounts/me/change-password/ */
export async function changePassword(data: {
  old_password: string;
  new_password: string;
  new_password2: string;
}): Promise<{ detail: string }> {
  return apiFetch(`${AUTH}/me/change-password/`, {
    method: "POST",
    body: data,
  });
}

/** POST /api/accounts/token/refresh/ */
export async function refreshToken(refresh: string): Promise<Tokens> {
  return apiFetch<Tokens>(`${AUTH}/token/refresh/`, {
    method: "POST",
    body: { refresh },
    auth: false,
  });
}

/** GET /api/accounts/oauth/<provider>/initiate/ */
export async function oauthInitiate(
  provider: string,
): Promise<{ authorize_url: string }> {
  return apiFetch(`${AUTH}/oauth/${provider}/initiate/`, { auth: false, withCredentials: true });
}

/** POST /api/accounts/oauth/<provider>/callback/ */
export async function oauthCallback(
  provider: string,
  data: { code: string; state: string },
): Promise<OAuthCallbackResponse> {
  const res = await apiFetch<OAuthCallbackResponse>(`${AUTH}/oauth/${provider}/callback/`, {
    method: "POST",
    body: data,
    auth: false,
    withCredentials: true,
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

/** POST /api/accounts/2fa/setup/ — (authenticated) */
export async function twoFASetup(): Promise<TwoFASetupResponse> {
  return apiFetch(`${AUTH}/2fa/setup/`, { method: "POST" });
}

/** POST /api/accounts/2fa/verify/ — (authenticated, setup confirmation) */
export async function twoFAConfirm(code: string): Promise<{ detail: string }> {
  return apiFetch(`${AUTH}/2fa/verify/`, {
    method: "POST",
    body: { code },
  });
}

/** POST /api/accounts/2fa/login-verify/ — (public, temp_token) */
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

/** POST /api/accounts/2fa/disable/ — (authenticated) */
export async function twoFADisable(code: string): Promise<{ detail: string }> {
  return apiFetch(`${AUTH}/2fa/disable/`, {
    method: "POST",
    body: { code },
  });
}

/** GET /api/accounts/2fa/status/ — (authenticated) */
export async function twoFAStatus(): Promise<{
  is_2fa_enabled: boolean;
  confirmed: boolean;
  created_at: string | null;
}> {
  return apiFetch(`${AUTH}/2fa/status/`);
}
