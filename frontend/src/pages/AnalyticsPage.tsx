import { cn } from '../lib/utils';

const weeklyData = [
  { day: 'Mon', wins: 3, losses: 1 },
  { day: 'Tue', wins: 5, losses: 2 },
  { day: 'Wed', wins: 2, losses: 3 },
  { day: 'Thu', wins: 4, losses: 1 },
  { day: 'Fri', wins: 6, losses: 0 },
  { day: 'Sat', wins: 3, losses: 2 },
  { day: 'Sun', wins: 4, losses: 1 },
];

const maxGames = Math.max(...weeklyData.map((d) => d.wins + d.losses));

const performanceMetrics = [
  { label: 'Avg Reaction Time', value: '245ms', change: '-12ms', positive: true },
  { label: 'Avg Game Duration', value: '3:24', change: '+0:15', positive: false },
  { label: 'Points per Game', value: '4.2', change: '+0.3', positive: true },
  { label: 'Serves Won', value: '78%', change: '+5%', positive: true },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
          Analytics
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          Track your performance and improvement over time
        </p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon="🏆" label="Win Rate (7d)" value="73%" trend="+8%" positive={true} />
        <StatCard icon="🔥" label="Games Played (7d)" value="37" />
        <StatCard icon="🎯" label="Current Streak" value="4W" trend="Best: 12" positive={true} />
        <StatCard icon="⏱️" label="Time Played" value="2h 48m" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly W/L Chart */}
        <div 
          className="p-6 rounded-lg"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
              📊 Weekly Performance
            </h3>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Last 7 days</span>
          </div>
          <div className="flex items-end gap-2 h-40">
            {weeklyData.map((d) => {
              const total = d.wins + d.losses;
              const winH = (d.wins / maxGames) * 100;
              const lossH = (d.losses / maxGames) * 100;
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col items-center gap-0.5" style={{ height: '130px' }}>
                    <div className="flex-1" />
                    <div
                      className="w-full max-w-6 rounded-t transition-all"
                      style={{ 
                        height: `${winH}%`,
                        backgroundColor: 'rgba(168, 85, 247, 0.6)',
                      }}
                      title={`${d.wins} wins`}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-primary)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(168, 85, 247, 0.6)'}
                    />
                    <div
                      className="w-full max-w-6 rounded-b transition-all"
                      style={{ 
                        height: `${lossH}%`,
                        backgroundColor: 'rgba(239, 68, 68, 0.4)',
                      }}
                      title={`${d.losses} losses`}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.6)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.4)'}
                    />
                  </div>
                  <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{d.day}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 justify-center text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'rgba(168, 85, 247, 0.6)' }} />
              Wins
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'rgba(239, 68, 68, 0.4)' }} />
              Losses
            </span>
          </div>
        </div>

        {/* Game Distribution */}
        <div 
          className="p-6 rounded-lg"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
              🥧 Game Distribution
            </h3>
          </div>
          <div className="flex items-center gap-6 mb-6">
            {/* Visual Pie (CSS) */}
            <div className="relative w-28 h-28 shrink-0">
              <div
                className="w-full h-full rounded-full"
                style={{
                  background: `conic-gradient(
                    var(--color-primary) 0% 75%,
                    #ec4899 75% 100%
                  )`,
                }}
              />
              <div 
                className="absolute inset-3 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--color-bg-card)' }}
              >
                <span className="text-sm font-mono font-bold" style={{ color: 'var(--color-text-primary)' }}>160</span>
              </div>
            </div>
            <div className="space-y-3 flex-1">
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'var(--color-primary)' }} />
                    Pong
                  </span>
                  <span className="font-mono" style={{ color: 'var(--color-primary)' }}>120 (75%)</span>
                </div>
                <ProgressBar value={75} color="purple" />
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#ec4899' }} />
                    Tic-Tac-Toe
                  </span>
                  <span className="font-mono" style={{ color: '#ec4899' }}>40 (25%)</span>
                </div>
                <ProgressBar value={25} color="pink" />
              </div>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div 
          className="p-6 rounded-lg"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
          }}
        >
          <h3 className="text-base font-semibold flex items-center gap-2 mb-4" style={{ color: 'var(--color-text-primary)' }}>
            📈 Performance Metrics
          </h3>
          <div className="space-y-4">
            {performanceMetrics.map((m) => (
              <div key={m.label} className="flex items-center justify-between">
                <div>
                  <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{m.label}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {m.value}
                  </span>
                  <span 
                    className="text-xs flex items-center gap-0.5"
                    style={{ color: m.positive ? 'var(--color-success)' : 'var(--color-error)' }}
                  >
                    {m.positive ? '📈' : '📉'}
                    {m.change}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Win Rate by Hour */}
        <div 
          className="p-6 rounded-lg"
          style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
          }}
        >
          <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
            Best Playing Times
          </h3>
          <div className="space-y-3">
            {[
              { time: 'Morning (6–12)', rate: 58, games: 18 },
              { time: 'Afternoon (12–18)', rate: 72, games: 45 },
              { time: 'Evening (18–24)', rate: 81, games: 70 },
              { time: 'Night (0–6)', rate: 45, games: 12 },
            ].map((slot) => (
              <div key={slot.time}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span style={{ color: 'var(--color-text-secondary)' }}>{slot.time}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {slot.games} games • {slot.rate}% WR
                  </span>
                </div>
                <ProgressBar
                  value={slot.rate}
                  color={slot.rate >= 70 ? 'purple' : slot.rate >= 50 ? 'cyan' : 'orange'}
                />
              </div>
            ))}
          </div>
          <p className="text-xs mt-3 text-center" style={{ color: 'var(--color-text-muted)' }}>
            🌙 You perform best in the evening!
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, trend, positive }: { 
  icon: string; 
  label: string; 
  value: string; 
  trend?: string; 
  positive?: boolean;
}) {
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
          <span 
            className="text-sm font-medium mb-1" 
            style={{ color: positive ? 'var(--color-success)' : 'var(--color-text-muted)' }}
          >
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}

function ProgressBar({ value, color }: { value: number; color: 'purple' | 'pink' | 'cyan' | 'orange' }) {
  const colors = {
    purple: 'linear-gradient(90deg, #a855f7 0%, #ec4899 100%)',
    pink: 'linear-gradient(90deg, #ec4899 0%, #f472b6 100%)',
    cyan: 'linear-gradient(90deg, #06b6d4 0%, #22d3ee 100%)',
    orange: 'linear-gradient(90deg, #fb923c 0%, #f59e0b 100%)',
  };

  return (
    <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-bg-input)' }}>
      <div 
        className="h-full rounded-full transition-all duration-500"
        style={{ 
          width: `${value}%`,
          background: colors[color],
        }}
      />
    </div>
  );
}