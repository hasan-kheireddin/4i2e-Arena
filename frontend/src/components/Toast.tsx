import { useEffect } from "react";

type ToastIcon = "success" | "achievement" | "game" | "friend" | "xp";

interface ToastProps {
  message: string;
  onClose: () => void;
  onClick?: () => void;
  duration?: number;
  position?: "bottom-end" | "center";
  tone?: "success" | "achievement" | "message";
  icon?: ToastIcon;
  avatar?: string;
}

const ICONS: Record<ToastIcon, React.ReactNode> = {
  success: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  xp: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  achievement: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="rgba(250,204,21,0.3)" stroke="rgba(250,204,21,0.9)" />
    </svg>
  ),
  game: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="6" cy="12" r="1.5" fill="currentColor" />
      <circle cx="18" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="10" r="1.5" fill="currentColor" />
      <circle cx="12" cy="14" r="1.5" fill="currentColor" />
    </svg>
  ),
  friend: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
};

export default function Toast({
  message,
  onClose,
  onClick,
  duration = 2000,
  position = "bottom-end",
  tone = "success",
  icon,
  avatar,
}: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const isCenter = position === "center";
  const backgroundColor = tone === "achievement"
    ? "rgba(17,24,39,0.95)"
    : tone === "message"
    ? "rgba(30,30,35,0.95)"
    : "var(--color-success)";

  return (
    <div
      className="fixed z-50 animate-slideUp"
      style={isCenter
        ? { inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }
        : { bottom: "5rem", insetInlineEnd: "1.5rem" }}
    >
      <div
        onClick={onClick}
        className="px-4 py-3 rounded-lg shadow-lg flex items-center gap-3"
        style={{
          backgroundColor,
          color: "#ffffff",
          cursor: onClick ? "pointer" : undefined,
          border: tone === "achievement" ? "1px solid rgba(250,204,21,0.75)" : "none",
          boxShadow: tone === "achievement"
            ? "0 16px 40px rgba(0,0,0,0.45)"
            : undefined,
        }}
      >
        {avatar ? (
          <img src={avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
        ) : icon ? (
          ICONS[icon]
        ) : tone !== "message" ? (
          ICONS.success
        ) : (
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ backgroundColor: "var(--color-primary)" }}>
            {message.charAt(0)?.toUpperCase()}
          </div>
        )}
        <span className="font-medium">{message}</span>
      </div>
    </div>
  );
}
