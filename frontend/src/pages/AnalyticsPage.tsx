import { useState, useEffect } from 'react';
import { getMyStats, type UserStats } from '../services/games';

function ProgressBar({ value, color }: { value: number; color: 'purple' | 'pink' | 'cyan' | 'orange' }) {
  const colors = {
    purple: 'linear-gradient(90deg,#a855f7 0%,#ec4899 100%)',
    pink: 'linear-gradient(90deg,#ec4899 0%,#f472b6 100%)',
    cyan: 'linear-gradient(90deg,#06b6d4 0%,#22d3ee 100%)',
    orange: 'linear-gradient(90deg,#fb923c 0%,#f59e0b 100%)',
  };
  return (
    <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-bg-input)' }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(value, 100)}%`, background: colors[color] }} />
    </div>
  );
}

function StatCard({ label, value, trend, positive }: { label: string; value: string; trend?: string; positive?: boolean }) {
  return (
    <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{value}</span>
        {trend && <span className="text-sm font-medium mb-1" style={{ color: positive ? 'var(--color-success)' : 'var(--color-text-muted)' }}>{trend}</span>}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyStats().then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 rounded-full border-4 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const ov = stats?.overview;
  const streak = stats?.streaks.current;
  const trend = stats?.performance_trend ?? [];
  const last7 = trend.slice(-7);
  const maxGames = Math.max(...last7.map((d) => d.wins + d.losses), 1);
  const pongData = stats?.by_game_type?.['pong'];
  const tttData = stats?.by_game_type?.['tictactoe'];
  const totalGames = (pongData?.total ?? 0) + (tttData?.total ?? 0);
  const pongPct = totalGames > 0 ? Math.round(((pongData?.total ?? 0) / totalGames) * 100) : 75;
  const tttPct = 100 - pongPct;

  const winRatePct = ov ? Math.round(ov.win_rate * 100) : 0;
  const streakLabel = streak ? `${streak.count}${streak.type === 'win' ? 'W' : streak.type === 'loss' ? 'L' : ''}` : '—';

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Analytics</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>Track your performance and improvement over time</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Win Rate" value={`${winRatePct}%`} />
        <StatCard label="Total Games" value={String(ov?.total_matches ?? 0)} />
        <StatCard label="Current Streak" value={streakLabel} trend={`Best: ${stats?.streaks.longest_win ?? 0}W`} positive />
        <StatCard label="Avg Duration" value={ov ? `${Math.round(ov.avg_duration / 60)}m ${Math.round(ov.avg_duration % 60)}s` : '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly W/L Chart */}
        <div className="p-6 rounded-lg" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Recent Performance</h3>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Last {last7.length} days</span>
          </div>
          {last7.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>No data yet — play some games!</p>
          ) : (
            <div className="flex items-end gap-2 h-40">
              {last7.map((d) => {
                const winH = (d.wins / maxGames) * 100;
                const lossH = (d.losses / maxGames) * 100;
                const dayLabel = d.date ? new Date(d.date).toLocaleDateString('en', { weekday: 'short' }) : '';
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col items-center gap-0.5" style={{ height: '130px' }}>
                      <div className="flex-1" />
                      <div className="w-full max-w-6 rounded-t transition-all" style={{ height: `${winH}%`, backgroundColor: 'rgba(168,85,247,0.6)' }} title={`${d.wins} wins`}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-primary)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(168,85,247,0.6)'} />
                      <div className="w-full max-w-6 rounded-b transition-all" style={{ height: `${lossH}%`, backgroundColor: 'rgba(239,68,68,0.4)' }} title={`${d.losses} losses`}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.6)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.4)'} />
                    </div>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{dayLabel}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-4 mt-3 justify-center text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'rgba(168,85,247,0.6)' }} />Wins</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'rgba(239,68,68,0.4)' }} />Losses</span>
          </div>
        </div>

        {/* Game Distribution */}
        <div className="p-6 rounded-lg" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Game Distribution</h3>
          <div className="flex items-center gap-6 mb-6">
            <div className="relative w-28 h-28 shrink-0">
              <div className="w-full h-full rounded-full" style={{ background: `conic-gradient(var(--color-primary) 0% ${pongPct}%,#ec4899 ${pongPct}% 100%)` }} />
              <div className="absolute inset-3 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg-card)' }}>
                <span className="text-sm font-mono font-bold" style={{ color: 'var(--color-text-primary)' }}>{totalGames}</span>
              </div>
            </div>
            <div className="space-y-3 flex-1">
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'var(--color-primary)' }} />Pong</span>
                  <span className="font-mono" style={{ color: 'var(--color-primary)' }}>{pongData?.total ?? 0} ({pongPct}%)</span>
                </div>
                <ProgressBar value={pongPct} color="purple" />
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#ec4899' }} />Tic-Tac-Toe</span>
                  <span className="font-mono" style={{ color: '#ec4899' }}>{tttData?.total ?? 0} ({tttPct}%)</span>
                </div>
                <ProgressBar value={tttPct} color="pink" />
              </div>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="p-6 rounded-lg" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Performance Metrics</h3>
          <div className="space-y-4">
            {[
              { label: 'Total Wins', value: String(ov?.wins ?? 0) },
              { label: 'Total Losses', value: String(ov?.losses ?? 0) },
              { label: 'Total Draws', value: String(ov?.draws ?? 0) },
              { label: 'Avg Duration', value: ov ? `${Math.round(ov.avg_duration / 60)}m ${Math.round(ov.avg_duration % 60)}s` : '—' },
              { label: 'Longest Win Streak', value: String(stats?.streaks.longest_win ?? 0) },
            ].map((m) => (
              <div key={m.label} className="flex items-center justify-between">
                <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{m.label}</p>
                <span className="text-sm font-mono font-semibold" style={{ color: 'var(--color-text-primary)' }}>{m.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Form */}
        <div className="p-6 rounded-lg" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
          <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Recent Form (Last 10)</h3>
          {(stats?.recent_form ?? []).length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No recent games</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(stats?.recent_form ?? []).map((outcome, i) => (
                <span key={i} className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: outcome === 'win' ? 'rgba(34,197,94,0.15)' : outcome === 'loss' ? 'rgba(239,68,68,0.15)' : 'rgba(251,191,36,0.15)', color: outcome === 'win' ? 'var(--color-success)' : outcome === 'loss' ? 'var(--color-error)' : '#fbbf24' }}>
                  {outcome === 'win' ? 'W' : outcome === 'loss' ? 'L' : 'D'}
                </span>
              ))}
            </div>
          )}
          <div className="mt-4 space-y-3">
            <h4 className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>By Game Mode</h4>
            {Object.entries(stats?.by_game_mode ?? {}).map(([mode, data]) => (
              <div key={mode}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="capitalize" style={{ color: 'var(--color-text-secondary)' }}>{mode}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>{data.total} games • {Math.round(data.win_rate * 100)}% WR</span>
                </div>
                <ProgressBar value={data.win_rate * 100} color={mode === 'pvp' ? 'purple' : mode === 'pve' ? 'cyan' : 'orange'} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
