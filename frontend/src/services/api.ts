let accessToken: string | null = null;
let refreshToken: string | null = null;
const SESSION_HINT_KEY = "auth_session_expires_at";

function tokenExpiresAt(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** A non-sensitive hint only; authentication still relies on HttpOnly cookies/JWTs. */
export function hasPotentialSession(): boolean {
  const expiresAt = Number(localStorage.getItem(SESSION_HINT_KEY));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    localStorage.removeItem(SESSION_HINT_KEY);
    return false;
  }
  return true;
}

// Token helpers. JWTs are kept in memory only; the backend also sets Secure
// HttpOnly cookies used across reloads and WebSocket handshakes.
export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export function setTokens(access: string, refresh: string): void {
  accessToken = access;
  refreshToken = refresh;
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  const expiresAt = tokenExpiresAt(refresh);
  if (expiresAt) localStorage.setItem(SESSION_HINT_KEY, String(expiresAt));
}

export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem(SESSION_HINT_KEY);
}

export interface ApiError {
  /** Top-level detail message (if any) */
  detail?: string;
  /** Per-field validation errors from DRF */
  fieldErrors?: Record<string, string[]>;
  /** HTTP status code */
  status: number;
}

/** Return the most useful server message, including DRF field errors. */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const apiError = error as ApiError | undefined;
  if (apiError?.detail) return apiError.detail;

  const firstFieldError = apiError?.fieldErrors
    ? Object.values(apiError.fieldErrors).flat().find(Boolean)
    : undefined;
  return firstFieldError ?? fallback;
}

/**
 * Parse the DRF error response body into a structured ApiError.
 *
 * DRF can return:
 *  - { "detail": "..." }                          → single message
 *  - { "username": ["..."], "email": ["..."] }     → field errors
 *  - { "non_field_errors": ["..."] }               → non-field errors
 */
async function parseError(res: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    return { detail: res.statusText, status: res.status };
  }

  const detail =
    (body.detail as string) ??
    (Array.isArray(body.non_field_errors) ? (body.non_field_errors as string[]).join(" ") : undefined);

  const fieldErrors: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === "detail" || key === "non_field_errors") continue;
    if (Array.isArray(value)) {
      fieldErrors[key] = value as string[];
    }
  }

  return {
    detail,
    fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
    status: res.status,
  };
}

let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const refresh = getRefreshToken();

  try {
    const res = await fetch("/api/accounts/token/refresh/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: refresh ? JSON.stringify({ refresh }) : JSON.stringify({}),
    });

    if (!res.ok) {
      // Only wipe tokens on 401 — a 5xx means the server failed, not that
      // the token itself is invalid. Clearing tokens on 500 would log the
      // user out during a temporary backend hiccup.
      if (res.status === 401) {
        clearTokens();
      }
      return false;
    }

    const data = await res.json();
    setTokens(data.access, data.refresh ?? refresh ?? "");
    return true;
  } catch {
    // Network error — token may still be valid; don't wipe it
    return false;
  }
}

/** Refresh access token (deduplicates concurrent calls). */
export async function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

interface FetchOptions {
  method?: string;
  body?: unknown;
  /** If true, attach the JWT Authorization header. Default true. */
  auth?: boolean;
  /** If true, include cookies across origins. Same-origin cookies are always sent. */
  withCredentials?: boolean;
}

/**
 * Generic API fetch. Accepts full paths like `/api/accounts/login/` or `/api/games/matches/`.
 * Automatically:
 * - Attaches JWT Authorization header (if auth !== false)
 * - Retries once on 401 after refreshing the access token
 * - Throws an ApiError on failure
 */
export async function apiFetch<T = unknown>(
  path: string,
  opts: FetchOptions = {},
): Promise<T> {
  const { method = "GET", body, auth = true, withCredentials = false } = opts;

  const buildHeaders = (): HeadersInit => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (auth) {
      const token = getAccessToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  };

  let res = await fetch(path, {
    method,
    headers: buildHeaders(),
    credentials: withCredentials ? "include" : "same-origin",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Attempt token refresh on 401
  if (res.status === 401 && auth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await fetch(path, {
        method,
        headers: buildHeaders(),
        credentials: withCredentials ? "include" : "same-origin",
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    }
  }

  if (!res.ok) {
    throw await parseError(res);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}
