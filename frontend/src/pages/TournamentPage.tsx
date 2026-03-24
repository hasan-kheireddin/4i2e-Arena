import { useState, useEffect, useCallback } from 'react';
import { cn } from '../lib/utils';
import {
  getTournaments,
  getMyTournamentStats,
  joinTournament,
  getTournamentBracket,
  createTournament,
  type Tournament,
  type TournamentStats,
  type Bracket,
} from '../services/tournaments';

type Tab = 'active' | 'upcoming' | 'completed';

function apiStatusToTab(status: Tournament['status']): Tab {
  if (status === 'in_progress') return 'active';
  if (status === 'registration') return 'upcoming';
  return 'completed';
}

function formatStartTime(iso: string | null): string {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs < 0) return 'Started';
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 24) return `In ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `In ${diffD}d`;
}

function gameLabel(gt: Tournament['game_type']): string {
  return gt === 'pong' ? 'Pong' : 'Tic-Tac-Toe';
}

function StatusBadge({ status }: { status: Tournament['status'] }) {
  const cfg = {
    in_progress: { label: 'Live', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
    registration: { label: 'Open', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
    completed: { label: 'Ended', color: 'var(--color-text-muted)', bg: 'rgba(148,163,184,0.1)' },
    canceled: { label: 'Canceled', color: 'var(--color-error)', bg: 'rgba(239,68,68,0.1)' },
  }[status];
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-semibold"
      style={{ color: cfg.color, backgroundColor: cfg.bg }}
    >
      {cfg.label}
    </span>
  );
}

export default function TournamentPage() {
  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [stats, setStats] = useState<TournamentStats | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [bracketTournamentId, setBracketTournamentId] = useState<string | null>(null);
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [loadingBracket, setLoadingBracket] = useState(false);
  const [bracketError, setBracketError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createGameType, setCreateGameType] = useState<'pong' | 'tictactoe'>('pong');
  const [createMax, setCreateMax] = useState(8);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([getTournaments(), getMyTournamentStats()]);
      setTournaments(t);
      setStats(s);
    } catch {
      // ignore
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = tournaments.filter(
    (t) => apiStatusToTab(t.status) === tab && t.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleJoin = async (id: string) => {
    setJoiningId(id);
    setJoinError(null);
    try {
      await joinTournament(id);
      await fetchData();
    } catch (e: unknown) {
      const msg = (e as { data?: { detail?: string } })?.data?.detail ?? 'Failed to join tournament';
      setJoinError(msg);
    } finally {
      setJoiningId(null);
    }
  };

  const handleViewBracket = async (id: string) => {
    setBracketTournamentId(id);
    setBracket(null);
    setBracketError(null);
    setLoadingBracket(true);
    try {
      const b = await getTournamentBracket(id);
      setBracket(b);
    } catch {
      setBracketError('Failed to load bracket');
    } finally {
      setLoadingBracket(false);
    }
  };

  const handleCreate = async () => {
    if (!createName.trim()) { setCreateError('Name is required'); return; }
    setCreating(true);
    setCreateError(null);
    try {
      await createTournament({ name: createName.trim(), game_type: createGameType, max_participants: createMax });
      setShowCreate(false);
      setCreateName('');
      setCreateGameType('pong');
      setCreateMax(8);
      await fetchData();
    } catch (e: unknown) {
      const msg = (e as { data?: { detail?: string } })?.data?.detail ?? 'Failed to create tournament';
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Tournaments</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Compete in organized brackets for glory and XP
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-6 py-2 rounded-lg font-medium text-white flex items-center gap-2 transition-all duration-200"
          style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
          🏆 Create Tournament
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon="🏆" label="Tournaments Won" value={stats ? String(stats.tournaments_won) : '—'} />
        <StatCard icon="🎯" label="Participated" value={stats ? String(stats.tournaments_participated) : '—'} />
        <StatCard icon="🥇" label="Best Placement" value={stats?.best_placement != null ? `#${stats.best_placement}` : '—'} />
        <StatCard icon="👑" label="Total Winnings" value={stats ? `${stats.total_winnings_xp.toLocaleString()} XP` : '—'} />
      </div>

      {/* Join error banner */}
      {joinError && (
        <div
          className="flex items-center justify-between px-4 py-3 rounded-lg text-sm"
          style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--color-error)' }}
        >
          <span>{joinError}</span>
          <button onClick={() => setJoinError(null)} className="ml-4 font-bold">✕</button>
        </div>
      )}

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex rounded-lg p-1 gap-1" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          {(['active', 'upcoming', 'completed'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn('px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150 capitalize')}
              style={{
                backgroundColor: tab === t ? 'rgba(168,85,247,0.2)' : 'transparent',
                color: tab === t ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tournaments..."
          className="flex-1 px-4 py-2 rounded-lg text-sm outline-none"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        />
      </div>

      {/* Tournament Cards */}
      {loadingData ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-48 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--color-text-muted)' }}>
          <span className="text-4xl mb-3">🏆</span>
          <p className="text-sm">No {tab} tournaments{search ? ' matching your search' : ''}.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="p-5 rounded-xl space-y-4 transition-all duration-200"
              style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{t.name}</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                    {gameLabel(t.game_type)} • {t.format ?? 'Open'}
                  </p>
                </div>
                <StatusBadge status={t.status} />
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                <div>
                  <p style={{ color: 'var(--color-text-muted)' }}>Players</p>
                  <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {t.participants_count}/{t.max_participants}
                  </p>
                </div>
                <div>
                  <p style={{ color: 'var(--color-text-muted)' }}>Prize</p>
                  <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{t.prize_description ?? '—'}</p>
                </div>
                <div>
                  <p style={{ color: 'var(--color-text-muted)' }}>Starts</p>
                  <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{formatStartTime(t.start_time)}</p>
                </div>
              </div>

              {/* Player bar */}
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-bg-input)' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${(t.participants_count / t.max_participants) * 100}%`,
                    background: 'linear-gradient(90deg, #a855f7 0%, #ec4899 100%)',
                  }}
                />
              </div>

              <div className="flex gap-2">
                {t.status === 'registration' && (
                  <button
                    onClick={() => handleJoin(t.id)}
                    disabled={joiningId === t.id}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all duration-200"
                    style={{
                      background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
                      opacity: joiningId === t.id ? 0.6 : 1,
                    }}
                  >
                    {joiningId === t.id ? 'Joining…' : 'Register'}
                  </button>
                )}
                {(t.status === 'in_progress' || t.status === 'completed') && (
                  <button
                    onClick={() => handleViewBracket(t.id)}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                    style={{
                      backgroundColor: 'var(--color-bg-input)',
                      color: 'var(--color-text-primary)',
                      border: '1px solid var(--color-border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'}
                  >
                    {t.status === 'completed' ? 'View Results' : 'View Bracket'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bracket Panel */}
      {bracketTournamentId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        >
          <div
            className="w-full max-w-3xl max-h-[80vh] overflow-y-auto rounded-2xl p-6 space-y-4"
            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Tournament Bracket</h2>
              <button
                onClick={() => { setBracketTournamentId(null); setBracket(null); }}
                style={{ color: 'var(--color-text-muted)' }}
                className="text-xl font-bold hover:opacity-70 transition-opacity"
              >
                ✕
              </button>
            </div>

            {loadingBracket && (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 rounded-full border-4 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
              </div>
            )}
            {bracketError && <p className="text-sm text-center py-8" style={{ color: 'var(--color-error)' }}>{bracketError}</p>}
            {bracket && bracket.rounds.map((round) => (
              <div key={round.round_number}>
                <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>{round.name}</h3>
                <div className="space-y-2">
                  {round.matches.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 p-3 rounded-lg text-sm"
                      style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                    >
                      <span
                        className="flex-1 truncate font-medium"
                        style={{ color: m.winner_username === m.player1_username ? 'var(--color-success)' : 'var(--color-text-primary)' }}
                      >
                        {m.player1_username ?? 'TBD'}
                      </span>
                      <span className="font-mono font-bold text-xs px-2" style={{ color: 'var(--color-text-muted)' }}>
                        {m.player1_score} – {m.player2_score}
                      </span>
                      <span
                        className="flex-1 truncate font-medium text-right"
                        style={{ color: m.winner_username === m.player2_username ? 'var(--color-success)' : 'var(--color-text-primary)' }}
                      >
                        {m.player2_username ?? 'TBD'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Tournament Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-4"
            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Create Tournament</h2>
              <button onClick={() => setShowCreate(false)} style={{ color: 'var(--color-text-muted)' }} className="text-xl font-bold hover:opacity-70">✕</button>
            </div>

            {createError && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--color-error)' }}>
                {createError}
              </p>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--color-text-secondary)' }}>Name</label>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Tournament name"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--color-text-secondary)' }}>Game</label>
                <select
                  value={createGameType}
                  onChange={(e) => setCreateGameType(e.target.value as 'pong' | 'tictactoe')}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                >
                  <option value="pong">Pong</option>
                  <option value="tictactoe">Tic-Tac-Toe</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--color-text-secondary)' }}>Max Players</label>
                <select
                  value={createMax}
                  onChange={(e) => setCreateMax(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                >
                  {[4, 8, 16, 32].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all duration-200"
                style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)', opacity: creating ? 0.6 : 1 }}
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                style={{ backgroundColor: 'var(--color-bg-input)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      </div>
      <p className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
    </div>
  );
}
