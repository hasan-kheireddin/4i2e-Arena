import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

type Tab = 'active' | 'upcoming' | 'completed';

interface Tournament {
  id: string;
  name: string;
  game: 'Pong' | 'Tic-Tac-Toe';
  status: 'active' | 'upcoming' | 'completed';
  players: { current: number; max: number };
  prize: string;
  startDate: string;
  format: string;
  entryFee: string;
}

const tournaments: Tournament[] = [
  { id: '1', name: 'Arena Grand Prix', game: 'Pong', status: 'active', players: { current: 14, max: 16 }, prize: '500 XP', startDate: 'Live Now', format: 'Single Elim', entryFee: 'Free' },
  { id: '2', name: 'Sunday Showdown', game: 'Tic-Tac-Toe', status: 'active', players: { current: 8, max: 8 }, prize: '200 XP', startDate: 'Round 2', format: 'Double Elim', entryFee: 'Free' },
  { id: '3', name: 'Weekly Blitz', game: 'Pong', status: 'upcoming', players: { current: 5, max: 32 }, prize: '1000 XP', startDate: 'Tomorrow 6PM', format: 'Swiss', entryFee: '50 XP' },
  { id: '4', name: 'Newcomer Cup', game: 'Tic-Tac-Toe', status: 'upcoming', players: { current: 12, max: 16 }, prize: '300 XP', startDate: 'Jan 20', format: 'Round Robin', entryFee: 'Free' },
  { id: '5', name: 'Winter Championship', game: 'Pong', status: 'completed', players: { current: 32, max: 32 }, prize: '2000 XP', startDate: 'Ended Jan 10', format: 'Single Elim', entryFee: '100 XP' },
  { id: '6', name: 'Holiday Havoc', game: 'Tic-Tac-Toe', status: 'completed', players: { current: 16, max: 16 }, prize: '500 XP', startDate: 'Ended Jan 5', format: 'Double Elim', entryFee: 'Free' },
];

const bracketRounds = [
  { name: 'Quarter-Finals', matches: [
    { p1: 'DragonX', p2: 'NovaStar', s1: 3, s2: 1, winner: 'p1' },
    { p1: 'PhantomAce', p2: 'BlitzKing', s1: 2, s2: 3, winner: 'p2' },
    { p1: 'Echo', p2: 'Viper', s1: 3, s2: 0, winner: 'p1' },
    { p1: 'Zenith', p2: 'Spark', s1: 1, s2: 3, winner: 'p2' },
  ]},
  { name: 'Semi-Finals', matches: [
    { p1: 'DragonX', p2: 'BlitzKing', s1: 3, s2: 2, winner: 'p1' },
    { p1: 'Echo', p2: 'Spark', s1: 0, s2: 0, winner: null },
  ]},
  { name: 'Final', matches: [
    { p1: 'TBD', p2: 'TBD', s1: 0, s2: 0, winner: null },
  ]},
];

export default function TournamentPage() {
  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');
  const [showBracket, setShowBracket] = useState(false);

  const filtered = tournaments.filter((t) =>
    t.status === tab && t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Tournaments
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Compete in organized brackets for glory and XP
          </p>
        </div>
        <button
          className="px-6 py-2 rounded-lg font-medium text-white flex items-center gap-2 transition-all duration-200"
          style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}
        >
          🏆 Create Tournament
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon="🏆" label="Tournaments Won" value="3" trend="+1" />
        <StatCard icon="🎯" label="Participated" value="12" />
        <StatCard icon="🥇" label="Best Placement" value="1st" />
        <StatCard icon="👑" label="Total Winnings" value="2,450 XP" />
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div 
          className="flex gap-1 rounded-xl p-1"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
          }}
        >
          {(['active', 'upcoming', 'completed'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all"
              style={{
                backgroundColor: tab === t ? 'var(--color-primary)' : 'transparent',
                color: tab === t ? '#ffffff' : 'var(--color-text-secondary)',
                boxShadow: tab === t ? '0 0 15px rgba(168, 85, 247, 0.3)' : 'none',
              }}
              onMouseEnter={(e) => {
                if (tab !== t) {
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                }
              }}
              onMouseLeave={(e) => {
                if (tab !== t) {
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }}>
            🔍
          </span>
          <input
            placeholder="Search tournaments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg px-4 py-2 pl-10 text-sm outline-none transition-all duration-200"
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

      {/* Tournament Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((t) => (
          <div
            key={t.id}
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
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {t.name}
                  </h3>
                  {t.status === 'active' && (
                    <span 
                      className="px-2 py-0.5 rounded-md text-xs font-bold flex items-center gap-1"
                      style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: 'var(--color-success)' }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-success)' }} />
                      Live
                    </span>
                  )}
                </div>
                <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {t.game} • {t.format}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                  {t.prize}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {t.entryFee === 'Free' ? 'Free Entry' : `Entry: ${t.entryFee}`}
                </p>
              </div>
            </div>

            {/* Player Count */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                <span>👥 {t.players.current}/{t.players.max} Players</span>
                <span>📅 {t.startDate}</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-bg-input)' }}>
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ 
                    width: `${(t.players.current / t.players.max) * 100}%`,
                    background: t.players.current >= t.players.max 
                      ? 'linear-gradient(90deg, #fb923c 0%, #f59e0b 100%)'
                      : 'linear-gradient(90deg, #a855f7 0%, #ec4899 100%)',
                  }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {t.status === 'active' && (
                <>
                  <button
                    onClick={() => setShowBracket(true)}
                    className="flex-1 px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-all duration-200"
                    style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}
                  >
                    View Bracket
                  </button>
                  <button
                    className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1"
                    style={{
                      backgroundColor: 'var(--color-bg-input)',
                      color: 'var(--color-text-primary)',
                      border: '1px solid var(--color-border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'}
                  >
                    ⚔️ Spectate
                  </button>
                </>
              )}
              {t.status === 'upcoming' && (
                <button
                  disabled={t.players.current >= t.players.max}
                  className="flex-1 px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-all duration-200"
                  style={{ 
                    background: t.players.current >= t.players.max 
                      ? 'var(--color-primary-disabled)' 
                      : 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
                    cursor: t.players.current >= t.players.max ? 'not-allowed' : 'pointer',
                  }}
                >
                  {t.players.current >= t.players.max ? 'Full' : 'Register'}
                </button>
              )}
              {t.status === 'completed' && (
                <button
                  className="flex-1 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
                  style={{
                    backgroundColor: 'var(--color-bg-input)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'}
                >
                  View Results
                </button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12">
            <span className="text-6xl mb-3 block">🏆</span>
            <p style={{ color: 'var(--color-text-secondary)' }}>No tournaments found</p>
          </div>
        )}
      </div>

      {/* Bracket View */}
      {showBracket && (
        <div 
          className="p-6 rounded-lg"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Arena Grand Prix — Bracket
            </h2>
            <button
              onClick={() => setShowBracket(false)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
              style={{
                backgroundColor: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
              }}
            >
              Close
            </button>
          </div>
          <div className="overflow-x-auto">
            <div className="flex gap-4 min-w-[700px]">
              {bracketRounds.map((round) => (
                <div key={round.name} className="flex-1 space-y-3 min-w-[200px]">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-center" style={{ color: 'var(--color-text-secondary)' }}>
                    {round.name}
                  </h3>
                  {round.matches.map((m, mi) => (
                    <div 
                      key={mi} 
                      className="rounded-lg overflow-hidden"
                      style={{
                        backgroundColor: 'var(--color-bg-input)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <div 
                        className="flex items-center justify-between px-3 py-2 text-sm"
                        style={{
                          backgroundColor: m.winner === 'p1' ? 'rgba(168, 85, 247, 0.1)' : 'transparent',
                          color: m.winner === 'p1' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        }}
                      >
                        <span className="truncate">{m.p1}</span>
                        <span className="font-mono text-xs font-semibold">{m.s1}</span>
                      </div>
                      <div style={{ height: '1px', backgroundColor: 'var(--color-border)' }} />
                      <div 
                        className="flex items-center justify-between px-3 py-2 text-sm"
                        style={{
                          backgroundColor: m.winner === 'p2' ? 'rgba(168, 85, 247, 0.1)' : 'transparent',
                          color: m.winner === 'p2' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        }}
                      >
                        <span className="truncate">{m.p2}</span>
                        <span className="font-mono text-xs font-semibold">{m.s2}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
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