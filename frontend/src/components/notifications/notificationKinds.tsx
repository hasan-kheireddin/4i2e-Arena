import { IconGamepad, IconUserCheck, IconUserPlus } from "@/components/Chat/ChatIcons";
import type { NotificationKind } from "@/context/NotificationCenterContext";
import { IconBolt, IconInfo, IconLevelUp, IconTrophy } from "./NotificationIcons";

export interface KindStyle {
  icon: React.ReactNode;
  /** CSS colour driving the badge fill and the toast accent. */
  color: string;
  /** RGB triplet var used for soft tints. */
  rgb: string;
  label: string;
}

export const KIND_STYLE: Record<NotificationKind, KindStyle> = {
  friend_request: {
    icon: <IconUserPlus size={12} strokeWidth={2.4} />,
    color: "var(--color-info)",
    rgb: "var(--color-info-rgb)",
    label: "Friend request",
  },
  friend_accepted: {
    icon: <IconUserCheck size={12} strokeWidth={2.4} />,
    color: "var(--color-success)",
    rgb: "var(--color-success-rgb)",
    label: "Friend",
  },
  invite: {
    icon: <IconGamepad size={12} strokeWidth={2.2} />,
    color: "var(--color-primary)",
    rgb: "var(--color-primary-rgb)",
    label: "Game invite",
  },
  achievement: {
    icon: <IconTrophy size={12} strokeWidth={2.2} />,
    color: "var(--color-warning)",
    rgb: "var(--color-warning-rgb)",
    label: "Achievement",
  },
  level: {
    icon: <IconLevelUp size={12} strokeWidth={2.6} />,
    color: "var(--color-primary)",
    rgb: "var(--color-primary-rgb)",
    label: "Level up",
  },
  xp: {
    icon: <IconBolt size={12} strokeWidth={2.2} />,
    color: "var(--color-info)",
    rgb: "var(--color-info-rgb)",
    label: "Experience",
  },
  system: {
    icon: <IconInfo size={12} strokeWidth={2.2} />,
    color: "var(--color-text-muted)",
    rgb: "var(--color-text-muted-rgb)",
    label: "Update",
  },
};

export function relativeTime(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 45) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(ts).toLocaleDateString([], { day: "numeric", month: "short" });
}
