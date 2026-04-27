import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type SpinnerVariant = 'brand' | 'white' | 'muted';

interface SpinnerProps {
  size?: SpinnerSize;
  variant?: SpinnerVariant;
  label?: string;
  className?: string;
}

const sizeClasses: Record<SpinnerSize, string> = {
  xs: 'h-3 w-3 border-[1.5px]',
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[3px]',
  xl: 'h-12 w-12 border-4',
};

const variantClasses: Record<SpinnerVariant, string> = {
  brand: 'border-brand/25 border-t-brand',
  white: 'border-white/25 border-t-white',
  muted: 'border-border/40 border-t-muted',
};

export function Spinner({ size = 'md', variant = 'brand', label, className }: SpinnerProps) {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      aria-label={label ?? t('loading.default')}
      className={cn('inline-flex flex-col items-center gap-2', className)}
    >
      <span
        className={cn(
          'rounded-full animate-spin',
          sizeClasses[size],
          variantClasses[variant]
        )}
      />
      {label && <span className="text-xs text-muted">{label}</span>}
    </div>
  );
}
