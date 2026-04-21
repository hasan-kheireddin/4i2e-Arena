import { cn, getInitials } from '@/lib/utils';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface AvatarProps {
  src?: string;
  name: string;
  size?: AvatarSize;
  online?: boolean;
  className?: string;
}

const sizeMap: Record<AvatarSize, { container: string; text: string; dot: string }> = {
  xs:  { container: 'w-6 h-6', text: 'text-[8px]', dot: 'w-1.5 h-1.5 border' },
  sm:  { container: 'w-8 h-8', text: 'text-[10px]', dot: 'w-2 h-2 border' },
  md:  { container: 'w-10 h-10', text: 'text-xs', dot: 'w-2.5 h-2.5 border-2' },
  lg:  { container: 'w-14 h-14', text: 'text-sm', dot: 'w-3 h-3 border-2' },
  xl:  { container: 'w-20 h-20', text: 'text-lg', dot: 'w-3.5 h-3.5 border-2' },
  '2xl': { container: 'w-[120px] h-[120px]', text: 'text-2xl', dot: 'w-4 h-4 border-2' },
};

export function Avatar({ src, name, size = 'md', online, className }: AvatarProps) {
  const s = sizeMap[size];
  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={cn(
            'rounded-full border-2 border-border object-cover',
            s.container
          )}
        />
      ) : (
        <div
          className={cn(
            'flex items-center justify-center rounded-full border-2 border-border bg-brand-gradient font-semibold text-white shadow-card',
            s.container,
            s.text
          )}
        >
          {getInitials(name)}
        </div>
      )}
      {online !== undefined && (
        <span
          className={cn(
            'absolute bottom-0 rounded-full border-2 border-surface',
            s.dot,
            online ? 'bg-success' : 'bg-muted'
          )}
          style={{ insetInlineEnd: 0 }}
        />
      )}
    </div>
  );
}
