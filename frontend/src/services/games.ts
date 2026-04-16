import { apiFetch } from './api';

const G = '/api/games';

function buildQuery(params: Record<string, string | number | undefined>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface MatchPlayer {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  slot: number;
  outcome: 'win' | 'loss' | 'draw';
  score: number;
  xp_earned: number;
}

export interface Match {
  id: string;
  game_session_id: string;
  game_type: 'pong' | 'tictactoe';
  game_mode: 'pvp' | 'pve' | 'pva';
  finish_reason: string;
  winner_id: string | null;
  winner_username: string | null;
  player1_score: number;
  player2_score: number;
  started_at: string;
  finished_at: string;
  duration_seconds: number;
  ai_difficulty: string | null;
  metadata?: Record<string, unknown>;
  players: MatchPlayer[];
}

export interface PaginatedMatches {
  count: number;
  next: string | null;
  previous: string | null;
  results: Match[];
}

export interface UserStats {
  user_id: string;
  overview: {
    total_matches: number;
    wins: number;
    losses: number;
    draws: number;
    win_rate: number;
    total_xp: number;
    total_score: number;
    avg_score: number;
    max_score: number;
    avg_duration: number;
    min_duration: number;
    max_duration: number;
  };
  streaks: {
    current: { type: string; count: number };
    longest_win: number;
    longest_loss: number;
  };
  by_game_type: Record<string, {
    total: number;
    wins: number;
    losses: number;
    draws: number;
    win_rate: number;
    avg_score: number;
    avg_duration: number;
  }>;
  by_game_mode: Record<string, {
    total: number;
    wins: number;
    losses: number;
    draws: number;
    win_rate: number;
  }>;
  performance_trend: Array<{
    date: string;
    matches: number;
    wins: number;
    losses: number;
    draws: number;
    avg_score: number;
  }>;
  game_specific: Record<string, unknown>;
  recent_form: string[];
}

/** Entry returned by /api/games/stats/leaderboard/ */
export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  display_name: string;
  total_matches: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
  total_xp: number;
  avg_score: number;
}

export type LeaderboardPeriod = 'all' | 'daily' | 'weekly' | 'monthly';

export interface MatchFilters {
  game_type?: 'pong' | 'tictactoe';
  game_mode?: 'pvp' | 'pve' | 'pva';
  outcome?: 'win' | 'loss' | 'draw';
  page?: number;
  page_size?: number;
}

// ── API calls ─────────────────────────────────────────────────────────────────

/** GET /api/games/matches/me/ */
export function getMyMatches(filters: MatchFilters = {}): Promise<PaginatedMatches> {
  return apiFetch<PaginatedMatches>(
    `${G}/matches/me/${buildQuery(filters as Record<string, string | number | undefined>)}`
  );
}

/** GET /api/games/matches/<id>/ */
export function getMatch(id: string): Promise<Match> {
  return apiFetch<Match>(`${G}/matches/${id}/`);
}

/** GET /api/games/matches/user/<uuid>/ */
export function getUserMatches(userId: string, filters: { game_type?: string; page?: number; page_size?: number } = {}): Promise<PaginatedMatches> {
  return apiFetch<PaginatedMatches>(`${G}/matches/user/${userId}/${buildQuery(filters as Record<string, string | number | undefined>)}`);
}

/** GET /api/games/stats/me/ */
export function getMyStats(game_type?: string): Promise<UserStats> {
  return apiFetch<UserStats>(`${G}/stats/me/${game_type ? `?game_type=${game_type}` : ''}`);
}

/** GET /api/games/stats/user/<uuid>/ */
export function getUserStats(userId: string, game_type?: string): Promise<UserStats> {
  return apiFetch<UserStats>(`${G}/stats/user/${userId}/${game_type ? `?game_type=${game_type}` : ''}`);
}

/** GET /api/games/stats/head-to-head/<uuid>/ */
export function getHeadToHead(opponentId: string): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>(`${G}/stats/head-to-head/${opponentId}/`);
}

/** GET /api/games/stats/leaderboard/ */
export function getLeaderboard(
  params: { game_type?: string; metric?: 'wins'; period?: LeaderboardPeriod; limit?: number } = {}
): Promise<LeaderboardEntry[]> {
  return apiFetch<LeaderboardEntry[]>(
    `${G}/stats/leaderboard/${buildQuery(params as Record<string, string | number | undefined>)}`
  );
}

/** GET /api/games/matches/summary/ */
export function getMatchSummary(): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>(`${G}/matches/summary/`);
}

/** POST /api/games/matches/create/ - Create local match record */
export async function createLocalMatch(data: {
  game_type: 'pong' | 'tictactoe';
  game_mode: 'pvp' | 'pve';
  winner: string | null;
  duration_seconds: number;
  player1_score: number;
  player2_score: number;
  ai_difficulty?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ match_id: string; status: string }> {
  return apiFetch<{ match_id: string; status: string }>(`${G}/matches/create/`, {
    method: 'POST',
    body: data,  // apiFetch will stringify it
  });
}
