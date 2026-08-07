import { apiFetch } from './api';

const A = '/api/analytics';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Achievement {
  id: string;
  key: string;
  name: string;
  description: string;
  category: 'pong' | 'tictactoe' | 'level';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
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
  by_rarity: Record<string, { total: number; unlocked: number }>;
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



// ── Achievement API ───────────────────────────────────────────────────────────

/** GET /api/analytics/achievements/ */
export function getAchievements(filters: { category?: string; rarity?: string } = {}): Promise<Achievement[]> {
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

/** GET /api/analytics/achievements/unlocked/user/<uuid>/ */
export function getUserUnlockedAchievements(userId: string): Promise<AchievementUnlock[]> {
  return apiFetch<AchievementUnlock[]>(`${A}/achievements/unlocked/user/${userId}/`);
}

/** GET /api/analytics/achievements/progress/ */
export function getAchievementProgress(): Promise<AchievementProgress[]> {
  return apiFetch<AchievementProgress[]>(`${A}/achievements/progress/`);
}

/** GET /api/analytics/achievements/stats/ */
export function getAchievementStats(): Promise<AchievementStats> {
  return apiFetch<AchievementStats>(`${A}/achievements/stats/`);
}

/** GET /api/analytics/achievements/stats/user/<uuid>/ */
export function getUserAchievementStats(userId: string): Promise<AchievementStats> {
  return apiFetch<AchievementStats>(`${A}/achievements/stats/user/${userId}/`);
}

// ── XP & Leaderboard API ─────────────────────────────────────────────────────

/** GET /api/analytics/xp/me/ */
export function getMyXP(): Promise<UserXPDetail> {
  return apiFetch<UserXPDetail>(`${A}/xp/me/`);
}

/** GET /api/analytics/xp/user/<uuid>/ */
export function getUserXP(userId: string): Promise<UserXPDetail> {
  return apiFetch<UserXPDetail>(`${A}/xp/user/${userId}/`);
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

/** POST /api/analytics/activity/track/ — track a page view */
export function trackPageView(path: string): Promise<{ detail: string }> {
  return apiFetch(`${A}/activity/track/`, {
    method: 'POST',
    body: { path },
  });
}
