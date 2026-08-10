import type { SVGProps } from 'react';

/**
 * Game glyphs drawn to match lucide-react: a 24x24 box, `currentColor`, and a
 * 2px round stroke, so they size and tint from the surrounding text styles the
 * same way every other icon in the app does.
 */
type GameIconProps = SVGProps<SVGSVGElement>;

const BASE_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

/** Both marks, not just the O — the game is X *and* O. */
export function TicTacToeIcon(props: GameIconProps) {
  return (
    <svg {...BASE_PROPS} {...props}>
      <line x1="2.5" y1="8" x2="10" y2="16" />
      <line x1="10" y1="8" x2="2.5" y2="16" />
      <circle cx="17.5" cy="12" r="4" />
    </svg>
  );
}

/** Two paddles, a centre line, and a ball in flight. */
export function PongIcon(props: GameIconProps) {
  return (
    <svg {...BASE_PROPS} {...props}>
      <line x1="4" y1="7" x2="4" y2="17" />
      <line x1="20" y1="7" x2="20" y2="17" />
      <line x1="12" y1="4" x2="12" y2="7" strokeOpacity="0.45" />
      <line x1="12" y1="17" x2="12" y2="20" strokeOpacity="0.45" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}
