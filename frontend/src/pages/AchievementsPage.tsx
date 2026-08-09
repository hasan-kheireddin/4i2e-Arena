import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Award, Trophy, Unlock } from "lucide-react";
import {
  getAchievements,
  getAchievementStats,
  getMyXP,
  type Achievement,
  type AchievementStats,
} from "../services/analytics";

type StatusFilter = "all" | "unlocked" | "locked";

const TIER_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  common: { color: "#94a3b8", bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.35)" },
  rare: { color: "#3b82f6", bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.35)" },
  epic: { color: "#a855f7", bg: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.35)" },
  legendary: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)" },
};

function categoryGlyph(category: Achievement["category"]): string {
  switch (category) {
    case "pong":
      return "M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16l-4.8 2.6.9-5.4-3.9-3.8 5.4-.8L12 3z";
    case "tictactoe":
      return "M7 8h10a2 2 0 012 2v4a2 2 0 01-2 2H7a2 2 0 01-2-2v-4a2 2 0 012-2zm1 2v4m8-4v4m-9 0h10";
    case "level":
      return "M12 3l8 4v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V7l8-4z";
    default:
      return "M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16l-4.8 2.6.9-5.4-3.9-3.8 5.4-.8L12 3z";
  }
}

function AchievementSvgIcon({
  color,
  category,
}: {
  color: string;
  category: Achievement["category"];
}) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill={color} opacity="0.16" />
      <path
        d={categoryGlyph(category)}
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The API serves achievement names and descriptions in English only, so they
 * would stay English on every language switch. Translate them by their stable
 * `key`, falling back to the API text for any achievement seeded after the
 * catalog was last translated.
 */
function useAchievementText() {
  const { t } = useTranslation();
  return (achievement: Achievement) => ({
    name: t(`achievement_catalog.${achievement.key}.name`, {
      defaultValue: achievement.name,
    }),
    description: t(`achievement_catalog.${achievement.key}.description`, {
      defaultValue: achievement.description,
    }),
  });
}

export default function AchievementsPage() {
  const { t, i18n } = useTranslation();
  const achievementText = useAchievementText();
  const [loading, setLoading] = useState(true);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [stats, setStats] = useState<AchievementStats | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [achievementData, statsData, xpData] = await Promise.all([
          getAchievements(),
          getAchievementStats(),
          getMyXP(),
        ]);
        if (cancelled) return;
        setAchievements(achievementData);
        setStats(statsData);
        setRank(xpData.rank);
      } catch {
        if (cancelled) return;
        setAchievements([]);
        setStats(null);
        setRank(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    const values = new Set(achievements.map((a) => a.category));
    return Array.from(values).sort();
  }, [achievements]);

  const filteredAchievements = useMemo(() => {
    return achievements.filter((achievement) => {
      if (statusFilter === "unlocked" && !achievement.is_unlocked) return false;
      if (statusFilter === "locked" && achievement.is_unlocked) return false;
      if (categoryFilter !== "all" && achievement.category !== categoryFilter) return false;
      return true;
    });
  }, [achievements, statusFilter, categoryFilter]);

  const tierEntries = useMemo(
    () =>
      stats
        ? Object.entries(stats.by_rarity).sort(([a], [b]) => {
            const order = ["common", "rare", "epic", "legendary"];
            return order.indexOf(a) - order.indexOf(b);
          })
        : [],
    [stats],
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-10 w-10 animate-spin rounded-full border-4"
            style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }}
          />
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {t("achievements_page.loading")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          {t("achievements_page.title")}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          {t("achievements_page.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard
          label={t("achievements_page.summary_unlocked")}
          value={`${stats?.unlocked_count ?? 0}/${stats?.total_achievements ?? 0}`}
          icon={<Unlock className="h-4 w-4" />}
          color="#22c55e"
        />
        <SummaryCard
          label={t("achievements_page.summary_completion")}
          value={`${Math.round(stats?.completion_percentage ?? 0)}%`}
          icon={<Award className="h-4 w-4" />}
          color="#f59e0b"
        />
        <SummaryCard
          label={t("achievements_page.summary_xp")}
          value={(stats?.total_xp_from_achievements ?? 0).toLocaleString()}
          icon={<Trophy className="h-4 w-4" />}
          color="#a855f7"
        />
        <SummaryCard
          label={t("achievements_page.summary_rank")}
          value={rank ? `#${rank}` : "—"}
          icon={<Trophy className="h-4 w-4" />}
          color="#06b6d4"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl p-4" style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
        <div className="flex flex-wrap gap-2">
          {(["all", "unlocked", "locked"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
              style={{
                backgroundColor: statusFilter === status ? "var(--color-primary)" : "transparent",
                color: statusFilter === status ? "#fff" : "var(--color-text-secondary)",
                border: statusFilter === status ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
              }}
            >
              {t(`achievements_page.status_${status}`)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryFilter("all")}
            className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
            style={{
              backgroundColor: categoryFilter === "all" ? "rgba(168,85,247,0.14)" : "transparent",
              color: categoryFilter === "all" ? "var(--color-primary)" : "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
            }}
          >
            {t("achievements_page.category_all")}
          </button>
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setCategoryFilter(category)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
              style={{
                backgroundColor: categoryFilter === category ? "rgba(168,85,247,0.14)" : "transparent",
                color: categoryFilter === category ? "var(--color-primary)" : "var(--color-text-secondary)",
                border: "1px solid var(--color-border)",
              }}
            >
              {t(`achievements_page.category.${category}`)}
            </button>
          ))}
        </div>
      </div>

      {tierEntries.length > 0 && (
        <div className="rounded-xl p-4" style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
          <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {t("achievements_page.tiers_title")}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {tierEntries.map(([tier, data]) => {
              const style = TIER_STYLES[tier] ?? TIER_STYLES.common;
              const percentage = data.total > 0 ? (data.unlocked / data.total) * 100 : 0;
              return (
                <div key={tier} className="rounded-lg p-3" style={{ border: "1px solid var(--color-border)" }}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-semibold" style={{ color: style.color }}>
                      {t(`achievements_page.rarity.${tier}`)}
                    </span>
                    <bdi style={{ color: "var(--color-text-muted)" }}>
                      {data.unlocked}/{data.total}
                    </bdi>
                  </div>
                  <div className="h-2 rounded-full" style={{ backgroundColor: "var(--color-bg-input)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%`, backgroundColor: style.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {t("achievements_page.list_title")}
        </h2>
        {filteredAchievements.length === 0 ? (
          <div
            className="rounded-xl p-10 text-center text-sm"
            style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
          >
            {t("achievements_page.empty")}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredAchievements.map((achievement) => {
              const text = achievementText(achievement);
              const tierStyle = TIER_STYLES[achievement.rarity] ?? TIER_STYLES.common;
              const progress = Math.max(0, Math.min(100, Number(achievement.progress_percentage ?? 0)));
              const unlockedOn = achievement.unlocked_at
                ? new Date(achievement.unlocked_at).toLocaleDateString(i18n.resolvedLanguage || undefined)
                : null;

              return (
                <article
                  key={achievement.id}
                  className="rounded-xl p-4 transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                    backgroundColor: "var(--color-bg-card)",
                    border: `1px solid ${achievement.is_unlocked ? tierStyle.border : "var(--color-border)"}`,
                  }}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-lg"
                        style={{ backgroundColor: tierStyle.bg, color: tierStyle.color }}
                      >
                        <AchievementSvgIcon color={tierStyle.color} category={achievement.category} />
                      </div>
                      <div className="min-w-0">
                        {/* dir="auto" so an untranslated English fallback still
                            reads left-to-right inside the Arabic RTL page. */}
                        <p dir="auto" className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                          {text.name}
                        </p>
                        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {t(`achievements_page.category.${achievement.category}`)}
                        </p>
                      </div>
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={{ backgroundColor: tierStyle.bg, color: tierStyle.color }}
                    >
                      {t(`achievements_page.rarity.${achievement.rarity}`)}
                    </span>
                  </div>

                  <p dir="auto" className="mb-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                    {text.description}
                  </p>

                  <div className="mb-3">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span style={{ color: "var(--color-text-muted)" }}>{t("achievements_page.progress")}</span>
                      <bdi style={{ color: "var(--color-text-secondary)" }}>
                        {t("achievements_page.progress_value", {
                          current: achievement.progress_current,
                          threshold: achievement.threshold,
                        })}
                      </bdi>
                    </div>
                    <div className="h-2 rounded-full" style={{ backgroundColor: "var(--color-bg-input)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${progress}%`, backgroundColor: achievement.is_unlocked ? tierStyle.color : "var(--color-primary)" }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <bdi className="text-xs font-semibold" style={{ color: "var(--color-success)" }}>
                      +{achievement.xp_reward} XP
                    </bdi>
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {achievement.is_unlocked
                        ? t("achievements_page.unlocked_label")
                        : t("achievements_page.locked_label")}
                    </span>
                  </div>

                  {unlockedOn && (
                    <p dir="auto" className="mt-2 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                      {t("achievements_page.unlocked_on", { date: unlockedOn })}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
        <span style={{ color }}>{icon}</span>
        <span>{label}</span>
      </div>
      {/* bdi: "3/28" and "#12" are digits and neutrals only, which an RTL page
          would otherwise reorder into "28/3". */}
      <bdi className="block text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
        {value}
      </bdi>
    </div>
  );
}
