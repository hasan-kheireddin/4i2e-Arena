import type { Achievement } from "../services/analytics";

const CATEGORY_GLYPHS: Record<string, string> = {
  pong: "M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16l-4.8 2.6.9-5.4-3.9-3.8 5.4-.8L12 3z",
  tictactoe: "M7 8h10a2 2 0 012 2v4a2 2 0 01-2 2H7a2 2 0 01-2-2v-4a2 2 0 012-2zm1 2v4m8-4v4m-9 0h10",
};

export function categoryGlyph(category: Achievement["category"]): string {
  return CATEGORY_GLYPHS[category] ?? CATEGORY_GLYPHS.pong;
}

/** Category-based SVG badge used wherever an achievement is listed. */
export default function AchievementIcon({
  color,
  category,
  className = "h-6 w-6",
}: {
  color: string;
  category: Achievement["category"];
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill={color} opacity="0.16" />
      <path
        d={categoryGlyph(category)}
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
