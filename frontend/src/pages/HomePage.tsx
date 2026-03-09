import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Mock data
const recentMatches = [
  { id: 1, opponent: 'DragonSlayer', game: 'Pong', result: 'win' as const, score: '5-3', xp: 25, time: '2h ago' },
  { id: 2, opponent: 'NightOwl42', game: 'Tic-Tac-Toe', result: 'loss' as const, score: '1-2', xp: 5, time: '5h ago' },
  { id: 3, opponent: 'ProGamer99', game: 'Pong', result: 'win' as const, score: '5-1', xp: 30, time: '1d ago' },
];

const topPlayers = [
  { rank: 1, name: 'MasterPong', points: 3150 },
  { rank: 2, name: 'AcePlayer', points: 2380 },
  { rank: 3, name: 'SwiftStrike', points: 2120 },
  { rank: 4, name: 'GameKing', points: 1890 },
  { rank: 5, name: 'ProGamer99', points: 1780 },
];

const achievements = [
  { name: 'First Blood', icon: '⚔️', rarity: 'common' },
  { name: 'Winning Streak', icon: '🔥', rarity: 'rare' },
  { name: 'Tournament Victor', icon: '🏆', rarity: 'epic' },
];

export default function HomePage() {
  const { user } = useAuth();
  const level = 24;
  const currentXP = 2450;
  const xpToNext = 1550;
  const xpProgress = (currentXP / (currentXP + xpToNext)) * 100;

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
            <p className="mt-1" style={{ color: 'var(--color-text-secondary)' }}>Level {level} • {currentXP.toLocaleString()} XP</p>
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
            to="/games/tictactoe"
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
        <StatCard icon="🏆" label="Total Wins" value="156" trend="+12%" />
        <StatCard icon="📈" label="Win Rate" value="67.3%" />
        <StatCard icon="🔥" label="Current Streak" value="5" />
        <StatCard icon="⭐" label="Rank" value="#42" trend="+3" />
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
              {recentMatches.map((match) => (
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
                      backgroundColor: match.result === 'win' ? 'var(--color-success)' : 'var(--color-error)',
                    }}
                  >
                    {match.result.toUpperCase()}
                  </span>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xs">{match.game === 'Pong' ? '🏓' : '⭕'}</span>
                    <span className="text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>vs {match.opponent}</span>
                  </div>
                  <span className="text-sm font-mono font-semibold" style={{ color: 'var(--color-text-primary)' }}>{match.score}</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--color-success)' }}>+{match.xp} XP</span>
                  <span className="text-xs hidden sm:block" style={{ color: 'var(--color-text-muted)' }}>{match.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column (1/3) */}
        <div className="space-y-6">
          {/* Leaderboard Preview */}
          <Card title="Leaderboard" link="/leaderboard">
            <div className="space-y-2">
              {topPlayers.map((player) => (
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
                    {player.name.charAt(0)}
                  </div>
                  <span className="text-sm truncate flex-1" style={{ color: 'var(--color-text-primary)' }}>{player.name}</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--color-primary)' }}>{player.points.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Achievements */}
          <Card title="Achievements" subtitle="24/50">
            <div className="space-y-3">
              {achievements.map((a) => (
                <div key={a.name} className="flex items-center gap-3">
                  <span className="text-2xl">{a.icon}</span>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{a.name}</p>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{a.rarity}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-bg-input)' }}>
              <div 
                className="h-full rounded-full transition-all duration-500"
                style={{ 
                  width: `${(24/50) * 100}%`,
                  background: 'linear-gradient(90deg, #a855f7 0%, #ec4899 100%)',
                }}
              />
            </div>
          </Card>

          {/* Online Players */}
          <Card title="Online Players" subtitle="24 online">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex -space-x-2">
                {['A', 'B', 'C', 'D', 'E', 'F'].map((initial, i) => (
                  <div 
                    key={i}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ring-2"
                    style={{ 
                      backgroundColor: 'var(--color-primary)',
                      ringColor: 'var(--color-bg-card)',
                    }}
                  >
                    {initial}
                  </div>
                ))}
              </div>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>+18 more</span>
            </div>
            <Link
              to="/games/tictactoe"
              className="w-full px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
              style={{ 
                backgroundColor: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-input)'}
            >
              👥 Challenge Random
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Helper Components
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