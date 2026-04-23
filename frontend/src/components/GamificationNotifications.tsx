import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useGameSocket } from "../hooks/useGameSocket";
import Toast from "./Toast";

type AchievementPayload = {
  name?: string;
  xp_reward?: number;
};

type NotificationItem = {
  message: string;
  kind: "achievement" | "xp" | "level";
};

export default function GamificationNotifications() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [queue, setQueue] = useState<NotificationItem[]>([]);
  const [activeToast, setActiveToast] = useState<NotificationItem | null>(null);

  const enqueue = useCallback((item: NotificationItem) => {
    setQueue((prev) => [...prev, item]);
  }, []);

  useEffect(() => {
    if (activeToast || queue.length === 0) return;
    setActiveToast(queue[0]);
    setQueue((prev) => prev.slice(1));
  }, [activeToast, queue]);

  useGameSocket(isAuthenticated ? "/ws/notifications/" : null, {
    onMessage: useCallback((data: Record<string, unknown>) => {
      const type = typeof data.type === "string" ? data.type : "";
      if (type === "connected") {
        return;
      }

      if (type === "achievement_unlocked") {
        const achievement = (data.achievement as AchievementPayload | undefined) ?? {};
        const name = achievement.name || t("notifications.achievement_fallback_name");
        const xpReward = Number(achievement.xp_reward ?? 0);
        enqueue({
          kind: "achievement",
          message: t("notifications.achievement_unlocked", {
            name,
            xp: xpReward,
          }),
        });
        return;
      }

      if (type === "xp_gained") {
        const xpGained = Number(data.xp_gained ?? 0);
        if (xpGained > 0) {
          enqueue({
            kind: "xp",
            message: t("notifications.xp_gained", {
              xp: xpGained,
            }),
          });
        }
        return;
      }

      if (type === "level_up") {
        const newLevel = Number(data.new_level ?? 0);
        if (newLevel > 0) {
          enqueue({
            kind: "level",
            message: t("notifications.level_up", {
              level: newLevel,
            }),
          });
        }
      }
    }, [enqueue, t]),
  });

  if (!activeToast) return null;

  return (
    <Toast
      message={activeToast.message}
      onClose={() => setActiveToast(null)}
      duration={activeToast.kind === "achievement" ? 4500 : 3500}
      position={activeToast.kind === "achievement" ? "center" : "bottom-end"}
      tone={activeToast.kind === "achievement" ? "achievement" : "success"}
    />
  );
}
