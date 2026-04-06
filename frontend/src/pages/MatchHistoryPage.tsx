import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { getMyMatches, getMyStats, type Match, type MatchFilters } from '../services/games';

type GameFilter = 'all' | 'pong' | 'tictactoe';
type ResultFilter = 'all' | 'win' | 'loss' | 'draw';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function timeAgo(iso: string, t: (key: string, opts?: object) => string): string {
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
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [stats, setStats] = useState({ total: 0, wins: 0, losses: 0, draws: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchMatches = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const filters: MatchFilters = { page_size: 20, page: reset ? 1 : page };
      if (gameFilter !== 'all') filters.game_type = gameFilter;
      if (resultFilter !== 'all') filters.outcome = resultFilter;
      const data = await getMyMatches(filters);
      setMatches(reset ? data.results : (prev) => [...prev, ...data.results]);
      setHasMore(!!data.next);
      if (reset) setPage(1);
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false);
    }
  }, [gameFilter, resultFilter, page]);

  useEffect(() => {
    fetchMatches(true);
  }, [gameFilter, resultFilter]);

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

  const getOpponent = (match: Match): string => {
    if (!user) return t('match_history.opponent');
    const opp = match.players.find((p) => p.user_id !== user.id);
    return opp?.display_name || opp?.username || (match.ai_difficulty ? t('match_history.ai_opponent', { difficulty: match.ai_difficulty }) : t('match_history.opponent'));
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

  const filtered = matches.filter((m) => {
    const opp = getOpponent(m);
    return !search || opp.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{t('match_history.title')}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{t('match_history.subtitle')}</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: t('match_history.stat_total'), value: stats.total, color: 'var(--color-text-primary)' },
          { label: t('match_history.stat_wins'), value: stats.wins, color: 'var(--color-success)' },
          { label: t('match_history.stat_losses'), value: stats.losses, color: 'var(--color-error)' },
          { label: t('match_history.stat_draws'), value: stats.draws, color: '#fbbf24' },
        ].map((s) => (
          <div key={s.label} className="text-center py-3 rounded-lg" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <p className="text-xl font-mono font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          {(['all', 'pong', 'tictactoe'] as GameFilter[]).map((f) => (
            <button key={f} onClick={() => setGameFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize"
              style={{ backgroundColor: gameFilter === f ? 'var(--color-primary)' : 'transparent', color: gameFilter === f ? '#ffffff' : 'var(--color-text-secondary)' }}>
              {f === 'tictactoe' ? t('match_history.filter_tictactoe') : f === 'all' ? t('match_history.filter_all_games') : t('match_history.filter_pong')}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          {(['all', 'win', 'loss', 'draw'] as ResultFilter[]).map((f) => (
            <button key={f} onClick={() => setResultFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize"
              style={{ backgroundColor: resultFilter === f ? 'var(--color-primary)' : 'transparent', color: resultFilter === f ? '#ffffff' : 'var(--color-text-secondary)' }}>
              {f === 'all' ? t('match_history.filter_all') : f === 'win' ? t('match_history.filter_win') : f === 'loss' ? t('match_history.filter_loss') : t('match_history.filter_draw')}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <input placeholder={t('match_history.search_placeholder')} value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg px-4 py-2 text-sm outline-none transition-all"
            style={{ backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(168, 85, 247, 0.2)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none'; }} />
        </div>
      </div>

      {/* Match List */}
      <div className="space-y-2">
        {loading && matches.length === 0 ? (
          <div className="text-center py-12"><p style={{ color: 'var(--color-text-secondary)' }}>{t('match_history.loading')}</p></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12"><p style={{ color: 'var(--color-text-secondary)' }}>{t('match_history.no_matches')}</p></div>
        ) : (
          filtered.map((match) => {
            const outcome = getMyOutcome(match);
            const opponent = getOpponent(match);
            const score = getScore(match);
            return (
              <div key={match.id} className="p-4 rounded-lg transition-all duration-200"
                style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)'; e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'; e.currentTarget.style.borderColor = 'var(--color-border)'; }}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold"
                    style={{ backgroundColor: outcome === 'win' ? 'rgba(34,197,94,0.1)' : outcome === 'loss' ? 'rgba(239,68,68,0.1)' : 'rgba(251,191,36,0.1)', color: outcome === 'win' ? 'var(--color-success)' : outcome === 'loss' ? 'var(--color-error)' : '#fbbf24' }}>
                    {match.game_type === 'pong' ? 'P' : 'T'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>vs {opponent}</span>
                      <span className="px-2 py-0.5 rounded-md text-xs font-semibold"
                        style={{ backgroundColor: outcome === 'win' ? 'rgba(34,197,94,0.15)' : outcome === 'loss' ? 'rgba(239,68,68,0.15)' : 'rgba(251,191,36,0.15)', color: outcome === 'win' ? 'var(--color-success)' : outcome === 'loss' ? 'var(--color-error)' : '#fbbf24' }}>
                        {t(`match_history.outcome_${outcome}`)}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-xs font-medium capitalize" style={{ backgroundColor: 'rgba(168,85,247,0.1)', color: 'var(--color-primary)' }}>
                        {match.game_mode}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      <span>{match.game_type === 'tictactoe' ? t('match_history.game_tictactoe') : t('match_history.game_pong')}</span>
                      <span>{t('match_history.score_label', { score })}</span>
                      <span>{formatDuration(match.duration_seconds)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{timeAgo(match.finished_at, t)}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        {hasMore && (
          <button onClick={() => { setPage((p) => p + 1); fetchMatches(); }}
            className="w-full py-2 rounded-lg text-sm transition-all"
            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
            {loading ? t('match_history.loading_more') : t('match_history.load_more')}
          </button>
        )}
      </div>
    </div>
  );
}
