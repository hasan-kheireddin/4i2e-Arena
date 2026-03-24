import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './api';

const TOURN_BASE = '/api/tournaments';

async function tournApiFetch<T = unknown>(
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

  let res = await fetch(`${TOURN_BASE}${path}`, {
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
        res = await fetch(`${TOURN_BASE}${path}`, {
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

export interface Tournament {
  id: string;
  name: string;
  game_type: 'pong' | 'tictactoe';
  status: 'registration' | 'in_progress' | 'completed' | 'canceled';
  max_participants: number;
  participants_count: number;
  description: string;
  start_time: string | null;
  created_by: string;
  prize_description?: string;
  format?: string;
}

export interface TournamentStats {
  tournaments_won: number;
  tournaments_participated: number;
  best_placement: number | null;
  total_winnings_xp: number;
}

export interface BracketMatch {
  id: string;
  player1_username: string | null;
  player2_username: string | null;
  player1_score: number;
  player2_score: number;
  winner_username: string | null;
  round_number: number;
  status: string;
}

export interface Bracket {
  tournament_id: string;
  rounds: Array<{
    round_number: number;
    name: string;
    matches: BracketMatch[];
  }>;
}

export function getTournaments(status?: string): Promise<Tournament[]> {
  return tournApiFetch<Tournament[]>(`/${status ? `?status=${status}` : ''}`);
}

export function getMyTournaments(): Promise<Tournament[]> {
  return tournApiFetch<Tournament[]>('/me/');
}

export function getMyTournamentStats(): Promise<TournamentStats> {
  return tournApiFetch<TournamentStats>('/stats/me/');
}

export function getTournament(id: string): Promise<Tournament> {
  return tournApiFetch<Tournament>(`/${id}/`);
}

export function joinTournament(id: string): Promise<void> {
  return tournApiFetch<void>(`/${id}/join/`, { method: 'POST' });
}

export function leaveTournament(id: string): Promise<void> {
  return tournApiFetch<void>(`/${id}/leave/`, { method: 'POST' });
}

export function getTournamentBracket(id: string): Promise<Bracket> {
  return tournApiFetch<Bracket>(`/${id}/bracket/`);
}

export function createTournament(data: {
  name: string;
  game_type: string;
  max_participants: number;
  description?: string;
}): Promise<Tournament> {
  return tournApiFetch<Tournament>('/', { method: 'POST', body: data });
}
