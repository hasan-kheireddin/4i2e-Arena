import { useState, useEffect } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { getMyStats, getMyMatches, type UserStats, type Match } from "../services/games";
import {
  getMyXP, getAchievementStats, getUnlockedAchievements,
  type UserXPDetail, type AchievementStats, type AchievementUnlock,
} from "../services/analytics";
import {
  Trophy, Flame, TrendingUp, Sword, Star,
  Clock, Target, Zap, ShieldCheck,
} from "lucide-react";
import { Avatar } from "../components/ui/Avatar";

function timeAgo(iso: string, t: TFunction): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return t("home.time_just_now");
  if (h < 24) return t("home.time_hours_ago", { count: h });
  return t("home.time_days_ago", { count: Math.floor(h / 24) });
}

const TIER_COLORS: Record<string, string> = {
  bronze: "#b45309",
  silver: "#94a3b8",
  gold: "#fbbf24",
  platinum: "#06b6d4",
};

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [xp, setXp] = useState<UserXPDetail | null>(null);
  const [achStats, setAchStats] = useState<AchievementStats | null>(null);
  const [recentUnlocks, setRecentUnlocks] = useState<AchievementUnlock[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [statsRes, xpRes, achRes, unlocksRes, matchRes] = await Promise.all([
          getMyStats("pong"),
          getMyXP(),
          getAchievementStats(),
          getUnlockedAchievements(),
          getMyMatches({ game_type: "pong", page_size: 8 }),
        ]);
        if (cancelled) return;
        setStats(statsRes);
        setXp(xpRes);
        setAchStats(achRes);
        setRecentUnlocks(unlocksRes.slice(0, 4));
        setMatches(matchRes.results);
      } catch {
        // silently fallback to empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const pongStats = stats?.by_game_type?.["pong"];
  const totalGames    = pongStats?.total ?? 0;
  const wins          = pongStats?.wins  ?? 0;
  const losses        = pongStats?.losses ?? 0;
  const draws         = pongStats?.draws ?? 0;
  const winRate       = pongStats ? Math.round(pongStats.win_rate * 100) : 0;
  const avgScore      = pongStats ? pongStats.avg_score.toFixed(1) : "0.0";
  const streak        = stats?.streaks.current.count ?? 0;
  const streakType    = stats?.streaks.current.type ?? "none";
  const longestWin    = stats?.streaks.longest_win ?? 0;

  const totalXp = xp?.xp ?? 0;
  const level   = xp?.level ?? 1;
  const xpInLevel = xp?.level_info?.xp_in_level ?? 0;
  const xpNeeded = xp?.level_info?.xp_needed ?? 0;
  const xpRemaining = Math.max(xpNeeded - xpInLevel, 0);
  const xpProgress = xpNeeded > 0 ? Math.min((xpInLevel / xpNeeded) * 100, 100) : 100;
  const nextLevel = xpNeeded > 0 ? level + 1 : level;

  const recentForm = stats?.recent_form ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn">

      {/* ── Profile Header ─────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl p-8"
        style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(236,72,153,0.08) 100%)", border: "1px solid rgba(168,85,247,0.2)" }}
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="relative shrink-0">
            <Avatar name={user?.display_name || user?.username || ""} size="xl" online />
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>
              {level}
            </div>
          </div>

          <div className="flex-1 min-w-0 text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-extrabold" style={{ color: "var(--color-text-primary)" }}>
              {user?.display_name || user?.username}
            </h1>
            <p className="text-sm mb-3" style={{ color: "var(--color-text-muted)" }}>@{user?.username}</p>

            {/* XP Bar */}
            <div className="max-w-xs mx-auto sm:mx-0">
              <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                <span>{t("profile.level_xp", { level, xp: totalXp.toLocaleString() })}</span>
                <span>{t("profile.xp_to_level", { remaining: xpRemaining, next: nextLevel })}</span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-bg-input)" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${xpProgress}%`, background: "linear-gradient(90deg,#a855f7,#ec4899)" }} />
              </div>
            </div>
          </div>

          {/* Rank badge */}
          <div className="text-center shrink-0 px-6 py-4 rounded-xl"
            style={{ backgroundColor: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.25)" }}>
            <div className="text-3xl font-extrabold"
              style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              #{xp?.rank ?? "–"}
            </div>
            <div className="text-xs font-medium mt-0.5" style={{ color: "var(--color-text-muted)" }}>{t("profile.global_rank")}</div>
          </div>
        </div>
      </div>

      {/* ── Pong Analytics Grid ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(#a855f7,#ec4899)" }} />
          <h2 className="text-base font-bold uppercase tracking-wider" style={{ color: "var(--color-text-primary)" }}>
            {t("profile.pong_analytics")}
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <AnalyticCard icon={<Trophy className="w-5 h-5" />} label={t("profile.wins")} value={String(wins)} sub={t("profile.of_games", { total: totalGames })} color="#a855f7" />
          <AnalyticCard icon={<TrendingUp className="w-5 h-5" />} label={t("profile.win_rate")} value={`${winRate}%`} sub={`${losses}L · ${draws}D`} color="#ec4899" />
          <AnalyticCard icon={<Flame className="w-5 h-5" />} label={t("profile.current_streak")} value={String(streak)} sub={streakType !== "none" ? streakType : t("profile.no_streak")} color={streakType === "win" ? "#22c55e" : streakType === "loss" ? "#ef4444" : "#71717a"} />
          <AnalyticCard icon={<Target className="w-5 h-5" />} label={t("profile.avg_score")} value={avgScore} sub={t("profile.best_streak", { count: longestWin })} color="#06b6d4" />
        </div>

        {/* Performance Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* W/L/D Bar */}
          <div className="p-5 rounded-xl md:col-span-2"
            style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
              <Sword className="w-4 h-4" style={{ color: "#a855f7" }} /> {t("profile.match_breakdown")}
            </h3>
            {totalGames === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{t("profile.no_games")}</p>
            ) : (
              <>
                {/* Bar */}
                <div className="flex h-4 rounded-full overflow-hidden mb-3 gap-0.5">
                  {wins > 0 && (
                    <div className="transition-all duration-700 rounded-l-full" title={`${wins} wins`}
                      style={{ width: `${(wins / totalGames) * 100}%`, background: "linear-gradient(90deg,#22c55e,#16a34a)" }} />
                  )}
                  {draws > 0 && (
                    <div title={`${draws} draws`}
                      style={{ width: `${(draws / totalGames) * 100}%`, backgroundColor: "#f59e0b" }} />
                  )}
                  {losses > 0 && (
                    <div className="transition-all duration-700 rounded-r-full" title={`${losses} losses`}
                      style={{ width: `${(losses / totalGames) * 100}%`, background: "linear-gradient(90deg,#dc2626,#ef4444)" }} />
                  )}
                </div>
                <div className="flex gap-6 text-sm">
                  {[
                    { labelKey: "profile.wins",   val: wins,   color: "#22c55e" },
                    { labelKey: "profile.draws",  val: draws,  color: "#f59e0b" },
                    { labelKey: "profile.losses", val: losses, color: "#ef4444" },
                  ].map(({ labelKey, val, color }) => (
                    <div key={labelKey} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span style={{ color: "var(--color-text-secondary)" }}>{t(labelKey)}: </span>
                      <span className="font-bold" style={{ color }}>{val}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Recent form */}
            {recentForm.length > 0 && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--color-border)" }}>
                <p className="text-xs font-medium mb-2" style={{ color: "var(--color-text-muted)" }}>{t("profile.recent_form")}</p>
                <div className="flex gap-1.5">
                  {recentForm.slice(-10).map((r, i) => (
                    <div key={i} className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: r === "W" ? "#22c55e" : r === "L" ? "#ef4444" : "#f59e0b" }}>
                      {r}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* XP Sources */}
          <div className="p-5 rounded-xl"
            style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
              <Zap className="w-4 h-4" style={{ color: "#f59e0b" }} /> {t("profile.xp_sources")}
            </h3>
            <div className="space-y-3">
              {[
                { labelKey: "profile.from_games",    val: wins * 50 + losses * 10, max: Math.max(wins * 50 + losses * 10, 100), color: "#a855f7" },
                { labelKey: "profile.win_bonus",     val: wins * 25,               max: Math.max(wins * 25, 50),               color: "#ec4899" },
                { labelKey: "profile.streak_bonus",  val: streak * 15,             max: Math.max(streak * 15, 30),             color: "#f97316" },
              ].map(({ labelKey, val, max, color }) => (
                <div key={labelKey}>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: "var(--color-text-secondary)" }}>{t(labelKey)}</span>
                    <span className="font-mono" style={{ color }}>{val.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-bg-input)" }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${max > 0 ? Math.min((val / max) * 100, 100) : 0}%`, backgroundColor: color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Pong Matches */}
        <div className="p-5 rounded-xl"
          style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
            <Clock className="w-4 h-4" style={{ color: "#a855f7" }} /> {t("profile.recent_pong")}
          </h3>
          {matches.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{t("profile.no_pong")}</p>
          ) : (
            <div className="space-y-2">
              {matches.map((m) => {
                const me = m.players.find((p) => p.username === user?.username);
                const opp = m.players.find((p) => p.username !== user?.username);
                const result = me?.outcome ?? "loss";
                const score = `${m.player1_score}–${m.player2_score}`;
                const xpEarned = me?.xp_earned ?? 0;
                const resultColor = result === "win" ? "#22c55e" : result === "draw" ? "#f59e0b" : "#ef4444";
                return (
                  <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-lg"
                    style={{ border: "1px solid var(--color-border)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--color-bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
                    <span className="px-2 py-0.5 rounded text-xs font-bold text-white uppercase shrink-0"
                      style={{ backgroundColor: resultColor }}>
                      {t(`profile.result_${result}`, result)}
                    </span>
                    <span className="text-sm flex-1 truncate" style={{ color: "var(--color-text-primary)" }}>
                      vs <strong>{opp?.username ?? t("profile.unknown")}</strong>
                    </span>
                    <span className="text-xs font-mono font-bold" style={{ color: "var(--color-text-primary)" }}>{score}</span>
                    <span className="text-xs font-semibold shrink-0" style={{ color: "#22c55e" }}>+{xpEarned} XP</span>
                    <span className="text-xs shrink-0 hidden sm:block" style={{ color: "var(--color-text-muted)" }}>
                      {m.finished_at ? timeAgo(m.finished_at, t) : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Achievements */}
        <div className="p-5 rounded-xl"
          style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
              <ShieldCheck className="w-4 h-4" style={{ color: "#fbbf24" }} /> {t("profile.achievements")}
            </h3>
            {achStats && (
              <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                {achStats.unlocked_count}/{achStats.total_achievements}
              </span>
            )}
          </div>

          {achStats && (
            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>
                <span>{t("profile.completion")}</span>
                <span>{achStats.completion_percentage.toFixed(0)}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-bg-input)" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${achStats.completion_percentage}%`, background: "linear-gradient(90deg,#fbbf24,#f97316)" }} />
              </div>
            </div>
          )}

          {recentUnlocks.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{t("profile.no_achievements")}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium mb-2" style={{ color: "var(--color-text-muted)" }}>{t("profile.recent_unlocks")}</p>
              {recentUnlocks.map((u) => (
                <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-lg"
                  style={{ border: "1px solid var(--color-border)", backgroundColor: "rgba(251,191,36,0.04)" }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
                    style={{ backgroundColor: `${TIER_COLORS[u.achievement.tier] ?? "#a855f7"}18`, border: `1px solid ${TIER_COLORS[u.achievement.tier] ?? "#a855f7"}35` }}>
                    {u.achievement.icon || <Star className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                      {t(`achievement.${u.achievement.key}.name`, u.achievement.name)}
                    </p>
                    <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                      {t(`achievement.${u.achievement.key}.description`, u.achievement.description)}
                    </p>
                  </div>
                  <span className="text-xs font-bold shrink-0"
                    style={{ color: TIER_COLORS[u.achievement.tier] ?? "#a855f7" }}>
                    +{u.achievement.xp_reward} XP
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Analytic card ─────────────────────────────────────────────────────────────
function AnalyticCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="p-5 rounded-xl group transition-all duration-200 hover:-translate-y-1 cursor-default"
      style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = `0 4px 20px ${color}20`; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.boxShadow = "none"; }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}18`, color }}>
          {icon}
        </div>
        <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>{label}</span>
      </div>
      <div className="text-2xl font-extrabold mb-0.5" style={{ color: "var(--color-text-primary)" }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{sub}</div>}
    </div>
  );
}
