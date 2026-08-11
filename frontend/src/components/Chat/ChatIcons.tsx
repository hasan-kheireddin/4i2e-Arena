/**
 * Line-art SVG icon set for the chat surface.
 *
 * Every glyph inherits `currentColor` so it picks up the FireArena palette from
 * whatever element it sits in — no emoji, no raster assets.
 */

export interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}

function base(size: number, className?: string, strokeWidth = 2, style?: React.CSSProperties) {
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
    style,
    "aria-hidden": true,
    focusable: false as const,
  };
}

export function IconSearch({ size = 16, className, strokeWidth, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}

export function IconChat({ size = 20, className, strokeWidth, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export function IconChatFilled({ size = 22, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden
      focusable={false}
    >
      <path d="M12 3c-4.97 0-9 3.36-9 7.5 0 2.2 1.15 4.18 2.97 5.54.13.1.2.26.18.42l-.4 3.1a.6.6 0 0 0 .87.6l3.3-1.7c.13-.07.28-.09.42-.05.53.1 1.09.14 1.66.14 4.97 0 9-3.36 9-7.5S16.97 3 12 3z" />
    </svg>
  );
}

export function IconClose({ size = 18, className, strokeWidth, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function IconSend({ size = 18, className, strokeWidth, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <path d="M21.5 12 3.5 3.8l3 8.2-3 8.2z" />
      <line x1="6.5" y1="12" x2="21.5" y2="12" />
    </svg>
  );
}

/** Reaction / emote trigger — replaces the laughing-face emoji. */
export function IconReaction({ size = 18, className, strokeWidth, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.2 4.2 0 0 0 7 0" />
      <line x1="9" y1="9.5" x2="9.01" y2="9.5" />
      <line x1="15" y1="9.5" x2="15.01" y2="9.5" />
    </svg>
  );
}

/** Three-dot overflow menu — replaces the gear emoji inside a conversation. */
export function IconDots({ size = 18, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden
      focusable={false}
    >
      <circle cx="12" cy="5" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="12" cy="19" r="1.9" />
    </svg>
  );
}

/** Horizontal overflow menu — the profile-header variant of {@link IconDots}. */
export function IconDotsHorizontal({ size = 18, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden
      focusable={false}
    >
      <circle cx="5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="19" cy="12" r="1.9" />
    </svg>
  );
}

export function IconBell({ size = 16, className, strokeWidth, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function IconBellOff({ size = 16, className, strokeWidth, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
      <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
      <path d="M18 8a6 6 0 0 0-9.33-5" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export function IconBlock({ size = 16, className, strokeWidth, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <circle cx="12" cy="12" r="9" />
      <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
    </svg>
  );
}

export function IconUnblock({ size = 16, className, strokeWidth, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.2 12.2 2.6 2.6 5-5.4" />
    </svg>
  );
}

export function IconTrash({ size = 16, className, strokeWidth, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <path d="M3.5 6h17" />
      <path d="M8.5 6V4.5A1.5 1.5 0 0 1 10 3h4a1.5 1.5 0 0 1 1.5 1.5V6" />
      <path d="M18.5 6.5 18 19a2 2 0 0 1-2 1.9H8A2 2 0 0 1 6 19L5.5 6.5" />
      <line x1="10" y1="10.5" x2="10" y2="16.5" />
      <line x1="14" y1="10.5" x2="14" y2="16.5" />
    </svg>
  );
}

export function IconGamepad({ size = 16, className, strokeWidth, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <line x1="6.5" y1="11" x2="10.5" y2="11" />
      <line x1="8.5" y1="9" x2="8.5" y2="13" />
      <line x1="15.5" y1="10.5" x2="15.51" y2="10.5" />
      <line x1="17.8" y1="12.5" x2="17.81" y2="12.5" />
      <path d="M17.32 5H6.68a4 4 0 0 0-3.96 3.4l-1.2 7.2A3 3 0 0 0 4.48 19c1 0 1.7-.5 2.3-1.2L8.2 16h7.6l1.42 1.8c.6.7 1.3 1.2 2.3 1.2a3 3 0 0 0 2.96-3.4l-1.2-7.2A4 4 0 0 0 17.32 5z" />
    </svg>
  );
}

export function IconUser({ size = 16, className, strokeWidth, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function IconUserPlus({ size = 16, className, strokeWidth, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}

export function IconUserCheck({ size = 16, className, strokeWidth, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <polyline points="16 11.5 18.5 14 22.5 9.5" />
    </svg>
  );
}

export function IconUserMinus({ size = 16, className, strokeWidth, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}

export function IconClock({ size = 16, className, strokeWidth, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

export function IconArrowLeft({ size = 18, className, strokeWidth, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

export function IconCheck({ size = 14, className, strokeWidth = 2.4, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <polyline points="4 12.5 9 17.5 20 6.5" />
    </svg>
  );
}

export function IconCheckDouble({ size = 14, className, strokeWidth = 2.4, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <polyline points="1.5 12.5 6 17 15.5 7" />
      <polyline points="8.5 12.5 11 15 20.5 5.5" />
    </svg>
  );
}

export function IconEdit({ size = 18, className, strokeWidth, style }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth, style)}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}
