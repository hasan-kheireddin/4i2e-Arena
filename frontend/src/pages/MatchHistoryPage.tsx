import { useState } from 'react';
import { cn } from '../lib/utils';

type GameFilter = 'all' | 'pong' | 'tictactoe';
type ResultFilter = 'all' | 'win' | 'loss' | 'draw';

interface Match {
  id: string;
  game: 'Pong' | 'Tic-Tac-Toe';
  opponent: string;
  result: 'win' | 'loss' | 'draw';
  score: string;
  xp: number;
  duration: string;
  date: string;
  mode: string;
}

const matchHistory: Match[] = [
  { id: '1', game: 'Pong', opponent: 'DragonX', result: 'win', score: '5 - 3', xp: 25, duration: '3:42', date: '2 hours ago', mode: 'Ranked' },
  { id: '2', game: 'Tic-Tac-Toe', opponent: 'NovaStar', result: 'loss', score: '1 - 2', xp: 5, duration: '2:15', date: '5 hours ago', mode: 'Casual' },
  { id: '3', game: 'Pong', opponent: 'Echo', result: 'win', score: '5 - 1', xp: 30, duration: '2:53', date: 'Yesterday', mode: 'Ranked' },
  { id: '4', game: 'Pong', opponent: 'BlitzKing', result: 'win', score: '5 - 4', xp: 20, duration: '5:11', date: 'Yesterday', mode: 'Tournament' },
  { id: '5', game: 'Tic-Tac-Toe', opponent: 'Viper', result: 'draw', score: '—', xp: 10, duration: '1:45', date: '2 days ago', mode: 'Ranked' },
  { id: '6', game: 'Pong', opponent: 'Spark', result: 'loss', score: '3 - 5', xp: 5, duration: '4:20', date: '2 days ago', mode: 'Casual' },
  { id: '7', game: 'Tic-Tac-Toe', opponent: 'Zenith', result: 'win', score: '2 - 1', xp: 25, duration: '3:05', date: '3 days ago', mode: 'Ranked' },
  { id: '8', game: 'Pong', opponent: 'NightOwl', result: 'win', score: '5 - 2', xp: 25, duration: '3:30', date: '3 days ago', mode: 'Ranked' },
  { id: '9', game: 'Pong', opponent: 'Cipher', result: 'loss', score: '2 - 5', xp: 5, duration: '2:50', date: '4 days ago', mode: 'Tournament' },
  { id: '10', game: 'Tic-Tac-Toe', opponent: 'PhantomAce', result: 'win', score: '2 - 0', xp: 25, duration: '2:10', date: '5 days ago', mode: 'Casual' },
];

export default function MatchHistoryPage() {
  const [gameFilter, setGameFilter] = useState<GameFilter>('all');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [search, setSearch] = useState('');

  const filtered = matchHistory.filter((m) => {
    if (gameFilter === 'pong' && m.game !== 'Pong') return false;
    if (gameFilter === 'tictactoe' && m.game !== 'Tic-Tac-Toe') return false;
    if (resultFilter !== 'all' && m.result !== resultFilter) return false;
    if (search && !m.opponent.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: matchHistory.length,
    wins: matchHistory.filter((m) => m.result === 'win').length,
    losses: matchHistory.filter((m) => m.result === 'loss').length,
    draws: matchHistory.filter((m) => m.result === 'draw').length,
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          Match History
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          Review your past games and performance
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'var(--color-text-primary)' },
          { label: 'Wins', value: stats.wins, color: 'var(--color-success)' },
          { label: 'Losses', value: stats.losses, color: 'var(--color-error)' },
          { label: 'Draws', value: stats.draws, color: '#fbbf24' },
        ].map((s) => (
          <div 
            key={s.label} 
            className="text-center py-3 rounded-lg"
            style={{
              backgroundColor: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
            }}
          >
            <p className="text-xl font-mono font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div 
          className="flex gap-1 rounded-xl p-1"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
          }}
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
              onMouseEnter={(e) => {
                if (gameFilter !== f) {
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                }
              }}
              onMouseLeave={(e) => {
                if (gameFilter !== f) {
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              {f === 'tictactoe' ? 'Tic-Tac-Toe' : f === 'all' ? 'All Games' : 'Pong'}
            </button>
          ))}
        </div>
        <div 
          className="flex gap-1 rounded-xl p-1"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
          }}
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
              onMouseEnter={(e) => {
                if (resultFilter !== f) {
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                }
              }}
              onMouseLeave={(e) => {
                if (resultFilter !== f) {
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2">🔍</span>
          <input
            placeholder="Search opponent..."
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

      {/* Match List */}
      <div className="space-y-2">
        {filtered.map((match) => (
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
              {/* Game Icon */}
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-2xl"
                style={{
                  backgroundColor: match.result === 'win' ? 'rgba(34, 197, 94, 0.1)' :
                                  match.result === 'loss' ? 'rgba(239, 68, 68, 0.1)' :
                                  'rgba(251, 191, 36, 0.1)',
                }}
              >
                {match.game === 'Pong' ? '🏓' : '⭕'}
              </div>

              {/* Match Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    vs {match.opponent}
                  </span>
                  <span 
                    className="px-2 py-0.5 rounded-md text-xs font-semibold"
                    style={{
                      backgroundColor: match.result === 'win' ? 'rgba(34, 197, 94, 0.15)' :
                                      match.result === 'loss' ? 'rgba(239, 68, 68, 0.15)' :
                                      'rgba(251, 191, 36, 0.15)',
                      color: match.result === 'win' ? 'var(--color-success)' :
                             match.result === 'loss' ? 'var(--color-error)' :
                             '#fbbf24',
                    }}
                  >
                    {match.result.charAt(0).toUpperCase() + match.result.slice(1)}
                  </span>
                  <span 
                    className="px-2 py-0.5 rounded-md text-xs font-medium"
                    style={{
                      backgroundColor: 'rgba(168, 85, 247, 0.1)',
                      color: 'var(--color-primary)',
                    }}
                  >
                    {match.mode}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  <span>{match.game}</span>
                  <span>Score: {match.score}</span>
                  <span className="flex items-center gap-1">⏱️ {match.duration}</span>
                </div>
              </div>

              {/* Right Side */}
              <div className="text-right shrink-0">
                <p className="text-xs font-medium" style={{ color: 'var(--color-success)' }}>
                  +{match.xp} XP
                </p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  {match.date}
                </p>
              </div>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <span className="text-6xl block mb-3">🎮</span>
            <p style={{ color: 'var(--color-text-secondary)' }}>No matches found</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Try adjusting your filters
            </p>
          </div>
        )}
      </div>
    </div>
  );
}