import type { TFunction } from "i18next";
import { IconGamepad, IconUserCheck, IconUserPlus } from "@/components/Chat/ChatIcons";
import type { NotificationKind } from "@/context/NotificationCenterContext";
import { IconBolt, IconInfo, IconLevelUp, IconTrophy } from "./NotificationIcons";

export interface KindStyle {
  icon: React.ReactNode;
  /** CSS colour driving the badge fill and the toast accent. */
  color: string;
  /** RGB triplet var used for soft tints. */
  rgb: string;
  /** i18n key — resolved by the consumer, which has the live `t`. */
  labelKey: string;
}

export const KIND_STYLE: Record<NotificationKind, KindStyle> = {
  friend_request: {
    icon: <IconUserPlus size={12} strokeWidth={2.4} />,
    color: "var(--color-info)",
    rgb: "var(--color-info-rgb)",
    labelKey: "notifications.kind_friend_request",
  },
  friend_accepted: {
    icon: <IconUserCheck size={12} strokeWidth={2.4} />,
    color: "var(--color-success)",
    rgb: "var(--color-success-rgb)",
    labelKey: "notifications.kind_friend",
  },
  invite: {
    icon: <IconGamepad size={12} strokeWidth={2.2} />,
    color: "var(--color-primary)",
    rgb: "var(--color-primary-rgb)",
    labelKey: "notifications.kind_invite",
  },
  achievement: {
    icon: <IconTrophy size={12} strokeWidth={2.2} />,
    color: "var(--color-warning)",
    rgb: "var(--color-warning-rgb)",
    labelKey: "notifications.kind_achievement",
  },
  level: {
    icon: <IconLevelUp size={12} strokeWidth={2.6} />,
    color: "var(--color-primary)",
    rgb: "var(--color-primary-rgb)",
    labelKey: "notifications.kind_level",
  },
  xp: {
    icon: <IconBolt size={12} strokeWidth={2.2} />,
    color: "var(--color-info)",
    rgb: "var(--color-info-rgb)",
    labelKey: "notifications.kind_xp",
  },
  system: {
    icon: <IconInfo size={12} strokeWidth={2.2} />,
    color: "var(--color-text-muted)",
    rgb: "var(--color-text-muted-rgb)",
    labelKey: "notifications.kind_system",
  },
};

export function relativeTime(ts: number, t: TFunction): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 45) return t("notifications.time_just_now");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("notifications.time_minutes", { count: Math.max(1, minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("notifications.time_hours", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("notifications.time_days", { count: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return t("notifications.time_weeks", { count: weeks });
  return new Date(ts).toLocaleDateString([], { day: "numeric", month: "short" });
}
