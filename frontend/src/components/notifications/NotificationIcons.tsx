/**
 * Glyphs unique to the notification surface. People/game icons come from the
 * shared line set in `components/Chat/ChatIcons`.
 */

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

function base(size: number, className?: string, strokeWidth = 2) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
    focusable: false as const,
  };
}

export function IconTrophy({ size = 16, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H4.5A1.5 1.5 0 0 0 3 7.5C3 9.4 4.6 11 6.5 11H7" />
      <path d="M17 6h2.5A1.5 1.5 0 0 1 21 7.5c0 1.9-1.6 3.5-3.5 3.5H17" />
      <line x1="12" y1="14" x2="12" y2="17" />
      <path d="M8.5 20.5h7l-.6-2a1.5 1.5 0 0 0-1.4-1h-3a1.5 1.5 0 0 0-1.4 1z" />
    </svg>
  );
}

export function IconBolt({ size = 16, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" />
    </svg>
  );
}

export function IconLevelUp({ size = 16, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <polyline points="6 12.5 12 6.5 18 12.5" />
      <polyline points="6 18.5 12 12.5 18 18.5" />
    </svg>
  );
}

export function IconInbox({ size = 22, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <path d="M21 12h-5l-1.5 3h-5L8 12H3" />
      <path d="M5.5 5h13l2.5 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" />
    </svg>
  );
}

export function IconInfo({ size = 16, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <line x1="12" y1="7.5" x2="12.01" y2="7.5" />
    </svg>
  );
}

export function IconBellRinging({ size = 18, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function IconMailOpen({ size = 16, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <path d="M3 10.5 12 4l9 6.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="3 10.5 12 16 21 10.5" />
    </svg>
  );
}

export function IconSweep({ size = 16, className, strokeWidth }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <path d="M3.5 6h17" />
      <path d="M8.5 6V4.5A1.5 1.5 0 0 1 10 3h4a1.5 1.5 0 0 1 1.5 1.5V6" />
      <path d="M18.5 6.5 18 19a2 2 0 0 1-2 1.9H8A2 2 0 0 1 6 19L5.5 6.5" />
    </svg>
  );
}
