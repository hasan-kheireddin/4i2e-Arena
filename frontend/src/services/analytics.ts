import { apiFetch, getAccessToken } from './api';

const A = '/api/analytics';

function buildQuery(params: Record<string, string | number | undefined>): string {
  const q = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Achievement {
  id: string;
  key: string;
  name: string;
  description: string;
  category: 'wins' | 'games' | 'streaks' | 'skill' | 'social' | 'milestone';
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  icon: string;
  xp_reward: number;
  threshold: number;
  is_hidden: boolean;
  // user-specific fields (from AchievementWithUserStatusSerializer)
  is_unlocked: boolean;
  unlocked_at: string | null;
  progress_current: number;
  progress_percentage: number;
}

export interface AchievementUnlock {
  id: string;
  achievement: Achievement;
  unlocked_at: string;
  game_session_id: string;
}

export interface AchievementProgress {
  id: string;
  achievement: Achievement;
  current: number;
  percentage: number;
  is_complete: boolean;
  updated_at: string;
}

export interface AchievementStats {
  total_achievements: number;
  unlocked_count: number;
  locked_count: number;
  completion_percentage: number;
  total_xp_from_achievements: number;
  by_category: Record<string, { total: number; unlocked: number }>;
  by_tier: Record<string, { total: number; unlocked: number }>;
  recent_unlocks: AchievementUnlock[];
}

export interface LevelInfo {
  level: number;
  current_xp: number;
  xp_for_current_level: number;
  xp_for_next_level: number;
  xp_in_level: number;
  xp_needed: number;
}

/** Entry returned by /api/analytics/leaderboard/ */
export interface AnalyticsLeaderboardEntry {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  xp: number;
  level: number;
  rank: number;
  xp_to_next_level?: LevelInfo;
}

export interface UserXPDetail {
  user_id: string;
  username: string;
  display_name: string;
  xp: number;
  level: number;
  level_info: LevelInfo;
  rank: number;
  total_players: number;
}

export interface PaginatedLeaderboard {
  count: number;
  next: string | null;
  previous: string | null;
  results: AnalyticsLeaderboardEntry[];
}

export interface ActivitySummary {
  user_id: string;
  total_events: number;
  events_today: number;
  events_this_week: number;
  today_count: number;
  week_count: number;
  by_category: Record<string, number>;
  by_type: Record<string, number>;
  top_event_types: Array<{ event_type: string; count: number }>;
  latest_event: { event_type: string; created_at: string } | null;
  latest_event_at: string | null;
  most_active_hour: number | null;
  most_active_day: string | null;
}

export interface ActivityTimelinePoint {
  date: string;
  count: number;
}

export interface ActivityHeatmapCell {
  day: number;
  hour: number;
  count: number;
}

export interface RecentActivityEvent {
  id: string;
  category: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface GlobalActivitySummary {
  total_events: number;
  active_users_24h: number;
  active_users_7d: number;
  active_users_30d: number;
  by_category: Record<string, number>;
  top_event_types: Array<{ event_type: string; count: number }>;
}

export type ExportFormat = 'json' | 'csv';

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

// ── Achievement API ───────────────────────────────────────────────────────────

/** GET /api/analytics/achievements/ */
export function getAchievements(filters: { category?: string; tier?: string } = {}): Promise<Achievement[]> {
  const q = Object.entries(filters)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return apiFetch<Achievement[]>(`${A}/achievements/${q ? `?${q}` : ''}`);
}

/** GET /api/analytics/achievements/unlocked/ */
export function getUnlockedAchievements(): Promise<AchievementUnlock[]> {
  return apiFetch<AchievementUnlock[]>(`${A}/achievements/unlocked/`);
}

/** GET /api/analytics/achievements/progress/ */
export function getAchievementProgress(): Promise<AchievementProgress[]> {
  return apiFetch<AchievementProgress[]>(`${A}/achievements/progress/`);
}

/** GET /api/analytics/achievements/stats/ */
export function getAchievementStats(): Promise<AchievementStats> {
  return apiFetch<AchievementStats>(`${A}/achievements/stats/`);
}

// ── XP & Leaderboard API ─────────────────────────────────────────────────────

/** GET /api/analytics/xp/me/ */
export function getMyXP(): Promise<UserXPDetail> {
  return apiFetch<UserXPDetail>(`${A}/xp/me/`);
}

/** GET /api/analytics/leaderboard/ */
export function getAnalyticsLeaderboard(params: {
  page?: number;
  page_size?: number;
  order_by?: 'xp' | 'level' | 'username';
} = {}): Promise<PaginatedLeaderboard> {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return apiFetch<PaginatedLeaderboard>(`${A}/leaderboard/${q ? `?${q}` : ''}`);
}

// ── Activity API ──────────────────────────────────────────────────────────────

/** GET /api/analytics/activity/summary/ */
export function getActivitySummary(): Promise<ActivitySummary> {
  return apiFetch<ActivitySummary>(`${A}/activity/summary/`);
}

/** GET /api/analytics/activity/timeline/ */
export function getActivityTimeline(params: {
  days?: number;
  category?: string;
} = {}): Promise<ActivityTimelinePoint[]> {
  return apiFetch<ActivityTimelinePoint[]>(`${A}/activity/timeline/${buildQuery(params)}`);
}

/** GET /api/analytics/activity/heatmap/ */
export function getActivityHeatmap(): Promise<ActivityHeatmapCell[]> {
  return apiFetch<ActivityHeatmapCell[]>(`${A}/activity/heatmap/`);
}

/** GET /api/analytics/activity/recent/ */
export function getRecentActivity(params: {
  limit?: number;
  category?: string;
} = {}): Promise<RecentActivityEvent[]> {
  return apiFetch<RecentActivityEvent[]>(`${A}/activity/recent/${buildQuery(params)}`);
}

/** GET /api/analytics/activity/global/ (admin only) */
export function getGlobalActivitySummary(): Promise<GlobalActivitySummary> {
  return apiFetch<GlobalActivitySummary>(`${A}/activity/global/`);
}

/** POST /api/analytics/activity/track/ — track a page view */
export function trackPageView(path: string): Promise<{ detail: string }> {
  return apiFetch(`${A}/activity/track/`, {
    method: 'POST',
    body: { path },
  });
}

// ── Export / Import (file-based, can't use apiFetch) ─────────────────────────

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type LegacyNavigator = Navigator & {
  msSaveOrOpenBlob?: (blob: Blob, defaultName?: string) => boolean;
};

/**
 * Download the user's activity export as a file.
 * Triggers a browser file-save dialog.
 */
export async function exportActivityData(format: ExportFormat = 'json'): Promise<void> {
  const mimeTypes: Record<ExportFormat, string> = {
    json: 'application/json',
    csv: 'text/csv',
  };

  // Use 'export_format' to avoid conflict with DRF's reserved 'format' param
  const res = await fetch(`${A}/activity/export/?export_format=${format}`, {
    method: 'GET',
    headers: authHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Export failed: ${res.status} ${res.statusText}`);
  }

  // Read as text first to ensure proper encoding, then create blob with correct MIME type
  const text = await res.text();
  const blob = new Blob([text], { type: mimeTypes[format] });

  const contentDisposition = res.headers.get('Content-Disposition') ?? '';
  const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
  const filename = filenameMatch ? filenameMatch[1] : `activity_export.${format}`;

  const legacyNavigator = window.navigator as LegacyNavigator;
  if (typeof legacyNavigator.msSaveOrOpenBlob === 'function') {
    legacyNavigator.msSaveOrOpenBlob(blob, filename);
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  if (!('download' in anchor)) {
    window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 100);
    return;
  }

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Upload a previously exported activity file (JSON, CSV).
 * The server will skip events that already exist (idempotent).
 */
export async function importActivityData(file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${A}/activity/import/`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail ?? `Import failed: ${res.status}`);
  }

  return data as ImportResult;
}
