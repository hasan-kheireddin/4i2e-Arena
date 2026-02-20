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
  is_online: boolean;
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

export interface TwoFARequired {
  requires_2fa: true;
  temp_token: string;
  user_id: string;
}

export type LoginResponse = AuthResponse | TwoFARequired;

export function isTwoFARequired(res: LoginResponse): res is TwoFARequired {
  return "requires_2fa" in res && res.requires_2fa === true;
}

export interface TwoFASetupResponse {
  secret: string;
  otpauth_uri: string;
  qr_code: string;           // base64 data URI
  recovery_codes: string[];
}

export interface RecoveryLoginResponse extends AuthResponse {
  remaining_recovery_codes: number;
}

// Re-export for convenience
export type { ApiError };

/** POST /api/accounts/register/ */
export async function register(data: {
  username: string;
  email: string;
  password: string;
  password2: string;
  display_name?: string;
}): Promise<AuthResponse> {
  const res = await apiFetch<AuthResponse>("/register/", {
    method: "POST",
    body: data,
    auth: false,
  });
  setTokens(res.tokens.access, res.tokens.refresh);
  return res;
}

/** POST /api/accounts/login/ */
export async function login(data: {
  username: string;
  password: string;
}): Promise<LoginResponse> {
  const res = await apiFetch<LoginResponse>("/login/", {
    method: "POST",
    body: data,
    auth: false,
  });
  if (!isTwoFARequired(res)) {
    setTokens(res.tokens.access, res.tokens.refresh);
  }
  return res;
}

/** POST /api/accounts/logout/ */
export async function logout(): Promise<void> {
  const refresh = getRefreshToken();
  try {
    await apiFetch("/logout/", {
      method: "POST",
      body: { refresh },
    });
  } catch {
    // Even if the server call fails, clear local tokens
  }
  clearTokens();
}

/** GET /api/accounts/me/ — fetch current user profile */
export async function getProfile(): Promise<User> {
  return apiFetch<User>("/me/");
}

/** PATCH /api/accounts/me/update/ */
export async function updateProfile(data: {
  display_name?: string;
  avatar_url?: string;
  preferred_language?: string;
}): Promise<User> {
  return apiFetch<User>("/me/update/", {
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
  return apiFetch("/me/change-password/", {
    method: "POST",
    body: data,
  });
}

/** POST /api/accounts/token/refresh/ */
export async function refreshToken(refresh: string): Promise<Tokens> {
  return apiFetch<Tokens>("/token/refresh/", {
    method: "POST",
    body: { refresh },
    auth: false,
  });
}


/** GET /api/accounts/oauth/<provider>/initiate/ */
export async function oauthInitiate(
  provider: string,
): Promise<{ authorize_url: string }> {
  return apiFetch(`/oauth/${provider}/initiate/`, { auth: false });
}

/** POST /api/accounts/oauth/<provider>/callback/ */
export async function oauthCallback(
  provider: string,
  data: { code: string; state: string },
): Promise<AuthResponse> {
  const res = await apiFetch<AuthResponse>(`/oauth/${provider}/callback/`, {
    method: "POST",
    body: data,
    auth: false,
  });
  setTokens(res.tokens.access, res.tokens.refresh);
  return res;
}

/** POST /api/accounts/2fa/setup/ — (authenticated) */
export async function twoFASetup(): Promise<TwoFASetupResponse> {
  return apiFetch("/2fa/setup/", { method: "POST" });
}

/** POST /api/accounts/2fa/confirm/ — (authenticated) */
export async function twoFAConfirm(code: string): Promise<{ detail: string }> {
  return apiFetch("/2fa/confirm/", {
    method: "POST",
    body: { code },
  });
}

/** POST /api/accounts/2fa/verify/ — (public, temp_token) */
export async function twoFAVerify(data: {
  temp_token: string;
  code: string;
}): Promise<AuthResponse> {
  const res = await apiFetch<AuthResponse>("/2fa/verify/", {
    method: "POST",
    body: data,
    auth: false,
  });
  setTokens(res.tokens.access, res.tokens.refresh);
  return res;
}

/** POST /api/accounts/2fa/disable/ — (authenticated) */
export async function twoFADisable(code: string): Promise<{ detail: string }> {
  return apiFetch("/2fa/disable/", {
    method: "POST",
    body: { code },
  });
}

/** POST /api/accounts/2fa/recovery/ — (public, temp_token) */
export async function twoFARecovery(data: {
  temp_token: string;
  code: string;
}): Promise<RecoveryLoginResponse> {
  const res = await apiFetch<RecoveryLoginResponse>("/2fa/recovery/", {
    method: "POST",
    body: data,
    auth: false,
  });
  setTokens(res.tokens.access, res.tokens.refresh);
  return res;
}

/** GET /api/accounts/2fa/status/ — (authenticated) */
export async function twoFAStatus(): Promise<{
  is_2fa_enabled: boolean;
  confirmed: boolean;
  remaining_recovery_codes: number;
  created_at: string | null;
}> {
  return apiFetch("/2fa/status/");
}
