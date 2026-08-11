import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ChatAvatar from "./Chat/ChatAvatar";
import {
  IconCheck,
  IconChat,
  IconClose,
  IconGamepad,
  IconUserCheck,
  IconUserPlus,
} from "./Chat/ChatIcons";
import { IconBolt, IconInfo, IconLevelUp, IconTrophy } from "./notifications/NotificationIcons";

export type ToastVariant =
  | "success"
  | "info"
  | "friend"
  | "friend_accepted"
  | "invite"
  | "achievement"
  | "level"
  | "xp"
  | "message";

export interface ToastData {
  title: string;
  description?: string;
  variant?: ToastVariant;
  avatar?: string;
  duration?: number;
  onClick?: () => void;
}

interface VariantStyle {
  icon: React.ReactNode;
  color: string;
  rgb: string;
}

const VARIANT: Record<ToastVariant, VariantStyle> = {
  success:         { icon: <IconCheck size={18} />,      color: "var(--color-success)", rgb: "var(--color-success-rgb)" },
  info:            { icon: <IconInfo size={18} />,       color: "var(--color-info)",    rgb: "var(--color-info-rgb)" },
  friend:          { icon: <IconUserPlus size={18} />,   color: "var(--color-info)",    rgb: "var(--color-info-rgb)" },
  friend_accepted: { icon: <IconUserCheck size={18} />,  color: "var(--color-success)", rgb: "var(--color-success-rgb)" },
  invite:          { icon: <IconGamepad size={18} />,    color: "var(--color-primary)", rgb: "var(--color-primary-rgb)" },
  achievement:     { icon: <IconTrophy size={18} />,     color: "var(--color-warning)", rgb: "var(--color-warning-rgb)" },
  level:           { icon: <IconLevelUp size={18} />,    color: "var(--color-primary)", rgb: "var(--color-primary-rgb)" },
  xp:              { icon: <IconBolt size={18} />,       color: "var(--color-info)",    rgb: "var(--color-info-rgb)" },
  message:         { icon: <IconChat size={18} />,       color: "var(--color-primary)", rgb: "var(--color-primary-rgb)" },
};

interface ToastProps extends ToastData {
  onClose: () => void;
}

/**
 * A surface-coloured card with a variant-tinted icon chip and a countdown rail —
 * legible on either theme and quiet enough to stack.
 */
export default function Toast({
  title,
  description,
  variant = "info",
  avatar,
  duration = 4000,
  onClick,
  onClose,
}: ToastProps) {
  const { t } = useTranslation();
  const style = VARIANT[variant];
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const closedRef = useRef(false);

  const dismiss = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    setLeaving(true);
    setTimeout(onClose, 180);
  };

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(dismiss, duration);
    return () => clearTimeout(timer);
    // Re-arming on unpause deliberately restarts the remaining time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, paused]);

  return (
    <div
      className={leaving ? "toast-leave" : "toast-enter"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        onClick={onClick ? () => { onClick(); dismiss(); } : undefined}
        role={onClick ? "button" : "status"}
        className="relative w-[min(calc(100vw-2rem),22rem)] rounded-2xl overflow-hidden flex items-start gap-3 p-3 pr-9"
        style={{
          backgroundColor: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border)",
          boxShadow: `0 18px 45px -16px var(--color-shadow), 0 0 0 1px rgb(${style.rgb} / 0.14)`,
          cursor: onClick ? "pointer" : "default",
        }}
      >
        <span
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ backgroundColor: style.color }}
        />

        {avatar || variant === "message" ? (
          <ChatAvatar src={avatar} name={title} size={38} />
        ) : (
          <span
            className="w-[38px] h-[38px] rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `rgb(${style.rgb} / 0.14)`, color: style.color }}
          >
            {style.icon}
          </span>
        )}

        <div className="flex-1 min-w-0 py-0.5">
          <p className="text-[13px] font-semibold leading-snug text-primary break-words">{title}</p>
          {description && (
            <p className="text-[11.5px] leading-snug mt-0.5 text-muted break-words">{description}</p>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); dismiss(); }}
          aria-label={t("notifications.dismiss")}
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-colors hover:bg-surface-hover"
          style={{ color: "var(--color-text-muted)" }}
        >
          <IconClose size={13} />
        </button>

        <span
          className="absolute bottom-0 left-0 h-[2px] toast-progress"
          style={{
            backgroundColor: style.color,
            animationDuration: `${duration}ms`,
            animationPlayState: paused ? "paused" : "running",
          }}
        />
      </div>
    </div>
  );
}
