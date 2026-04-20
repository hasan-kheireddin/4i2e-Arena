import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useGameSocket } from "../hooks/useGameSocket";
import Toast from "./Toast";

type AchievementPayload = {
  name?: string;
  xp_reward?: number;
};

export default function GamificationNotifications() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [queue, setQueue] = useState<string[]>([]);
  const [activeToast, setActiveToast] = useState<string | null>(null);

  const enqueue = useCallback((message: string) => {
    setQueue((prev) => [...prev, message]);
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
        const name = achievement.name || "Achievement";
        const xpReward = Number(achievement.xp_reward ?? 0);
        enqueue(
          t("notifications.achievement_unlocked", {
            name,
            xp: xpReward,
            defaultValue: "Achievement unlocked: {{name}} (+{{xp}} XP)",
          }),
        );
        return;
      }

      if (type === "xp_gained") {
        const xpGained = Number(data.xp_gained ?? 0);
        if (xpGained > 0) {
          enqueue(
            t("notifications.xp_gained", {
              xp: xpGained,
              defaultValue: "+{{xp}} XP gained",
            }),
          );
        }
        return;
      }

      if (type === "level_up") {
        const newLevel = Number(data.new_level ?? 0);
        if (newLevel > 0) {
          enqueue(
            t("notifications.level_up", {
              level: newLevel,
              defaultValue: "Level up! You reached level {{level}}",
            }),
          );
        }
      }
    }, [enqueue, t]),
  });

  if (!activeToast) return null;

  return (
    <Toast
      message={activeToast}
      onClose={() => setActiveToast(null)}
      duration={3500}
    />
  );
}
