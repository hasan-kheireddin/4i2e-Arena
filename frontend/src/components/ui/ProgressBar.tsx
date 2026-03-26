import { cn } from '@/lib/utils';

export interface ProgressBarProps {
  value: number; // 0-100
  max?: number;
  variant?: 'brand' | 'success' | 'warning' | 'error';
  color?: 'purple' | 'pink' | 'cyan' | 'orange';
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  showLabel?: boolean;
  label?: string;
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  variant = 'brand',
  color,
  size = 'md',
  animated = true,
  showLabel = false,
  label,
  className,
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const heightMap = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' };
  const fillColors = {
    brand: 'bg-brand-gradient-subtle',
    success: 'bg-success',
    warning: 'bg-warning',
    error: 'bg-error',
  };
  const colorMap: Record<string, string> = {
    purple: 'bg-brand',
    pink: 'bg-accent-pink',
    cyan: 'bg-accent-cyan',
    orange: 'bg-accent-orange',
  };
  const barColor = color ? colorMap[color] : fillColors[variant];

  return (
    <div className={cn('w-full', className)}>
      <div className={cn('w-full bg-surface rounded-full overflow-hidden', heightMap[size])}>
        <div
          className={cn(
            'h-full rounded-full transition-all',
            animated ? 'duration-1000 ease-out' : 'duration-0',
            barColor
          )}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
      {(showLabel || label) && (
        <div className="flex justify-between mt-1">
          {label ? (
            <span className="text-xs text-muted">{label}</span>
          ) : (
            <>
              <span className="text-xs text-muted">{value}</span>
              <span className="text-xs text-muted">{max}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
