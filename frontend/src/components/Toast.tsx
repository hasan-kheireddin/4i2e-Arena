import { useEffect } from "react";

interface ToastProps {
  message: string;
  onClose: () => void;
  duration?: number;
  position?: "bottom-end" | "center";
  tone?: "success" | "achievement";
}

export default function Toast({
  message,
  onClose,
  duration = 2000,
  position = "bottom-end",
  tone = "success",
}: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const isCenter = position === "center";
  const backgroundColor = tone === "achievement"
    ? "rgba(17,24,39,0.95)"
    : "var(--color-success)";

  return (
    <div
      className="fixed z-50 animate-slideUp"
      style={isCenter
        ? { inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }
        : { bottom: "1.5rem", insetInlineEnd: "1.5rem" }}
    >
      <div
        className="px-4 py-3 rounded-lg shadow-lg flex items-center gap-3"
        style={{
          backgroundColor,
          color: "#ffffff",
          border: tone === "achievement" ? "1px solid rgba(250,204,21,0.75)" : "none",
          boxShadow: tone === "achievement"
            ? "0 16px 40px rgba(0,0,0,0.45)"
            : undefined,
        }}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="font-medium">{message}</span>
      </div>
    </div>
  );
}
