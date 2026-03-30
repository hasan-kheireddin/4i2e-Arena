/**
 * JS/TS color constants for Canvas 2D contexts and any place where
 * CSS variables or Tailwind classes are not accessible.
 *
 * For JSX styling, always prefer CSS variables (var(--color-*)) or Tailwind classes.
 * Change colors here and in index.css — nowhere else.
 */

/** Colors used by the Pong canvas renderer */
export const CANVAS_COLORS = {
  BG:             '#0a0e1a',
  BALL:           '#ffffff',
  NET:            'rgba(255, 255, 255, 0.1)',
  SCORE:          'rgba(255, 255, 255, 0.8)',
  PADDLE_P1_START: '#1D4ED8',
  PADDLE_P1_END:   '#3B82F6',
  PADDLE_P2_START: '#DC2626',
  PADDLE_P2_END:   '#EF4444',
} as const;

/**
 * Rank medal colors for leaderboards.
 * Index corresponds to rank position (1 = gold, 2 = silver, 3 = bronze).
 */
export const RANK_COLORS: Readonly<Record<number, string>> = {
  1: '#fbbf24',  // gold   (amber-400)
  2: '#94a3b8',  // silver (slate-400)
  3: '#fb923c',  // bronze (orange-400)
};

/**
 * Match outcome colors for use in JS expressions.
 * In JSX, prefer: text-success, text-error, text-warning Tailwind classes.
 */
export const RESULT_COLORS = {
  WIN:  'var(--color-success)',
  LOSS: 'var(--color-error)',
  DRAW: 'var(--color-warning)',
} as const;
