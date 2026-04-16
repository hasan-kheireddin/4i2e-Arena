import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  compact?: boolean;
  showWordmark?: boolean;
}

export function BrandLogo({ className, compact = false, showWordmark = true }: BrandLogoProps) {
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <div
        className={cn(
          "relative rounded-lg flex items-center justify-center overflow-hidden logo-fire-bg",
          compact ? "w-8 h-8" : "w-10 h-10"
        )}
        style={{ boxShadow: "0 8px 22px rgba(249, 115, 22, 0.35)" }}
      />

      {showWordmark && (
        <span className={cn("font-extrabold tracking-tight", compact ? "text-lg" : "text-xl")}>
          <span className="text-white drop-shadow-[0_0_6px_rgba(249,115,22,0.45)] mr-1">42</span>
          <span
            style={{
              background: "linear-gradient(135deg, #f97316 0%, #ef4444 65%, #f59e0b 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Arena
          </span>
        </span>
      )}
    </div>
  );
}
