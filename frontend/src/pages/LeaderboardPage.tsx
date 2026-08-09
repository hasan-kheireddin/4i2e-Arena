import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, Loader2, Medal } from 'lucide-react';
import { Avatar } from '../components/ui/Avatar';
import { useAuth } from '../context/AuthContext';
import { getLeaderboard, type LeaderboardEntry, type LeaderboardPeriod } from '../services/games';

type LeaderboardGameFilter = 'all' | 'pong' | 'tictactoe';

/** Gold, silver, bronze — the medal colours carry the placing, not the glyph. */
const PODIUM_COLORS: Record<number, string> = {
  1: '#fbbf24',
  2: '#cbd5e1',
  3: '#d97706',
};

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return <Crown className="w-5 h-5" style={{ color: PODIUM_COLORS[1] }} aria-label="1st" />;
  }
  if (rank === 2 || rank === 3) {
    return <Medal className="w-5 h-5" style={{ color: PODIUM_COLORS[rank] }} aria-label={`${rank}${rank === 2 ? 'nd' : 'rd'}`} />;
  }
  return <span className="text-sm font-mono font-bold w-5 text-center" style={{ color: 'var(--color-text-muted)' }}>{rank}</span>;
}

export default function LeaderboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const [gameFilter, setGameFilter] = useState<LeaderboardGameFilter>('all');
  const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
  const [myStats, setMyStats] = useState<{ rank: number | null; wins: number }>({ rank: null, wins: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const gameType = gameFilter === 'all' ? undefined : gameFilter;
    getLeaderboard({ game_type: gameType, metric: 'wins', period, limit: 50 }).then((lb) => {
      setPlayers(lb);
      const myEntry = lb.find((p) => p.user_id === user?.id);
      setMyStats({
        rank: myEntry?.rank ?? null,
        wins: myEntry?.wins ?? 0,
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [period, gameFilter, user?.id]);

  const hasPodium = players.length >= 3;
  const top3 = hasPodium ? players.slice(0, 3) : [];
  const tablePlayers = hasPodium ? players.slice(3) : players;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{t('lb.title')}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{t('lb.subtitle')}</p>
      </div>

      {/* Your Rank */}
      <div className="p-4 rounded-lg" style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold" style={{ backgroundColor: 'rgba(168,85,247,0.2)', color: 'var(--color-primary)' }}>
              {myStats.rank ? `#${myStats.rank}` : '—'}
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{t('lb.your_rank')}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {t('lb.wins_stat', { wins: myStats.wins })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Period filters */}
      <div className="flex gap-2">
        {(
          [
            { key: 'daily', label: t('lb.period_daily') },
            { key: 'weekly', label: t('lb.period_weekly') },
            { key: 'monthly', label: t('lb.period_monthly') },
          ] as const
        ).map(({ key, label }) => {
          const selected = period === key;
          return (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                backgroundColor: selected ? 'var(--color-primary)' : 'var(--color-bg-card)',
                color: selected ? '#fff' : 'var(--color-text-secondary)',
                border: selected ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Game filters */}
      <div className="flex gap-2">
        {(
          [
            { key: 'all', label: t('lb.game_all') },
            { key: 'pong', label: t('lb.game_pong') },
            { key: 'tictactoe', label: t('lb.game_tictactoe') },
          ] as const
        ).map(({ key, label }) => {
          const selected = gameFilter === key;
          return (
            <button
              key={key}
              onClick={() => setGameFilter(key)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                backgroundColor: selected ? 'var(--color-primary)' : 'var(--color-bg-card)',
                color: selected ? '#fff' : 'var(--color-text-secondary)',
                border: selected ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-primary)' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('lb.loading')}</p>
        </div>
      ) : (
        <>
          {/* Top 3 Podium */}
          {hasPodium && (
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
                      <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{player.wins} {t('lb.col_wins')}</p>
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
                  {[t('lb.col_rank'), t('lb.col_player'), t('lb.col_wins'), t('lb.col_xp')].map((h) => (
                    <th key={h} className="text-xs font-semibold uppercase tracking-wider py-3 px-3" style={{ color: 'var(--color-text-muted)', textAlign: 'start' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tablePlayers.map((player) => {
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
                          <p className="text-sm font-medium" style={{ color: isMe ? 'var(--color-primary)' : 'var(--color-text-primary)' }}>{name} {isMe && t('lb.you')}</p>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-sm font-semibold" style={{ color: 'var(--color-success)' }}>{player.wins}</td>
                      <td className="py-3 px-3 text-sm font-mono font-semibold" style={{ color: 'var(--color-primary)', textAlign: 'end' }}>{player.total_xp.toLocaleString()}</td>
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
