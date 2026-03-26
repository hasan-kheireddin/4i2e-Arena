import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'featured' | 'stat' | 'interactive';
  className?: string;
  onClick?: () => void;
}

export function Card({ children, variant = 'default', className, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-surface border border-white/[0.06] rounded-xl p-5 card-highlight transition-all duration-250',
        variant === 'interactive' && 'cursor-pointer hover:border-white/[0.12] hover:shadow-lg hover:-translate-y-0.5',
        variant === 'featured' && 'border-gradient',
        variant === 'stat' && 'p-4 text-center',
        onClick && 'cursor-pointer hover:border-white/[0.12] hover:shadow-lg hover:-translate-y-0.5',
        className
      )}
    >
      {children}
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  trend?: { value: string | number; positive: boolean };
  iconColor?: string;
}

export function StatCard({ icon, label, value, trend, iconColor = 'text-brand-light' }: StatCardProps) {
  return (
    <Card variant="stat" className="flex flex-col items-center gap-2">
      <div className={cn('p-2 rounded-lg bg-brand/10', iconColor)}>{icon}</div>
      <p className="text-xs text-secondary uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold font-mono text-primary">{value}</p>
      {trend && (
        <p className={cn('text-xs font-medium', trend.positive ? 'text-success' : 'text-error')}>
          {trend.positive ? '▲' : '▼'} {typeof trend.value === 'number' ? `${Math.abs(trend.value)}%` : trend.value}
        </p>
      )}
    </Card>
  );
}
