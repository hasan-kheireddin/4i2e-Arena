import { cn } from '@/lib/utils';

type BadgeVariant = 'online' | 'offline' | 'in-game' | 'live' | 'win' | 'loss' | 'draw' | 'info' | 'warning';

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string; dot?: string }> = {
  online:  { bg: 'bg-success/12', text: 'text-success', dot: 'bg-success' },
  offline: { bg: 'bg-muted/15', text: 'text-muted', dot: 'bg-muted' },
  'in-game': { bg: 'bg-brand/15', text: 'text-brand-light', dot: 'bg-brand-light' },
  live:    { bg: 'bg-error/12', text: 'text-error', dot: 'bg-error' },
  win:     { bg: 'bg-success/12', text: 'text-success' },
  loss:    { bg: 'bg-error/12', text: 'text-error' },
  draw:    { bg: 'bg-warning/12', text: 'text-warning' },
  info:    { bg: 'bg-info/12', text: 'text-info' },
  warning: { bg: 'bg-warning/12', text: 'text-warning' },
};

export function Badge({ variant, children, dot = false, className }: BadgeProps) {
  const style = variantStyles[variant];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wide uppercase',
        style.bg,
        style.text,
        className
      )}
    >
      {dot && style.dot && (
        <span className="relative flex h-1.5 w-1.5">
          {(variant === 'online' || variant === 'live') && (
            <span className={cn('absolute inset-0 rounded-full animate-ping', style.dot, 'opacity-60')} />
          )}
          <span className={cn('relative rounded-full h-1.5 w-1.5', style.dot)} />
        </span>
      )}
      {children}
    </span>
  );
}
