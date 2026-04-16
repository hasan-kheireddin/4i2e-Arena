import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BrandLogo } from "../components/BrandLogo";
import { useAuth } from "../context/AuthContext";
import {
  getMyMatches, getMyStats, getLeaderboard,
  type Match, type LeaderboardEntry, type UserStats,
} from "../services/games";
import {
  Gamepad2, Trophy, Zap, TrendingUp, Sword,
  Flame, ArrowRight, Clock,
} from "lucide-react";

// ── Helper ────────────────────────────────────────────────────────────────────
function timeAgo(iso: string, t: (key: string, opts?: object) => string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return t("home.time_just_now");
  if (diffHours < 24) return t("home.time_hours_ago", { count: diffHours });
  return t("home.time_days_ago", { count: Math.floor(diffHours / 24) });
}

function pickDisplayName(
  displayName: string | undefined,
  username: string | undefined,
  fallback: string,
): string {
  const cleanDisplay = displayName?.trim();
  if (cleanDisplay && cleanDisplay.toLowerCase() !== "null" && cleanDisplay.toLowerCase() !== "undefined") {
    return cleanDisplay;
  }
  const cleanUsername = username?.trim();
  return cleanUsername || fallback;
}

function normalizeUsername(username: string | undefined): string {
  return username?.trim().toLowerCase() || "";
}

// ─────────────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      try {
        const [statsData, matchesData, lbData] = await Promise.all([
          getMyStats(),
          getMyMatches({ page_size: 5 }),
          getLeaderboard({ game_type: "pong", metric: "wins", limit: 5 }),
        ]);
        if (!cancelled) {
          setStats(statsData);
          setRecentMatches(matchesData.results);
          setLeaderboard(lbData);
        }
      } catch { /* fallback to defaults */ }
      finally { if (!cancelled) setLoading(false); }
    }
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  const totalXp    = stats?.overview.total_xp ?? 0;
  const level      = Math.floor(totalXp / 200) + 1;
  const xpToNext   = 200 - (totalXp % 200);
  const xpProgress = ((200 - xpToNext) / 200) * 100;
  const totalWins  = stats?.overview.wins ?? 0;
  const totalGames = stats?.overview.total_games ?? 0;
  const winRatePct = stats ? (stats.overview.win_rate * 100).toFixed(1) + "%" : "0.0%";
  const streak     = stats?.streaks.current.count ?? 0;
  const myUsername = normalizeUsername(user?.username);
  const myDisplayName = pickDisplayName(user?.display_name, user?.username, t("home.anonymous_player"));
  const myEntry    = leaderboard.find((e) => normalizeUsername(e.username) === myUsername);
  const myRank     = myEntry ? `#${myEntry.rank}` : "#–";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div
          className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">

      {/* ── Welcome Banner ─────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl p-7 md:p-10"
        style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.14) 0%, rgba(239,68,68,0.1) 55%, rgba(245,158,11,0.08) 100%)", border: "1px solid rgba(249,115,22,0.25)" }}
      >
        {/* BG blobs */}
        <div className="absolute top-0 left-0 w-64 h-64 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ backgroundColor: "rgba(249,115,22,0.2)" }} />
        <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none"
          style={{ backgroundColor: "rgba(239,68,68,0.15)" }} />

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <BrandLogo compact />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "#fb923c" }}>
                FireArena Hub
              </p>
            </div>
            <h1 className="text-2xl md:text-4xl font-extrabold mb-2" style={{ color: "var(--color-text-primary)" }}>
              <span style={{
                background: "linear-gradient(135deg,#f97316,#ef4444)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>
                {myDisplayName}
              </span>
            </h1>

            {/* XP bar */}
            <div className="mt-2">
              <div className="flex items-center gap-3 mb-1.5">
                <span className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                  {t("home.level")} {level}
                </span>
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {totalXp.toLocaleString()} XP — {xpToNext} {t("home.xp_to_next_level")} {level + 1}
                </span>
              </div>
              <div className="w-full max-w-xs h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-bg-input)" }}>
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${xpProgress}%`, background: "linear-gradient(90deg,#f97316,#ef4444)" }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Link
              to="/games/playpage"
              className="group inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition-all duration-200 hover:scale-105 hover:shadow-lg"
              style={{ background: "linear-gradient(135deg,#f97316,#ef4444)", boxShadow: "0 4px 20px rgba(249,115,22,0.35)" }}
            >
              <Gamepad2 className="w-4 h-4" />
              {t("home.quick_play")}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Stat Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={<Trophy className="w-5 h-5" />}
          label={t("home.stat.total_wins")}
          value={String(totalWins)}
          sub={t("home.stat.of_games", { total: totalGames })}
          color="#f97316"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label={t("home.stat.win_rate")}
          value={winRatePct}
          sub={t("home.stat.win_percentage")}
          color="#ef4444"
        />
        <StatCard
          icon={<Flame className="w-5 h-5" />}
          label={t("home.stat.streak")}
          value={String(streak)}
          sub={t("home.stat.game_streak")}
          color="#f97316"
        />
        <StatCard
          icon={<Sword className="w-5 h-5" />}
          label={t("home.stat.rank")}
          value={myRank}
          sub={t("home.stat.global_ranking")}
          color="#fb923c"
        />
      </div>

      {/* ── Main Grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left (2/3) ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Quick Play */}
          <Section title={t("home.quick_play")} icon={<Gamepad2 className="w-4 h-4" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <GameCard
                title={t("home.game_pong")}
                desc={t("home.game_pong_desc")}
                players={24}
                to="/games/playpage"
                c1="#f97316" c2="#ef4444"
              />
              <GameCard
                title={t("home.game_ttt")}
                desc={t("home.game_ttt_desc")}
                players={18}
                to="/games/playpage"
                c1="#f59e0b" c2="#f97316"
              />
            </div>
          </Section>

          {/* Recent Matches */}
          <Section
            title={t("home.recent_matches")}
            icon={<Clock className="w-4 h-4" />}
            action={{ label: t("home.view_all"), to: "/history" }}
          >
            {recentMatches.length === 0 ? (
              <p className="text-sm py-4" style={{ color: "var(--color-text-muted)" }}>
                {t("home.no_matches")}
              </p>
            ) : (
              <div className="space-y-2">
                {recentMatches.map((match) => {
                  const me = match.players.find((p) => normalizeUsername(p.username) === myUsername);
                  const opp = match.players.find((p) => normalizeUsername(p.username) !== myUsername);
                  const result: "win" | "loss" | "draw" = me?.outcome ?? "loss";
                  const score = `${match.player1_score}-${match.player2_score}`;
                  const xpEarned = me?.xp_earned ?? 0;
                  const gameLabel = match.game_type === "pong" ? t("home.game_pong") : t("home.game_ttt_short");
                  const timeLabel = match.finished_at ? timeAgo(match.finished_at, t) : "";

                  const resultColors: Record<string, string> = {
                    win: "var(--color-success)",
                    draw: "#f59e0b",
                    loss: "var(--color-error)",
                  };

                  return (
                    <div
                      key={match.id}
                      className="flex items-center gap-3 p-3.5 rounded-xl transition-all duration-150 cursor-default"
                      style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--color-bg-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--color-bg-card)"; }}
                    >
                      {/* Result badge */}
                      <span
                        className="px-2.5 py-1 rounded-md text-xs font-bold text-white uppercase shrink-0"
                        style={{ backgroundColor: resultColors[result] }}
                      >
                        {t(`profile.result_${result}`)}
                      </span>

                      {/* Game + opponent */}
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--color-bg-input)", color: "var(--color-text-muted)" }}>
                          {gameLabel}
                        </span>
                        <span className="text-sm truncate" style={{ color: "var(--color-text-primary)" }}>
                          vs <strong>{opp?.username ?? t("home.unknown_opponent")}</strong>
                        </span>
                      </div>

                      {/* Score */}
                      <span className="text-sm font-bold font-mono shrink-0" style={{ color: "var(--color-text-primary)" }}>
                        {score}
                      </span>

                      {/* XP */}
                      <span className="text-xs font-semibold shrink-0" style={{ color: "var(--color-success)" }}>
                        +{xpEarned} XP
                      </span>

                      {/* Time */}
                      <span className="text-xs shrink-0 hidden sm:block" style={{ color: "var(--color-text-muted)" }}>
                        {timeLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        {/* ── Right (1/3) ── */}
        <div className="space-y-6">
          <Section
            title={t("home.leaderboard")}
            icon={<Trophy className="w-4 h-4" />}
            action={{ label: t("home.view_all"), to: "/leaderboard" }}
          >
            {leaderboard.length === 0 ? (
              <p className="text-sm py-4" style={{ color: "var(--color-text-muted)" }}>
                {t("home.no_leaderboard")}
              </p>
            ) : (
              <div className="space-y-1">
                {leaderboard.map((player) => {
                  const rankColor =
                    player.rank === 1 ? "#fbbf24" :
                    player.rank === 2 ? "#94a3b8" :
                    player.rank === 3 ? "#fb923c" :
                    "var(--color-text-muted)";
                  const isMe = normalizeUsername(player.username) === myUsername;

                  return (
                    <div
                      key={player.rank}
                      className="flex items-center gap-3 px-2 py-2 rounded-lg transition-colors"
                      style={{
                        backgroundColor: isMe ? "rgba(249,115,22,0.08)" : "transparent",
                        border: isMe ? "1px solid rgba(249,115,22,0.2)" : "1px solid transparent",
                      }}
                    >
                      <span className="text-xs font-bold w-6 text-center shrink-0" style={{ color: rankColor }}>
                        #{player.rank}
                      </span>
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ backgroundColor: "var(--color-primary)" }}
                      >
                        {player.username.charAt(0).toUpperCase()}
                      </div>
                        <span className="text-sm truncate flex-1 font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {player.username}
                        {isMe && <span className="ml-1 text-xs" style={{ color: "#f97316" }}>{t("home.you")}</span>}
                        </span>
                      <span className="text-xs font-mono shrink-0" style={{ color: "var(--color-primary)" }}>
                        {player.total_xp.toLocaleString()} XP
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* XP breakdown */}
          <Section title={t("home.xp_breakdown")} icon={<Zap className="w-4 h-4" />}>
            <div className="space-y-3">
              {[
                { label: t("home.xp_this_week"), value: stats?.overview.total_xp ?? 0, max: 1000, color: "#f97316" },
                { label: t("home.xp_win_bonus"), value: totalWins * 50, max: Math.max(totalWins * 50, 500), color: "#ef4444" },
                { label: t("home.xp_streak_bonus"), value: streak * 25, max: Math.max(streak * 25, 250), color: "#f97316" },
              ].map(({ label, value, max, color }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{label}</span>
                    <span className="text-xs font-mono" style={{ color }}>{value.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-bg-input)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.min((value / max) * 100, 100)}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, color,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <div
      className="p-5 rounded-xl group transition-all duration-200 hover:-translate-y-1"
      style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = `0 4px 20px ${color}20`; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20`, color }}>
          {icon}
        </div>
        <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>{label}</span>
      </div>
      <div className="text-2xl font-extrabold mb-0.5" style={{ color: "var(--color-text-primary)" }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{sub}</div>}
    </div>
  );
}

function Section({
  title, icon, action, children,
}: { title: string; icon?: React.ReactNode; action?: { label: string; to: string }; children: React.ReactNode }) {
  return (
    <div
      className="p-5 rounded-xl"
      style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {icon && <span style={{ color: "var(--color-primary)" }}>{icon}</span>}
          <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--color-text-primary)" }}>{title}</h2>
        </div>
        {action && (
          <Link
            to={action.to}
            className="text-xs font-medium flex items-center gap-1 transition-opacity hover:opacity-70"
            style={{ color: "var(--color-primary)" }}
          >
            {action.label} <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function GameCard({
  title, desc, players, to, c1, c2,
}: { title: string; desc: string; players: number; to: string; c1: string; c2: string }) {
  const { t } = useTranslation();
  return (
    <Link to={to} className="block group">
      <div
        className="relative h-44 flex flex-col justify-end p-5 rounded-xl overflow-hidden transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl"
        style={{ background: `linear-gradient(135deg, ${c1}25 0%, ${c2}15 100%)`, border: `1px solid ${c1}35` }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = c1; e.currentTarget.style.boxShadow = `0 8px 30px ${c1}25`; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${c1}35`; e.currentTarget.style.boxShadow = "none"; }}
      >
        {/* Subtle icon in background */}
        <div className="absolute top-4 right-4 opacity-20 transition-opacity duration-300 group-hover:opacity-40">
          <Gamepad2 className="w-12 h-12" style={{ color: c1 }} />
        </div>

        <div>
          <h3 className="text-lg font-extrabold mb-0.5" style={{ color: "var(--color-text-primary)" }}>{title}</h3>
          <p className="text-xs mb-2" style={{ color: "var(--color-text-secondary)" }}>{desc}</p>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
              {players} {t("home.players_online")}
            </span>
          </div>
        </div>

        {/* Play button overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="px-5 py-2 rounded-lg font-bold text-sm text-white flex items-center gap-2"
            style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
            {t("home.play_now")} <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    </Link>
  );
}
