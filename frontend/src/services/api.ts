// Token helpers
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

export interface ApiError {
  /** Top-level detail message (if any) */
  detail?: string;
  /** Per-field validation errors from DRF */
  fieldErrors?: Record<string, string[]>;
  /** HTTP status code */
  status: number;
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
  if (!refresh) return false;

  try {
    const res = await fetch("/api/accounts/token/refresh/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });

    if (!res.ok) {
      clearTokens();
      return false;
    }

    const data = await res.json();
    setTokens(data.access, data.refresh ?? refresh);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

/** Refresh access token (deduplicates concurrent calls). */
async function refreshAccessToken(): Promise<boolean> {
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
  const { method = "GET", body, auth = true } = opts;

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
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Attempt token refresh on 401
  if (res.status === 401 && auth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await fetch(path, {
        method,
        headers: buildHeaders(),
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
