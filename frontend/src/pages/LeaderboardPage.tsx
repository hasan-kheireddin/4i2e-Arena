import { useState, useEffect } from 'react';
import { Avatar } from '../components/ui/Avatar';
import { useAuth } from '../context/AuthContext';
import { getLeaderboard, getMyStats, type LeaderboardEntry } from '../services/games';


function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-xl">👑</span>;
  if (rank === 2) return <span className="text-xl">🥈</span>;
  if (rank === 3) return <span className="text-xl">🥉</span>;
  return <span className="text-sm font-mono font-bold w-5 text-center" style={{ color: 'var(--color-text-muted)' }}>{rank}</span>;
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
  const [myStats, setMyStats] = useState<{ rank: number | null; wins: number; winRate: number }>({ rank: null, wins: 0, winRate: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getLeaderboard({ game_type: 'pong', metric: 'wins', limit: 50 }),
      getMyStats('pong'),
    ]).then(([lb, stats]) => {
      setPlayers(lb);
      const myEntry = lb.find((p) => p.user_id === user?.id);
      setMyStats({
        rank: myEntry?.rank ?? null,
        wins: stats.overview.wins,
        winRate: Math.round(stats.overview.win_rate * 100),
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user?.id]);

  const filtered = players.filter((p) =>
    (p.display_name || p.username).toLowerCase().includes(search.toLowerCase())
  );

  const top3 = filtered.slice(0, 3);
  const rest = filtered.slice(3);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>🏓 Pong Leaderboard</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>Top Pong players ranked by wins</p>
      </div>

      {/* Your Rank */}
      <div className="p-4 rounded-lg" style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold" style={{ backgroundColor: 'rgba(168,85,247,0.2)', color: 'var(--color-primary)' }}>
              {myStats.rank ? `#${myStats.rank}` : '—'}
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Your Current Rank</p>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {myStats.winRate}% win rate • {myStats.wins} wins
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2">🔍</span>
          <input placeholder="Search players..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg px-4 py-2 pl-10 text-sm outline-none transition-all"
            style={{ backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }} />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12"><span className="text-4xl block mb-3">⏳</span><p style={{ color: 'var(--color-text-secondary)' }}>Loading leaderboard...</p></div>
      ) : (
        <>
          {/* Top 3 Podium */}
          {top3.length >= 3 && (
            <div className="grid grid-cols-3 gap-3">
              {[top3[1], top3[0], top3[2]].map((player, index) => {
                const podiumOrder = [2, 1, 3];
                const isFirst = podiumOrder[index] === 1;
                const name = player.display_name || player.username;
                return (
                  <div key={player.rank}
                    className={`text-center relative overflow-hidden p-4 rounded-lg ${isFirst ? '-mt-2' : podiumOrder[index] === 2 ? 'mt-2' : 'mt-4'}`}
                    style={{ backgroundColor: 'var(--color-bg-card)', border: isFirst ? '1px solid rgba(234,179,8,0.3)' : '1px solid var(--color-border)', boxShadow: isFirst ? '0 0 20px rgba(234,179,8,0.1)' : 'none' }}>
                    {isFirst && <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'linear-gradient(to right,#fbbf24,#fcd34d,#fbbf24)' }} />}
                    <div className="flex flex-col items-center gap-2 pt-2">
                      <RankBadge rank={podiumOrder[index]} />
                      <Avatar name={name} size="lg" />
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{name}</h3>
                      <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{Math.round(player.win_rate * 100)}% WR</p>
                      <p className="text-lg font-mono font-bold" style={{ color: 'var(--color-primary)' }}>{player.total_xp.toLocaleString()} XP</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto rounded-lg" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {['#', 'Player', 'W/L', 'Win Rate', 'Streak', 'XP'].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider py-3 px-3" style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rest.map((player) => {
                  const name = player.display_name || player.username;
                  const isMe = player.user_id === user?.id;
                  return (
                    <tr key={player.rank} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', backgroundColor: isMe ? 'rgba(168,85,247,0.05)' : 'transparent' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isMe ? 'rgba(168,85,247,0.05)' : 'transparent'}>
                      <td className="py-3 px-3"><RankBadge rank={player.rank} /></td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={name} size="sm" />
                          <p className="text-sm font-medium" style={{ color: isMe ? 'var(--color-primary)' : 'var(--color-text-primary)' }}>{name} {isMe && '(You)'}</p>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-sm hidden sm:table-cell" style={{ color: 'var(--color-text-secondary)' }}>
                        <span style={{ color: 'var(--color-success)' }}>{player.wins}</span> / <span style={{ color: 'var(--color-error)' }}>{player.losses}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="text-sm font-semibold"
                          style={{ color: player.win_rate >= 0.7 ? 'var(--color-success)' : player.win_rate >= 0.5 ? '#fbbf24' : 'var(--color-error)' }}>
                          {Math.round(player.win_rate * 100)}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center text-sm hidden sm:table-cell" style={{ color: 'var(--color-text-muted)' }}>—</td>
                      <td className="py-3 px-3 text-right text-sm font-mono font-semibold" style={{ color: 'var(--color-primary)' }}>{player.total_xp.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
