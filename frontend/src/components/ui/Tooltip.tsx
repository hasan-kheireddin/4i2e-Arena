import React, { useState } from 'react';
import { cn } from '@/lib/utils';

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  placement?: TooltipPlacement;
  className?: string;
}

const placementClasses: Record<TooltipPlacement, { tooltip: string; arrow: string }> = {
  top: {
    tooltip: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    arrow: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-elevated',
  },
  bottom: {
    tooltip: 'top-full left-1/2 -translate-x-1/2 mt-2',
    arrow: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-elevated',
  },
  left: {
    tooltip: 'right-full top-1/2 -translate-y-1/2 mr-2',
    arrow: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-elevated',
  },
  right: {
    tooltip: 'left-full top-1/2 -translate-y-1/2 ml-2',
    arrow: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-elevated',
  },
};

export function Tooltip({ content, children, placement = 'top', className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const { tooltip, arrow } = placementClasses[placement];

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className={cn(
            'absolute z-50 pointer-events-none whitespace-nowrap',
            'rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-xs font-medium text-primary shadow-card',
            'animate-scale-in duration-150',
            tooltip,
            className
          )}
        >
          {content}
          <span className={cn('absolute w-0 h-0 border-4', arrow)} />
        </div>
      )}
    </div>
  );
}
