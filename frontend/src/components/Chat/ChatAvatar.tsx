interface ChatAvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  /** Renders the presence dot. Omit entirely to hide the dot. */
  online?: boolean;
  /** Colour the presence dot ring blends into (defaults to the card surface). */
  ringColor?: string;
  /** Draws a brand-gradient halo around the avatar (used by the active-now strip). */
  halo?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}

export default function ChatAvatar({
  src,
  name,
  size = 44,
  online,
  ringColor = "var(--color-bg-card)",
  halo = false,
  onClick,
  title,
  className = "",
}: ChatAvatarProps) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  const dot = Math.max(9, Math.round(size * 0.28));
  const inner = halo ? size - 6 : size;

  const face = src ? (
    <img
      src={src}
      alt=""
      className="rounded-full object-cover"
      style={{ width: inner, height: inner }}
      draggable={false}
    />
  ) : (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white select-none"
      style={{
        width: inner,
        height: inner,
        fontSize: Math.round(inner * 0.4),
        backgroundImage: "var(--gradient-brand)",
      }}
    >
      {initial}
    </div>
  );

  return (
    <div
      className={`relative flex-shrink-0 ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={{ width: size, height: size }}
      onClick={onClick}
      title={title}
    >
      {halo ? (
        <div
          className="rounded-full flex items-center justify-center"
          style={{
            width: size,
            height: size,
            padding: 2,
            backgroundImage: online ? "var(--gradient-brand)" : "none",
            backgroundColor: online ? undefined : "var(--color-border)",
          }}
        >
          <div
            className="rounded-full flex items-center justify-center"
            style={{ padding: 1, backgroundColor: "var(--color-bg-card)" }}
          >
            {face}
          </div>
        </div>
      ) : (
        face
      )}

      {online !== undefined && !halo && (
        <span
          className="absolute rounded-full"
          style={{
            width: dot,
            height: dot,
            insetInlineEnd: 0,
            bottom: 0,
            backgroundColor: online ? "var(--color-success)" : "var(--color-text-muted)",
            border: `2px solid ${ringColor}`,
            boxShadow: online ? "0 0 0 2px rgb(var(--color-success-rgb) / 0.18)" : undefined,
          }}
        />
      )}
    </div>
  );
}
