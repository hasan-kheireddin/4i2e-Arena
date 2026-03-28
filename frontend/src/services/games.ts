import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './api';

const GAMES_BASE = '/api/games';

async function gamesApiFetch<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { method = 'GET', body } = opts;

  const buildHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getAccessToken();
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  let res = await fetch(`${GAMES_BASE}${path}`, {
    method,
    headers: buildHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    const refresh = getRefreshToken();
    if (refresh) {
      const rRes = await fetch('/api/accounts/token/refresh/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });
      if (rRes.ok) {
        const data = await rRes.json();
        setTokens(data.access, data.refresh ?? refresh);
        res = await fetch(`${GAMES_BASE}${path}`, {
          method,
          headers: buildHeaders(),
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } else {
        clearTokens();
      }
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.detail || 'Request failed'), { status: res.status, data: err });
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

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
  game_mode: 'pvp' | 'pve';
  finish_reason: string;
  winner_id: string | null;
  winner_username: string | null;
  player1_score: number;
  player2_score: number;
  started_at: string;
  finished_at: string;
  duration_seconds: number;
  ai_difficulty: string;
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

export interface MatchFilters {
  game_type?: 'pong' | 'tictactoe';
  game_mode?: 'pvp' | 'pve';
  outcome?: 'win' | 'loss' | 'draw';
  page?: number;
  page_size?: number;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

export function getMyMatches(filters: MatchFilters = {}): Promise<PaginatedMatches> {
  return gamesApiFetch<PaginatedMatches>(`/matches/me/${buildQuery(filters as Record<string, string | number | undefined>)}`);
}

export function getMatch(id: string): Promise<Match> {
  return gamesApiFetch<Match>(`/matches/${id}/`);
}

export function getMyStats(game_type?: string): Promise<UserStats> {
  return gamesApiFetch<UserStats>(`/stats/me/${game_type ? `?game_type=${game_type}` : ''}`);
}

export function getUserStats(userId: string, game_type?: string): Promise<UserStats> {
  return gamesApiFetch<UserStats>(`/stats/user/${userId}/${game_type ? `?game_type=${game_type}` : ''}`);
}

export function getLeaderboard(params: { game_type?: string; metric?: string; limit?: number } = {}): Promise<LeaderboardEntry[]> {
  return gamesApiFetch<LeaderboardEntry[]>(`/stats/leaderboard/${buildQuery(params as Record<string, string | number | undefined>)}`);
}

export function getMatchSummary(): Promise<Record<string, unknown>> {
  return gamesApiFetch<Record<string, unknown>>('/matches/summary/');
}
