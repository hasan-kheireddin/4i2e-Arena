import { useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getMyMatches,
  getMyStats,
  type Match,
  type MatchFilters,
  type MatchOrdering,
} from '../services/games';

type GameFilter = 'all' | 'pong' | 'tictactoe';
type ResultFilter = 'all' | 'win' | 'loss' | 'draw';
type ModeFilter = 'all' | '2p' | 'pvp' | 'pva';
type OutcomeBadge = 'win' | 'loss' | 'draw';

const PAGE_SIZE = 20;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function timeAgo(iso: string, t: TFunction): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return t('match_history.time_mins_ago', { mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('match_history.time_hours_ago', { hrs });
  return t('match_history.time_days_ago', { days: Math.floor(hrs / 24) });
}

export default function MatchHistoryPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [gameFilter, setGameFilter] = useState<GameFilter>('all');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [ordering, setOrdering] = useState<MatchOrdering>('-date');
  const [matches, setMatches] = useState<Match[]>([]);
  const [stats, setStats] = useState({ total: 0, wins: 0, losses: 0, draws: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const querySignatureRef = useRef('');

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    getMyStats().then((s) => {
      setStats({
        total: s.overview.total_matches,
        wins: s.overview.wins,
        losses: s.overview.losses,
        draws: s.overview.draws,
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const querySignature = [
      gameFilter,
      resultFilter,
      modeFilter,
      ordering,
      search,
    ].join('|');

    if (querySignatureRef.current !== querySignature && page !== 1) {
      querySignatureRef.current = querySignature;
      setPage(1);
      return;
    }

    querySignatureRef.current = querySignature;

    const filters: MatchFilters = {
      ordering,
      page,
      page_size: PAGE_SIZE,
    };

    if (gameFilter !== 'all') filters.game_type = gameFilter;
    if (resultFilter !== 'all') filters.result = resultFilter;
    if (modeFilter !== 'all') {
      filters.mode = modeFilter === '2p' ? 'local' : modeFilter;
    }
    if (search) filters.search = search;

    let cancelled = false;

    async function loadMatches() {
      setLoading(true);
      try {
        const data = await getMyMatches(filters);
        if (cancelled) return;
        setMatches(data.results);
        setCount(data.count);
      } catch {
        if (cancelled) return;
        setMatches([]);
        setCount(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadMatches();

    return () => {
      cancelled = true;
    };
  }, [gameFilter, resultFilter, modeFilter, ordering, page, search]);

  const getOpponent = (match: Match): string => {
    if (!user) return t('match_history.opponent');

    const opp = match.players.find((p) => p.user_id !== user.id);
    if (opp?.display_name || opp?.username) {
      return opp.display_name || opp.username;
    }

    const metadata = match.metadata as {
      local_players?: { player1_name?: string; player2_name?: string };
    } | undefined;
    const localOpponent = metadata?.local_players?.player2_name?.trim();
    if (localOpponent) {
      return localOpponent;
    }

    return match.ai_difficulty
      ? t('match_history.ai_opponent', { difficulty: match.ai_difficulty })
      : t('match_history.opponent');
  };

  const getLocalPlayerNames = (match: Match): { player1: string; player2: string } | null => {
    const metadata = match.metadata as {
      local_players?: { player1_name?: string; player2_name?: string };
    } | undefined;
    const player1 = metadata?.local_players?.player1_name?.trim();
    const player2 = metadata?.local_players?.player2_name?.trim();
    if (!player1 || !player2) return null;
    return { player1, player2 };
  };

  const getMyOutcome = (match: Match): 'win' | 'loss' | 'draw' => {
    if (!user) return 'loss';
    const me = match.players.find((p) => p.user_id === user.id);
    return me?.outcome || 'loss';
  };

  const getScore = (match: Match): string => {
    const me = match.players.find((p) => p.user_id === user?.id);
    const opp = match.players.find((p) => p.user_id !== user?.id);
    if (!me || !opp) return `${match.player1_score} – ${match.player2_score}`;
    return `${me.score} – ${opp.score}`;
  };

  const getMatchMode = (match: Match): Exclude<ModeFilter, 'all'> => {
    const mode = (match.game_mode ?? '').toLowerCase();
    const isLocal = match.game_session_id.startsWith('local-');
    const isPva = mode === 'pva' || mode === 'pve' || !!match.ai_difficulty;

    if (isPva) return 'pva';
    if (isLocal) return '2p';
    return 'pvp';
  };

  const totalPages = count > 0 ? Math.ceil(count / PAGE_SIZE) : 0;
  const showPagination = totalPages > 1;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {t('match_history.title')}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          {t('match_history.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: t('match_history.stat_total'), value: stats.total, color: 'var(--color-text-primary)' },
          { label: t('match_history.stat_wins'), value: stats.wins, color: 'var(--color-success)' },
          { label: t('match_history.stat_losses'), value: stats.losses, color: 'var(--color-error)' },
          { label: t('match_history.stat_draws'), value: stats.draws, color: '#fbbf24' },
        ].map((s) => (
          <div
            key={s.label}
            className="text-center py-3 rounded-lg"
            style={{
              backgroundColor: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
            }}
          >
            <p className="text-xl font-mono font-bold" style={{ color: s.color }}>
              {s.value}
            </p>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div
            className="flex gap-1 rounded-xl p-1"
            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
          >
            {(['all', 'pong', 'tictactoe'] as GameFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setGameFilter(f)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize"
                style={{
                  backgroundColor: gameFilter === f ? 'var(--color-primary)' : 'transparent',
                  color: gameFilter === f ? '#ffffff' : 'var(--color-text-secondary)',
                }}
              >
                {f === 'tictactoe'
                  ? t('match_history.filter_tictactoe')
                  : f === 'all'
                    ? t('match_history.filter_all_games')
                    : t('match_history.filter_pong')}
              </button>
            ))}
          </div>

          <div
            className="flex gap-1 rounded-xl p-1"
            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
          >
            {(['all', 'win', 'loss', 'draw'] as ResultFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setResultFilter(f)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize"
                style={{
                  backgroundColor: resultFilter === f ? 'var(--color-primary)' : 'transparent',
                  color: resultFilter === f ? '#ffffff' : 'var(--color-text-secondary)',
                }}
              >
                {f === 'all'
                  ? t('match_history.filter_all')
                  : f === 'win'
                    ? t('match_history.filter_win')
                    : f === 'loss'
                      ? t('match_history.filter_loss')
                      : t('match_history.filter_draw')}
              </button>
            ))}
          </div>

          <div
            className="flex gap-1 rounded-xl p-1"
            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
          >
            {(['all', '2p', 'pvp', 'pva'] as ModeFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setModeFilter(f)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all uppercase"
                style={{
                  backgroundColor: modeFilter === f ? 'var(--color-primary)' : 'transparent',
                  color: modeFilter === f ? '#ffffff' : 'var(--color-text-secondary)',
                }}
              >
                {f === 'all'
                  ? t('match_history.filter_all_modes')
                  : f === '2p'
                    ? t('match_history.filter_2p')
                    : f === 'pvp'
                      ? t('match_history.filter_pvp')
                      : t('match_history.filter_pva')}
              </button>
            ))}
          </div>

          <div
            className="rounded-lg px-3"
            style={{ backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border)' }}
          >
            <select
              value={ordering}
              onChange={(e) => setOrdering(e.target.value as MatchOrdering)}
              className="h-full min-h-[42px] bg-transparent text-sm outline-none"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <option value="-date">{t('match_history.sort_newest')}</option>
              <option value="date">{t('match_history.sort_oldest')}</option>
              <option value="-score">{t('match_history.sort_score_high')}</option>
              <option value="score">{t('match_history.sort_score_low')}</option>
            </select>
          </div>
        </div>

        <div className="flex-1 relative">
          <Search
            className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: 'var(--color-text-muted)', insetInlineStart: '0.75rem' }}
          />
          <input
            placeholder={t('match_history.search_placeholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-lg px-4 py-2 text-sm outline-none transition-all"
            style={{
              backgroundColor: 'var(--color-bg-input)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              paddingInlineStart: '2.5rem',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-primary)';
              e.currentTarget.style.boxShadow = '0 0 0 2px rgba(168, 85, 247, 0.2)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {loading && matches.length === 0 ? (
          <div className="text-center py-12">
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {t('match_history.loading')}
            </p>
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center py-12">
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {t('match_history.no_matches')}
            </p>
          </div>
        ) : (
          matches.map((match) => {
            const outcome = getMyOutcome(match);
            const opponent = getOpponent(match);
            const score = getScore(match);
            const mode = getMatchMode(match);
            const localNames = mode === '2p' ? getLocalPlayerNames(match) : null;
            const winnerName = localNames
              ? match.player1_score === match.player2_score
                ? null
                : match.player1_score > match.player2_score
                  ? localNames.player1
                  : localNames.player2
              : null;
            const outcomeBadge: OutcomeBadge = localNames ? (winnerName ? 'win' : 'draw') : outcome;
            const title = localNames ? `${localNames.player1} vs ${localNames.player2}` : `vs ${opponent}`;
            const outcomeLabel = localNames
              ? winnerName
                ? t('match_history.local_winner_text', { name: winnerName })
                : t('match_history.outcome_draw')
              : t(`match_history.outcome_${outcome}`);

            return (
              <div
                key={match.id}
                className="p-4 rounded-lg transition-all duration-200"
                style={{
                  backgroundColor: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-card)';
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-base"
                    style={{
                      backgroundColor: match.game_type === 'pong' ? 'rgba(168,85,247,0.12)' : 'rgba(6,182,212,0.12)',
                      border: `1px solid ${match.game_type === 'pong' ? 'rgba(168,85,247,0.3)' : 'rgba(6,182,212,0.3)'}`,
                    }}
                  >
                    {match.game_type === 'pong' ? '🏓' : '⭕'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {title}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-md text-xs font-semibold"
                        style={{
                          backgroundColor: outcomeBadge === 'win'
                            ? 'rgba(34,197,94,0.15)'
                            : outcomeBadge === 'loss'
                              ? 'rgba(239,68,68,0.15)'
                              : 'rgba(251,191,36,0.15)',
                          color: outcomeBadge === 'win'
                            ? 'var(--color-success)'
                            : outcomeBadge === 'loss'
                              ? 'var(--color-error)'
                              : '#fbbf24',
                        }}
                      >
                        {outcomeLabel}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-md text-xs font-medium capitalize"
                        style={{ backgroundColor: 'rgba(168,85,247,0.1)', color: 'var(--color-primary)' }}
                      >
                        {t(`match_history.mode_${mode}`)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      <span>
                        {match.game_type === 'tictactoe'
                          ? t('match_history.game_tictactoe')
                          : t('match_history.game_pong')}
                      </span>
                      {match.game_type !== 'tictactoe' && (
                        <span>{t('match_history.score_label', { score })}</span>
                      )}
                      <span>{formatDuration(match.duration_seconds)}</span>
                    </div>
                  </div>

                  <div className="shrink-0" style={{ textAlign: 'end' }}>
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      {timeAgo(match.finished_at, t)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {showPagination && (
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1 || loading}
              className="px-4 py-2 rounded-lg text-sm transition-all disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {t('match_history.pagination_previous')}
            </button>

            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t('match_history.pagination_page', { page, total: totalPages })}
            </p>

            <button
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages || loading}
              className="px-4 py-2 rounded-lg text-sm transition-all disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {t('match_history.pagination_next')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
