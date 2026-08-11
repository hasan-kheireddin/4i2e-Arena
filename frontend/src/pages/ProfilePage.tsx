import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { getUserProfile, type User } from "../services/auth";
import { getMyStats, getUserStats, getMyMatches, getUserMatches, type UserStats, type Match } from "../services/games";
import {
  getMyXP, getUserXP, getAchievementStats, getUserAchievementStats,
  getUnlockedAchievements, getUserUnlockedAchievements,
  type UserXPDetail, type AchievementStats, type AchievementUnlock,
} from "../services/analytics";
import {
  fetchFriendships, sendFriendRequest, acceptFriendRequest, removeFriend,
  getOrCreateDM,
} from "../services/chat";
import { useChatSocket } from "../components/Chat/useChatSocket";
import {
  Trophy, Flame, TrendingUp, Sword,
  Clock, Target, ShieldCheck, UserPlus, UserCheck, MessageCircle, Gamepad2, X,
} from "lucide-react";
import AchievementIcon from "../components/AchievementIcon";
import { Avatar } from "../components/ui/Avatar";
import { useFriendships } from "../context/FriendshipContext";
import { useBlocks } from "../context/BlockContext";
import InviteGamePicker from "../components/Chat/InviteGamePicker";
import FriendsModal, { type FriendsTab } from "../components/friends/FriendsModal";
import ProfileOverflowMenu from "../components/profile/ProfileOverflowMenu";
import { IconBlock, IconUnblock } from "../components/Chat/ChatIcons";

function timeAgo(iso: string, t: TFunction): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return t("home.time_just_now");
  if (h < 24) return t("home.time_hours_ago", { count: h });
  return t("home.time_days_ago", { count: Math.floor(h / 24) });
}

const TIER_COLORS: Record<string, string> = {
  common: "#94a3b8",
  rare: "#3b82f6",
  epic: "#a855f7",
  legendary: "#f59e0b",
};

export default function ProfilePage() {
  const { t } = useTranslation();
  const { userId: profileUserId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const targetUserId = profileUserId || user?.id;

  const [loading, setLoading] = useState(true);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [xp, setXp] = useState<UserXPDetail | null>(null);
  const [achStats, setAchStats] = useState<AchievementStats | null>(null);
  const [recentUnlocks, setRecentUnlocks] = useState<AchievementUnlock[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const { friendships, setFriendships, refresh: refreshFriendships } = useFriendships();

  const navigate = useNavigate();

  const isOwn = !profileUserId || profileUserId === user?.id;

  const { sendGameInvite, gameInviteAccepted, clearGameInviteAccepted, friendRemoved, clearFriendRemoved, onlineUserIds } = useChatSocket();
  const { blocks, blockedUserIds, unblock: doUnblock } = useBlocks();
  // Re-fetch profile when friendships change (to update friend_count for other users)
  useEffect(() => {
    if (!isOwn && profileUserId) {
      getUserProfile(profileUserId).then(setProfileUser).catch(() => {});
    }
  }, [friendships, blocks, profileUserId, isOwn]);

  // Re-fetch profile + friendships when blocked/unblocked by the target user
  useEffect(() => {
    if (!friendRemoved) return;
    if (!isOwn && profileUserId) {
      getUserProfile(profileUserId).then(setProfileUser).catch(() => {});
    }
    refreshFriendships();
    clearFriendRemoved();
  }, [friendRemoved, clearFriendRemoved]);


  useEffect(() => {
    if (gameInviteAccepted) {
      clearGameInviteAccepted();
      navigate(`/games/${gameInviteAccepted.game_type}?game_id=${gameInviteAccepted.game_id}`);
    }
  }, [gameInviteAccepted, clearGameInviteAccepted, navigate]);
  const [showInvitePicker, setShowInvitePicker] = useState(false);
  const [friendsTab, setFriendsTab] = useState<FriendsTab | null>(null);
useEffect(() => {
  let cancelled = false;
  async function load() {
    // Fetch friendships independently so other failures can't kill it
    fetchFriendships()
      .then((res) => { if (!cancelled) setFriendships(res as any); })
      .catch(() => {});

    try {
      if (!isOwn && profileUserId) {
        const u = await getUserProfile(profileUserId);
        if (!cancelled) setProfileUser(u);
      }
      const [statsRes, xpRes, achRes, unlocksRes, matchRes] = await Promise.all([
        isOwn ? getMyStats(undefined, "pvp") : getUserStats(targetUserId!, undefined, "pvp"),
        isOwn ? getMyXP() : getUserXP(targetUserId!),
        isOwn ? getAchievementStats() : getUserAchievementStats(targetUserId!),
        isOwn ? getUnlockedAchievements() : getUserUnlockedAchievements(targetUserId!),
        isOwn ? getMyMatches({ mode: "pvp", page_size: 8 }) : getUserMatches(targetUserId!, { page_size: 8 }),
      ]);
      if (cancelled) return;
      setStats(statsRes as any);
      setXp(xpRes as any);
      setAchStats(achRes as any);
      setRecentUnlocks((unlocksRes as any).slice(0, 4));
      setMatches((matchRes as any).results);
    } catch (e) {
      // Individual panels keep their empty state when a request fails.
    } finally {
      if (!cancelled) setLoading(false);
    }
  }
  load();
  return () => { cancelled = true; };
}, [profileUserId, user?.id]);

  const overview = stats?.overview;
  const totalGames    = overview?.total_matches ?? 0;
  const wins          = overview?.wins ?? 0;
  const losses        = overview?.losses ?? 0;
  const draws         = overview?.draws ?? 0;
  const winRate       = overview ? Math.round(overview.win_rate * 100) : 0;
  const avgScore      = overview ? overview.avg_score.toFixed(1) : "0.0";
  const streak        = stats?.streaks.current.count ?? 0;
  const streakType    = stats?.streaks.current.type ?? "none";
  const longestWin    = stats?.streaks.longest_win ?? 0;
  const streakTypeLabel = streakType === "win"
    ? t("profile.streak_type_win")
    : streakType === "loss"
      ? t("profile.streak_type_loss")
      : t("profile.no_streak");

  const totalXp = xp?.xp ?? 0;
  const level   = xp?.level ?? 1;
  const xpInLevel = xp?.level_info?.xp_in_level ?? 0;
  const xpNeeded = xp?.level_info?.xp_needed ?? 0;
  const xpRemaining = Math.max(xpNeeded - xpInLevel, 0);
  const xpProgress = xpNeeded > 0 ? Math.min((xpInLevel / xpNeeded) * 100, 100) : 100;
  const nextLevel = xpNeeded > 0 ? level + 1 : level;

  const recentForm = stats?.recent_form ?? [];

 const isBlockedByTarget = !isOwn && profileUser?.blocked_by_target;
 const friendCount = isOwn
  ? friendships.filter((f) => f.status === "accepted").length
  : profileUser?.friend_count ?? 0;
 // Only your own list is fetchable, so only your own count opens the dialog.
 const pendingCount = isOwn
  ? friendships.filter((f) => f.status === "pending" && f.direction === "received").length
  : 0;

  const friendRel = targetUserId
    ? friendships.find((f) => f.other_user_id === targetUserId)
    : undefined;
  const friendStatus = friendRel?.status;
  const friendDirection = friendRel?.direction;

  const handleFriendAction = async () => {
    if (!targetUserId) return;
    try {
      if (friendStatus === "accepted" && friendRel) {
        await removeFriend(friendRel.id);
      } else if (friendStatus === "pending" && friendDirection === "received" && friendRel) {
        await acceptFriendRequest(friendRel.id);
      } else if (friendStatus === "pending" && friendDirection === "sent" && friendRel) {
        await removeFriend(friendRel.id);
      } else {
        await sendFriendRequest(targetUserId);
      }
      await refreshFriendships();
    } catch (e) {
      console.error("Friend action error:", e);
    }
  };

  const handleOpenDM = async () => {
    if (!targetUserId) return;
    try {
      const channel = await getOrCreateDM(targetUserId);
      window.location.href = `/chat?channel=${channel.id}`;
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (isBlockedByTarget) {
    return <UnavailableProfile name={profileUser?.display_name || profileUser?.username} onBack={() => navigate(-1)} />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn">

      {/* ── Profile Header ─────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl p-8"
        style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.14) 0%, rgba(239,68,68,0.1) 100%)", border: "1px solid rgba(249,115,22,0.25)" }}
      >
        <div
          className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl pointer-events-none"
          style={{ backgroundColor: "rgba(249,115,22,0.18)" }}
        />
        <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="relative shrink-0">
            <Avatar name={profileUser?.display_name || profileUser?.username || user?.display_name || user?.username || ""} size="xl" online={isOwn} />
            <div
              className="absolute -bottom-1 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg,#f97316,#ef4444)", insetInlineEnd: '-0.25rem' }}
            >
              {level}
            </div>
          </div>

          <div className="flex-1 min-w-0 text-center sm:text-left">
            {/* The overflow menu rides beside the name, Instagram-style, so the
                action row keeps only the things you actually came here to do. */}
            <div className="flex items-center justify-center sm:justify-start gap-1.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold truncate" style={{ color: "var(--color-text-primary)" }}>
                {profileUser?.display_name || profileUser?.username || user?.display_name || user?.username}
              </h1>
              {!isOwn && targetUserId && !blockedUserIds.has(targetUserId) && (
                <ProfileOverflowMenu
                  userId={targetUserId}
                  username={profileUser?.username || ""}
                  displayName={profileUser?.display_name}
                />
              )}
            </div>
            <div
              className="text-sm mb-3 flex items-center justify-center sm:justify-start gap-2 flex-wrap"
              style={{ color: "var(--color-text-muted)" }}
            >
              <span>@{profileUser?.username || user?.username}</span>
              <span aria-hidden>·</span>
              {isOwn ? (
                <button
                  type="button"
                  onClick={() => setFriendsTab("friends")}
                  aria-haspopup="dialog"
                  aria-label={t("profile.open_friends")}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 -mx-1 font-medium transition-colors hover:bg-surface-hover"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>{t("profile.friends_count", { count: friendCount })}</span>
                </button>
              ) : (
                <span className="flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  {t("profile.friends_count", { count: friendCount })}
                </span>
              )}
              {pendingCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFriendsTab("pending")}
                  aria-haspopup="dialog"
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: "rgb(var(--color-primary-rgb) / 0.14)",
                    color: "var(--color-primary)",
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundImage: "var(--gradient-brand)" }} />
                  {t("profile.pending_count", { count: pendingCount })}
                </button>
              )}
            </div>

            {/* XP Bar */}
            <div className="max-w-xs mx-auto sm:mx-0">
              <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                <span>{t("profile.level_xp", { level, xp: totalXp.toLocaleString() })}</span>
                <span>{t("profile.xp_to_level", { remaining: xpRemaining, next: nextLevel })}</span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-bg-input)" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${xpProgress}%`, background: "linear-gradient(90deg,#f97316,#ef4444)" }} />
              </div>
            </div>
          </div>

          {/* Rank badge */}
          <div className="text-center shrink-0 px-6 py-4 rounded-xl"
            style={{ backgroundColor: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.25)" }}>
            <div className="text-3xl font-extrabold"
              style={{ background: "linear-gradient(135deg,#f97316,#ef4444)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              #{xp?.rank ?? "–"}
            </div>
            <div className="text-xs font-medium mt-0.5" style={{ color: "var(--color-text-muted)" }}>{t("profile.global_rank")}</div>
          </div>
        </div>
      </div>

      {/* ── Friend / DM Actions ── */}
      {/* A block is a state, not a button: while it's on, every way of reaching
          the person is withdrawn and only the way back out is offered. */}
      {!isOwn && targetUserId && (
        blockedUserIds.has(targetUserId) ? (
          <div
            className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl p-4"
            style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
          >
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 self-center sm:self-auto"
              style={{ backgroundColor: "rgb(var(--color-danger-rgb) / 0.12)", color: "var(--color-danger)" }}
            >
              <IconBlock size={18} />
            </span>
            <div className="flex-1 min-w-0 text-center sm:text-start">
              <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {t("profile.blocked_banner_title", { username: profileUser?.username })}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                {t("profile.blocked_banner_body")}
              </p>
            </div>
            <button
              onClick={async () => {
                const blockRec = blocks.find((b) => b.blocked === targetUserId);
                if (blockRec) { await doUnblock(blockRec.id); refreshFriendships(); }
              }}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold shrink-0 transition-colors hover:bg-surface-hover"
              style={{
                backgroundColor: "var(--color-bg-input)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border)",
              }}
            >
              <IconUnblock size={15} />
              {t("profile.unblock")}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap">
            <button
              onClick={handleFriendAction}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{
                backgroundColor:
                  friendStatus === "accepted" ? "#EF4444" :
                  friendStatus === "pending" && friendDirection === "received" ? "#22C55E" :
                  friendStatus === "pending" && friendDirection === "sent" ? "#F59E0B" :
                  "var(--color-primary)",
              }}
            >
              {friendStatus === "accepted" ? <X className="w-4 h-4" /> :
               friendStatus === "pending" && friendDirection === "received" ? <UserCheck className="w-4 h-4" /> :
               friendStatus === "pending" && friendDirection === "sent" ? <X className="w-4 h-4" /> :
               <UserPlus className="w-4 h-4" />}
              {friendStatus === "accepted" ? t("profile.remove_friend") :
               friendStatus === "pending" && friendDirection === "received" ? t("profile.accept_request") :
               friendStatus === "pending" && friendDirection === "sent" ? t("profile.cancel_request") :
               t("profile.add_friend")}
            </button>
            <button
              onClick={handleOpenDM}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--color-bg-input)", color: "var(--color-text-primary)" }}
            >
              <MessageCircle className="w-4 h-4" />
              {t("profile.send_message")}
            </button>
            <button
              onClick={() => setShowInvitePicker(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#22C55E" }}
            >
              <Gamepad2 className="w-4 h-4" />
              {t("profile.invite_to_game")}
            </button>
          </div>
        )
      )}

      {friendsTab && (
        <FriendsModal
          initialTab={friendsTab}
          onlineUserIds={onlineUserIds}
          onClose={() => setFriendsTab(null)}
        />
      )}

      {showInvitePicker && (
        <InviteGamePicker
          onSelect={(gameType) => {
            if (targetUserId) sendGameInvite(targetUserId, gameType);
            setShowInvitePicker(false);
          }}
          onCancel={() => setShowInvitePicker(false)}
        />
      )}



      {/* ── Game Analytics Grid ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(#f97316,#ef4444)" }} />
          <h2 className="text-base font-bold uppercase tracking-wider" style={{ color: "var(--color-text-primary)" }}>
            {t("profile.game_analytics")}
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <AnalyticCard icon={<Trophy className="w-5 h-5" />} label={t("profile.wins")} value={String(wins)} sub={t("profile.of_games", { total: totalGames })} color="#f97316" />
          <AnalyticCard icon={<TrendingUp className="w-5 h-5" />} label={t("profile.win_rate")} value={`${winRate}%`} sub={t("profile.record_short", { losses, draws })} color="#ef4444" />
          <AnalyticCard icon={<Flame className="w-5 h-5" />} label={t("profile.current_streak")} value={String(streak)} sub={streakTypeLabel} color={streakType === "win" ? "#22c55e" : streakType === "loss" ? "#ef4444" : "#71717a"} />
          <AnalyticCard icon={<Target className="w-5 h-5" />} label={t("profile.avg_score")} value={avgScore} sub={t("profile.best_streak", { count: longestWin })} color="#06b6d4" />
        </div>

        {/* Performance Breakdown */}
        <div className="grid grid-cols-1 gap-4">

          {/* W/L/D Bar */}
          <div className="p-5 rounded-xl"
            style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
              <Sword className="w-4 h-4" style={{ color: "#f97316" }} /> {t("profile.match_breakdown")}
            </h3>
            {totalGames === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{t("profile.no_games")}</p>
            ) : (
              <>
                {/* Bar */}
                <div className="flex h-4 rounded-full overflow-hidden mb-3 gap-0.5">
                  {wins > 0 && (
                    <div className="transition-all duration-700 rounded-l-full" title={t("profile.wins_title", { count: wins })}
                      style={{ width: `${(wins / totalGames) * 100}%`, background: "linear-gradient(90deg,#22c55e,#16a34a)" }} />
                  )}
                  {draws > 0 && (
                    <div title={t("profile.draws_title", { count: draws })}
                      style={{ width: `${(draws / totalGames) * 100}%`, backgroundColor: "#f59e0b" }} />
                  )}
                  {losses > 0 && (
                    <div className="transition-all duration-700 rounded-r-full" title={t("profile.losses_title", { count: losses })}
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

        </div>
      </div>

      {/* ── Bottom Grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Matches */}
        <div className="p-5 rounded-xl"
          style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}>
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
            <Clock className="w-4 h-4" style={{ color: "#f97316" }} /> {t("profile.recent_matches")}
          </h3>
          {matches.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{t("profile.no_matches")}</p>
          ) : (
            <div className="space-y-2">
              {matches.map((m) => {
                const me = m.players.find((p) => p.username === user?.username);
                const opp = m.players.find((p) => p.username !== user?.username);
                const result = me?.outcome ?? "loss";
                const score = `${m.player1_score}–${m.player2_score}`;
                const xpEarned = me?.xp_earned ?? 0;
                const resultColor = result === "win" ? "#22c55e" : result === "draw" ? "#f59e0b" : "#ef4444";
                const gameLabel = m.game_type === "tictactoe" ? t("home.game_ttt") : t("home.game_pong");
                return (
                  <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-lg"
                    style={{ border: "1px solid var(--color-border)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--color-bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
                    <span className="px-2 py-0.5 rounded text-xs font-bold text-white uppercase shrink-0"
                      style={{ backgroundColor: resultColor }}>
                      {t(`profile.result_${result}`, result)}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded shrink-0"
                      style={{ backgroundColor: "var(--color-bg-input)", color: "var(--color-text-secondary)" }}>
                      {gameLabel}
                    </span>
                    <span className="text-sm flex-1 truncate" style={{ color: "var(--color-text-primary)" }}>
                      {t("profile.vs")} <strong>{opp?.username ?? t("profile.unknown")}</strong>
                    </span>
                    <span className="text-xs font-mono font-bold" style={{ color: "var(--color-text-primary)" }}>{score}</span>
                    <span className="text-xs font-semibold shrink-0" style={{ color: "#22c55e" }}>{t("profile.xp_gain", { xp: xpEarned })}</span>
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
                  style={{ border: "1px solid var(--color-border)", backgroundColor: "rgba(16, 212, 26, 0.04)" }}>
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: `${TIER_COLORS[u.achievement.rarity] ?? "#a855f7"}18`,
                      border: `1px solid ${TIER_COLORS[u.achievement.rarity] ?? "#a855f7"}35`,
                    }}
                  >
                    <AchievementIcon
                      color={TIER_COLORS[u.achievement.rarity] ?? "#a855f7"}
                      category={u.achievement.category}
                      className="h-5 w-5"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                      {t(`achievement_catalog.${u.achievement.key}.name`, u.achievement.name)}
                    </p>
                    <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                      {t(`achievement_catalog.${u.achievement.key}.description`, u.achievement.description)}
                    </p>
                  </div>
                  <span className="text-xs font-bold shrink-0"
                    style={{ color: TIER_COLORS[u.achievement.rarity] ?? "#a855f7" }}>
                    {t("profile.xp_gain", { xp: u.achievement.xp_reward })}
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

// ── Unavailable profile ───────────────────────────────────────────────────────
/**
 * Shown when the person you're looking at has blocked you. It deliberately
 * reveals nothing beyond the name you already navigated with — no stats, no
 * avatar, no actions that would ping them.
 */
function UnavailableProfile({ name, onBack }: { name?: string; onBack: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-10rem)] animate-fadeIn">
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-3xl px-8 py-14 text-center"
        style={{
          backgroundColor: "var(--color-bg-card)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 32px 96px -40px var(--color-shadow)",
        }}
      >
        {/* Ambient wash — brand-tinted but heavily muted, so the card reads as a
            dead end rather than an achievement. */}
        <div
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl pointer-events-none"
          style={{ backgroundColor: "rgb(var(--color-primary-rgb) / 0.07)" }}
        />

        <div className="relative flex flex-col items-center">
          {/* Concentric rings around a lock — pure SVG, inherits the palette. */}
          <div className="relative mb-7 flex items-center justify-center">
            <span
              className="absolute rounded-full"
              style={{ width: 118, height: 118, border: "1px solid var(--color-border)", opacity: 0.5 }}
            />
            <span
              className="absolute rounded-full"
              style={{ width: 92, height: 92, border: "1px solid var(--color-border)" }}
            />
            <span
              className="relative flex items-center justify-center rounded-full"
              style={{
                width: 66,
                height: 66,
                backgroundColor: "var(--color-bg-input)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-muted)",
              }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                focusable="false"
              >
                <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
                <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                <circle cx="12" cy="15.75" r="1.15" />
                <line x1="12" y1="16.9" x2="12" y2="18.2" />
              </svg>
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-extrabold mb-2.5" style={{ color: "var(--color-text-primary)" }}>
            {t("profile.unavailable_title")}
          </h2>
          <p className="text-sm leading-relaxed max-w-sm" style={{ color: "var(--color-text-muted)" }}>
            {name
              ? t("profile.unavailable_body", { name })
              : t("profile.unavailable_body_generic")}
          </p>

          <button
            type="button"
            onClick={onBack}
            className="mt-8 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:bg-surface-hover"
            style={{
              backgroundColor: "var(--color-bg-input)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border)",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="icon-directional"
              aria-hidden
              focusable="false"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            {t("profile.go_back")}
          </button>
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
