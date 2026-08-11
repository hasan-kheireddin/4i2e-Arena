import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useGameSocket } from "../hooks/useGameSocket";
import { useNotificationCenter } from "../context/NotificationCenterContext";
import { useToast } from "../context/ToastContext";

type AchievementPayload = {
  id?: string | number;
  name?: string;
  description?: string;
  xp_reward?: number;
};

/**
 * Listens on the gamification socket and turns rewards into toasts plus durable
 * notification-centre entries. Renders nothing itself.
 */
export default function GamificationNotifications() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotificationCenter();
  const { showToast } = useToast();

  useGameSocket(isAuthenticated ? "/ws/notifications/" : null, {
    onMessage: useCallback((data: Record<string, unknown>) => {
      const type = typeof data.type === "string" ? data.type : "";

      if (type === "achievement_unlocked") {
        const achievement = (data.achievement as AchievementPayload | undefined) ?? {};
        const name = achievement.name || t("notifications.achievement_fallback_name");
        const xpReward = Number(achievement.xp_reward ?? 0);
        showToast({
          title: t("notifications.toast_achievement", { name }),
          description: xpReward > 0 ? t("notifications.toast_xp_earned", { xp: xpReward }) : undefined,
          variant: "achievement",
          duration: 5000,
          onClick: () => navigate("/achievements"),
        });
        addNotification({
          kind: "achievement",
          title: t("notifications.entry_unlocked", { name }),
          body: xpReward > 0 ? t("notifications.entry_xp_reward", { xp: xpReward }) : undefined,
          link: "/achievements",
          dedupeKey: `achievement-${achievement.id ?? name}`,
        });
        return;
      }

      if (type === "xp_gained") {
        const xpGained = Number(data.xp_gained ?? 0);
        if (xpGained > 0) {
          // Frequent and low-stakes: a toast is enough, no permanent entry.
          showToast({
            title: t("notifications.xp_gained", { xp: xpGained }),
            variant: "xp",
            duration: 2800,
          });
        }
        return;
      }

      if (type === "level_up") {
        const newLevel = Number(data.new_level ?? 0);
        if (newLevel > 0) {
          showToast({
            title: t("notifications.level_up", { level: newLevel }),
            description: t("notifications.toast_keep_playing"),
            variant: "level",
            duration: 4500,
            onClick: () => navigate("/leaderboard"),
          });
          addNotification({
            kind: "level",
            title: t("notifications.entry_reached_level", { level: newLevel }),
            link: "/leaderboard",
            dedupeKey: `level-${newLevel}`,
          });
        }
      }
    }, [t, addNotification, navigate, showToast]),
  });

  return null;
}
