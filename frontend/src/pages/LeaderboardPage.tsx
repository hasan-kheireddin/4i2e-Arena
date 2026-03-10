import { useState } from 'react';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../lib/utils';

type GameFilter = 'all' | 'pong' | 'tictactoe';

interface Player {
  rank: number;
  name: string;
  wins: number;
  losses: number;
  winRate: number;
  streak: number;
  xp: number;
  trend: 'up' | 'down' | 'same';
  online: boolean;
}

const leaderboardData: Player[] = [
  { rank: 1, name: 'DragonX', wins: 142, losses: 23, winRate: 86, streak: 12, xp: 14200, trend: 'up', online: true },
  { rank: 2, name: 'NovaStar', wins: 128, losses: 31, winRate: 80, streak: 5, xp: 12800, trend: 'up', online: true },
  { rank: 3, name: 'PhantomAce', wins: 119, losses: 38, winRate: 76, streak: 3, xp: 11900, trend: 'down', online: false },
  { rank: 4, name: 'BlitzKing', wins: 115, losses: 40, winRate: 74, streak: 7, xp: 11500, trend: 'up', online: true },
  { rank: 5, name: 'Echo', wins: 108, losses: 42, winRate: 72, streak: 2, xp: 10800, trend: 'same', online: false },
  { rank: 6, name: 'Viper', wins: 102, losses: 48, winRate: 68, streak: -3, xp: 10200, trend: 'down', online: true },
  { rank: 7, name: 'Zenith', wins: 98, losses: 52, winRate: 65, streak: 1, xp: 9800, trend: 'up', online: false },
  { rank: 8, name: 'Spark', wins: 95, losses: 55, winRate: 63, streak: -1, xp: 9500, trend: 'down', online: true },
  { rank: 9, name: 'NightOwl', wins: 90, losses: 58, winRate: 61, streak: 4, xp: 9000, trend: 'up', online: false },
  { rank: 10, name: 'Cipher', wins: 87, losses: 63, winRate: 58, streak: -2, xp: 8700, trend: 'down', online: false },
  { rank: 11, name: 'Falcon', wins: 82, losses: 68, winRate: 55, streak: 2, xp: 8200, trend: 'up', online: true },
  { rank: 12, name: 'Storm', wins: 78, losses: 72, winRate: 52, streak: -1, xp: 7800, trend: 'same', online: false },
];

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'same' }) {
  if (trend === 'up') return <span style={{ color: 'var(--color-success)' }}>📈</span>;
  if (trend === 'down') return <span style={{ color: 'var(--color-error)' }}>📉</span>;
  return <span style={{ color: 'var(--color-text-muted)' }}>➖</span>;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-xl">👑</span>;
  if (rank === 2) return <span className="text-xl">🥈</span>;
  if (rank === 3) return <span className="text-xl">🥉</span>;
  return <span className="text-sm font-mono font-bold w-5 text-center" style={{ color: 'var(--color-text-muted)' }}>{rank}</span>;
}

export default function LeaderboardPage() {
  const [gameFilter, setGameFilter] = useState<GameFilter>('all');
  const [search, setSearch] = useState('');

  const filtered = leaderboardData.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const top3 = filtered.slice(0, 3);
  const rest = filtered.slice(3);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          Leaderboard
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          Top players ranked by win rate and XP
        </p>
      </div>

      {/* Your Rank */}
      <div 
        className="p-4 rounded-lg"
        style={{
          background: 'rgba(168, 85, 247, 0.1)',
          border: '1px solid rgba(168, 85, 247, 0.2)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold"
              style={{
                backgroundColor: 'rgba(168, 85, 247, 0.2)',
                color: 'var(--color-primary)',
              }}
            >
              #7
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                Your Current Rank
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                65% win rate • 98 wins
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2" style={{ color: 'var(--color-success)' }}>
            <span>📈</span>
            <span className="text-sm font-medium">+2 this week</span>
          </div>
        </div>
      </div>

      {/* Filter & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div 
          className="flex gap-1 rounded-xl p-1"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
          }}
        >
          {([
            { key: 'all', label: 'All Games' },
            { key: 'pong', label: 'Pong' },
            { key: 'tictactoe', label: 'Tic-Tac-Toe' },
          ] as { key: GameFilter; label: string }[]).map((f) => (
            <button
              key={f.key}
              onClick={() => setGameFilter(f.key)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: gameFilter === f.key ? 'var(--color-primary)' : 'transparent',
                color: gameFilter === f.key ? '#ffffff' : 'var(--color-text-secondary)',
                boxShadow: gameFilter === f.key ? '0 0 15px rgba(168, 85, 247, 0.3)' : 'none',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2">🔍</span>
          <input
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg px-4 py-2 pl-10 text-sm outline-none transition-all"
            style={{
              backgroundColor: 'var(--color-bg-input)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
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

      {/* Top 3 Podium */}
      {top3.length >= 3 && (
        <div className="grid grid-cols-3 gap-3">
          {[top3[1], top3[0], top3[2]].map((player, index) => {
            const podiumOrder = [2, 1, 3];
            const isFirst = podiumOrder[index] === 1;
            return (
              <div
                key={player.rank}
                className={cn(
                  'text-center relative overflow-hidden p-4 rounded-lg',
                  isFirst && '-mt-2',
                  podiumOrder[index] === 2 && 'mt-2',
                  podiumOrder[index] === 3 && 'mt-4'
                )}
                style={{
                  backgroundColor: 'var(--color-bg-card)',
                  border: isFirst ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid var(--color-border)',
                  boxShadow: isFirst ? '0 0 20px rgba(234, 179, 8, 0.1)' : 'none',
                }}
              >
                {isFirst && (
                  <div 
                    className="absolute top-0 left-0 right-0 h-1"
                    style={{
                      background: 'linear-gradient(to right, #fbbf24, #fcd34d, #fbbf24)',
                    }}
                  />
                )}
                <div className="flex flex-col items-center gap-2 pt-2">
                  <RankBadge rank={podiumOrder[index]} />
                  <Avatar name={player.name} size="lg" online={player.online} />
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {player.name}
                  </h3>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {player.winRate}% WR
                  </p>
                  <p className="text-lg font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                    {player.xp.toLocaleString()} XP
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      <div 
        className="overflow-x-auto rounded-lg"
        style={{
          backgroundColor: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
        }}
      >
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th className="text-left text-xs font-semibold uppercase tracking-wider py-3 px-3 w-12" style={{ color: 'var(--color-text-muted)' }}>#</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider py-3 px-3" style={{ color: 'var(--color-text-muted)' }}>Player</th>
              <th className="text-center text-xs font-semibold uppercase tracking-wider py-3 px-3 hidden sm:table-cell" style={{ color: 'var(--color-text-muted)' }}>W/L</th>
              <th className="text-center text-xs font-semibold uppercase tracking-wider py-3 px-3" style={{ color: 'var(--color-text-muted)' }}>Win Rate</th>
              <th className="text-center text-xs font-semibold uppercase tracking-wider py-3 px-3 hidden sm:table-cell" style={{ color: 'var(--color-text-muted)' }}>Streak</th>
              <th className="text-right text-xs font-semibold uppercase tracking-wider py-3 px-3" style={{ color: 'var(--color-text-muted)' }}>XP</th>
              <th className="text-center text-xs font-semibold uppercase tracking-wider py-3 px-3 w-12" style={{ color: 'var(--color-text-muted)' }}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {rest.map((player) => (
              <tr 
                key={player.rank} 
                className="transition-colors"
                style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <td className="py-3 px-3"><RankBadge rank={player.rank} /></td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={player.name} size="sm" online={player.online} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {player.name}
                      </p>
                      {player.online && (
                        <span 
                          className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: 'var(--color-success)' }}
                        >
                          Online
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3 px-3 text-center text-sm hidden sm:table-cell" style={{ color: 'var(--color-text-secondary)' }}>
                  <span style={{ color: 'var(--color-success)' }}>{player.wins}</span> / <span style={{ color: 'var(--color-error)' }}>{player.losses}</span>
                </td>
                <td className="py-3 px-3 text-center">
                  <span 
                    className="text-sm font-semibold"
                    style={{
                      color: player.winRate >= 70 ? 'var(--color-success)' : 
                             player.winRate >= 50 ? '#fbbf24' : 
                             'var(--color-error)'
                    }}
                  >
                    {player.winRate}%
                  </span>
                </td>
                <td className="py-3 px-3 text-center text-sm hidden sm:table-cell">
                  {player.streak > 0 ? (
                    <span style={{ color: 'var(--color-success)' }}>🔥 {player.streak}W</span>
                  ) : player.streak < 0 ? (
                    <span style={{ color: 'var(--color-error)' }}>{Math.abs(player.streak)}L</span>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                  )}
                </td>
                <td className="py-3 px-3 text-right text-sm font-mono font-semibold" style={{ color: 'var(--color-primary)' }}>
                  {player.xp.toLocaleString()}
                </td>
                <td className="py-3 px-3 text-center"><TrendIcon trend={player.trend} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}