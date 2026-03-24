import { useState, useEffect } from 'react';
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getMyMatches, getMyStats, getLeaderboard, type Match, type LeaderboardEntry, type UserStats } from '../services/games';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function HomePage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      try {
        const [statsData, matchesData, lbData] = await Promise.all([
          getMyStats(),
          getMyMatches({ page_size: 3 }),
          getLeaderboard({ limit: 5 }),
        ]);
        if (!cancelled) {
          setStats(statsData);
          setRecentMatches(matchesData.results);
          setLeaderboard(lbData);
        }
      } catch {
        // fallback to zeros / empty arrays
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, []);

  const totalXp    = stats?.overview.total_xp ?? 0;
  const level      = Math.floor(totalXp / 200) + 1;
  const xpToNext   = 200 - (totalXp % 200);
  const xpProgress = ((200 - xpToNext) / 200) * 100;

  const totalWins  = stats?.overview.wins ?? 0;
  const winRatePct = stats ? (stats.overview.win_rate * 100).toFixed(1) + '%' : '0.0%';
  const streak     = stats?.streaks.current.count ?? 0;

  const myLeaderboardEntry = leaderboard.find((e) => e.username === user?.username);
  const myRank = myLeaderboardEntry ? `#${myLeaderboardEntry.rank}` : '#–';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div
          className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div
        className="relative overflow-hidden rounded-2xl p-6 md:p-8"
        style={{
          background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(236, 72, 153, 0.06) 50%, rgba(249, 115, 22, 0.04) 100%)',
        }}
      >
        <div className="absolute top-0 left-0 w-64 h-64 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)' }} />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Welcome back, <span style={{
                background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>{user?.username || 'Player'}</span>
            </h1>
            <p className="mt-1" style={{ color: 'var(--color-text-secondary)' }}>Level {level} • {totalXp.toLocaleString()} XP</p>
            <div className="mt-3 max-w-xs">
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-bg-input)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${xpProgress}%`,
                    background: 'linear-gradient(90deg, #a855f7 0%, #ec4899 100%)',
                  }}
                />
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{xpToNext.toLocaleString()} XP to Level {level + 1}</p>
            </div>
          </div>
          <Link
            to="/games/playpage"
            className="px-6 py-3 rounded-lg font-semibold text-white flex items-center gap-2 transition-all duration-200"
            style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            ⚡ Quick Play
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon="🏆" label="Total Wins" value={String(totalWins)} />
        <StatCard icon="📈" label="Win Rate" value={winRatePct} />
        <StatCard icon="🔥" label="Current Streak" value={String(streak)} />
        <StatCard icon="⭐" label="Rank" value={myRank} />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Play Games */}
          <div>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Quick Play</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <GameCard
                icon="🏓"
                title="Pong"
                players={24}
                to="/games/pong"
                gradient="linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(236, 72, 153, 0.1) 100%)"
              />
              <GameCard
                icon="⭕"
                title="Tic-Tac-Toe"
                players={18}
                to="/games/tictactoe"
                gradient="linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(168, 85, 247, 0.1) 100%)"
              />
            </div>
          </div>

          {/* Recent Matches */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>Recent Matches</h2>
              <Link
                to="/history"
                className="text-sm flex items-center gap-1 transition-colors"
                style={{ color: 'var(--color-primary)' }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                View All →
              </Link>
            </div>
            <div className="space-y-3">
              {recentMatches.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No recent matches yet.</p>
              )}
              {recentMatches.map((match) => {
                const myPlayer = match.players.find((p) => p.username === user?.username);
                const opponent = match.players.find((p) => p.username !== user?.username);
                const result: 'win' | 'loss' | 'draw' = myPlayer?.outcome ?? 'loss';
                const score = `${match.player1_score}-${match.player2_score}`;
                const xpEarned = myPlayer?.xp_earned ?? 0;
                const gameIcon = match.game_type === 'pong' ? '🏓' : '⭕';
                const timeLabel = match.finished_at ? timeAgo(match.finished_at) : '';

                return (
                  <div
                    key={match.id}
                    className="flex items-center gap-4 p-4 rounded-lg transition-all duration-200"
                    style={{
                      backgroundColor: 'var(--color-bg-card)',
                      border: '1px solid var(--color-border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-card)'}
                  >
                    <span
                      className="px-3 py-1 rounded-md text-xs font-bold text-white"
                      style={{
                        backgroundColor:
                          result === 'win' ? 'var(--color-success)' :
                          result === 'draw' ? '#f59e0b' :
                          'var(--color-error)',
                      }}
                    >
                      {result.toUpperCase()}
                    </span>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs">{gameIcon}</span>
                      <span className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
                        vs {opponent?.username ?? 'Unknown'}
                      </span>
                    </div>
                    <span className="text-sm font-mono font-semibold" style={{ color: 'var(--color-text-primary)' }}>{score}</span>
                    <span className="text-xs font-medium" style={{ color: 'var(--color-success)' }}>+{xpEarned} XP</span>
                    <span className="text-xs hidden sm:block" style={{ color: 'var(--color-text-muted)' }}>{timeLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column (1/3) */}
        <div className="space-y-6">
          <Card title="Leaderboard" link="/leaderboard">
            <div className="space-y-2">
              {leaderboard.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No leaderboard data yet.</p>
              )}
              {leaderboard.map((player) => (
                <div key={player.rank} className="flex items-center gap-3 py-1.5">
                  <span
                    className="text-xs font-bold w-5 text-center"
                    style={{
                      color: player.rank === 1 ? '#fbbf24' :
                             player.rank === 2 ? '#94a3b8' :
                             player.rank === 3 ? '#fb923c' :
                             'var(--color-text-muted)',
                    }}
                  >
                    #{player.rank}
                  </span>
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    {player.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm truncate flex-1" style={{ color: 'var(--color-text-primary)' }}>{player.username}</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--color-primary)' }}>{player.total_xp.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, trend }: { icon: string; label: string; value: string; trend?: string }) {
  return (
    <div
      className="p-4 rounded-lg"
      style={{
        backgroundColor: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{value}</span>
        {trend && (
          <span className="text-sm font-medium mb-1" style={{ color: 'var(--color-success)' }}>
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}

function GameCard({ icon, title, players, to, gradient }: { icon: string; title: string; players: number; to: string; gradient: string }) {
  return (
    <Link to={to}>
      <div
        className="h-40 flex flex-col items-center justify-center gap-3 rounded-lg transition-all duration-200 group"
        style={{
          background: gradient,
          border: '1px solid transparent',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-4px)';
          e.currentTarget.style.borderColor = 'var(--color-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.borderColor = 'transparent';
        }}
      >
        <span className="text-5xl group-hover:scale-110 transition-transform duration-200">{icon}</span>
        <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{players} players online</p>
      </div>
    </Link>
  );
}

function Card({ title, subtitle, link, children }: { title: string; subtitle?: string; link?: string; children: React.ReactNode }) {
  return (
    <div
      className="p-4 rounded-lg"
      style={{
        backgroundColor: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
        {subtitle && <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</span>}
        {link && (
          <Link
            to={link}
            className="text-xs transition-opacity"
            style={{ color: 'var(--color-primary)' }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            View All
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}
