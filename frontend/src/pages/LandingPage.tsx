import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BrandLogo } from "../components/BrandLogo";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import {
  Gamepad2, ArrowRight, Users, Trophy, Zap,
  Shield, Star,
} from "lucide-react";

// ── Scroll-reveal hook ────────────────────────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.12 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, visible };
}

// ── Reusable reveal wrapper ───────────────────────────────────────────────────
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// ── Format a raw count into a readable label ──────────────────────────────────
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M+`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k+`;
  return String(n);
}

interface PlatformStats {
  total_users: number;
  total_games: number;
  game_modes: number;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { t } = useTranslation();

  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);

  useEffect(() => {
    fetch("/api/analytics/public-stats/")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setPlatformStats(data); })
      .catch(() => {});
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const users      = platformStats ? formatCount(platformStats.total_users) : "—";
  const games      = platformStats ? formatCount(platformStats.total_games) : "—";
  const gameModes  = platformStats ? String(platformStats.game_modes) : "2";

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: "var(--color-bg)" }}>

      {/* ── NAVBAR ───────────────────────────────────────────────────────────── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 h-14 backdrop-fallback"
        style={{
          backgroundColor: "var(--color-bg)",
          borderBottom: "1px solid var(--color-border)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <div className="w-full px-2 sm:px-3 lg:px-4 h-full flex items-center justify-between">
          <BrandLogo />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link
              to="/login"
              className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200"
              style={{ color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#f97316"; e.currentTarget.style.color = "#f97316"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text-primary)"; }}
            >
              {t("landing.sign_in")}
            </Link>
            <Link
              to="/register"
              className="px-4 py-1.5 rounded-lg text-sm font-bold text-white transition-all duration-200"
              style={{ background: "linear-gradient(135deg, #f97316 0%, #ef4444 100%)" }}
            >
              {t("landing.footer_register")}
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-14">
        {/* Animated background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/5 w-[500px] h-[500px] rounded-full blur-3xl opacity-15 animate-pulse"
            style={{ background: "radial-gradient(circle, #f97316, transparent)" }} />
          <div className="absolute bottom-1/4 right-1/5 w-[400px] h-[400px] rounded-full blur-3xl opacity-15 animate-pulse"
            style={{ background: "radial-gradient(circle, #ef4444, transparent)", animationDelay: "1s" }} />
          <div className="absolute top-1/2 left-1/2 w-72 h-72 rounded-full blur-3xl opacity-10 animate-pulse"
            style={{ background: "radial-gradient(circle, #f59e0b, transparent)", animationDelay: "2s" }} />
          {/* Grid overlay */}
          <div className="absolute inset-0 opacity-5"
            style={{ backgroundImage: "linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        </div>

        <div className="relative container mx-auto px-6 text-center" style={{ animation: "heroIn 0.9s cubic-bezier(0.16,1,0.3,1) forwards" }}>
          {/* Headline */}
          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-extrabold leading-none tracking-tight mb-6">
            <span style={{ color: "var(--color-text-primary)" }}>{t("landing.hero_line1")}</span>
            <br />
            <span style={{
              background: "linear-gradient(135deg, #f97316 0%, #ef4444 50%, #f59e0b 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>
              {t("landing.hero_line2")}
            </span>
          </h1>

          <p className="text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-10"
            style={{ color: "var(--color-text-secondary)" }}>
            {t("landing.hero_sub")}
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <Link to="/register"
              className="group px-10 py-4 rounded-xl font-bold text-white text-lg flex items-center gap-3 transition-all duration-300 hover:scale-105 hover:shadow-2xl"
              style={{ background: "linear-gradient(135deg, #f97316 0%, #ef4444 100%)", boxShadow: "0 8px 32px rgba(249,115,22,0.4)" }}>
              {t("landing.cta_start")}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link to="/login"
              className="group px-10 py-4 rounded-xl font-semibold text-lg transition-all duration-300 hover:scale-105 flex items-center gap-2"
              style={{ color: "var(--color-text-primary)", border: "2px solid var(--color-border)" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#f97316"; e.currentTarget.style.color = "#f97316"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text-primary)"; }}>
              {t("landing.sign_in")}
            </Link>
          </div>

          {/* Social proof stats */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-16">
            {[
              { value: users, labelKey: "landing.stat_active_players" },
              { value: games, labelKey: "landing.stat_games_played" },
              { value: "99.9%", labelKey: "landing.stat_uptime" },
            ].map(({ value, labelKey }) => (
              <div key={labelKey} className="text-center">
                <div className="text-3xl font-extrabold mb-1"
                  style={{ background: "linear-gradient(135deg, #f97316 0%, #ef4444 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  {value}
                </div>
                <div className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>{t(labelKey)}</div>
              </div>
            ))}
          </div>
        </div>

      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────────── */}
      <section id="features" className="py-28">
        <div className="container mx-auto px-6">
          <Reveal className="text-center mb-16">
            <p className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: "#f97316" }}>
              {t("landing.features_eyebrow")}
            </p>
            <h2 className="text-3xl sm:text-5xl font-extrabold mb-4" style={{ color: "var(--color-text-primary)" }}>
              {t("landing.features_title")}
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: "var(--color-text-secondary)" }}>
              {t("landing.features_sub")}
            </p>
          </Reveal>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: <Gamepad2 className="w-7 h-7 text-white" />, titleKey: "landing.feat_games_title", descKey: "landing.feat_games_desc", grad: "linear-gradient(135deg,#f97316,#ef4444)" },
              { icon: <Users   className="w-7 h-7 text-white" />, titleKey: "landing.feat_mp_title",    descKey: "landing.feat_mp_desc",    grad: "linear-gradient(135deg,#ef4444,#f59e0b)" },
              { icon: <Trophy  className="w-7 h-7 text-white" />, titleKey: "landing.feat_lb_title",    descKey: "landing.feat_lb_desc",    grad: "linear-gradient(135deg,#f59e0b,#f97316)" },
              { icon: <Zap     className="w-7 h-7 text-white" />, titleKey: "landing.feat_xp_title",    descKey: "landing.feat_xp_desc",    grad: "linear-gradient(135deg,#fb923c,#ef4444)" },
              { icon: <Shield  className="w-7 h-7 text-white" />, titleKey: "landing.feat_sec_title",   descKey: "landing.feat_sec_desc",   grad: "linear-gradient(135deg,#f97316,#f59e0b)" },
              { icon: <Star    className="w-7 h-7 text-white" />, titleKey: "landing.feat_ach_title",   descKey: "landing.feat_ach_desc",   grad: "linear-gradient(135deg,#ef4444,#f97316)" },
            ].map(({ icon, titleKey, descKey, grad }, i) => (
              <Reveal key={titleKey} delay={i * 80}>
                <div
                  className="p-6 rounded-2xl h-full transition-all duration-300 hover:-translate-y-2 cursor-default group"
                  style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#f97316"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(249,115,22,0.18)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110"
                    style={{ background: grad }}>
                    {icon}
                  </div>
                  <h3 className="text-xl font-bold mb-2" style={{ color: "var(--color-text-primary)" }}>{t(titleKey)}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>{t(descKey)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── GAMES SHOWCASE ─────────────────────────────────────────────��─────── */}
      <section id="games" className="py-28" style={{ backgroundColor: "var(--color-bg-card)" }}>
        <div className="container mx-auto px-6">
          <Reveal className="text-center mb-16">
            <p className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: "#f97316" }}>
              {t("landing.games_eyebrow")}
            </p>
            <h2 className="text-3xl sm:text-5xl font-extrabold mb-4" style={{ color: "var(--color-text-primary)" }}>
              {t("landing.games_title")}
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: "var(--color-text-secondary)" }}>
              {t("landing.games_sub")}
            </p>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {[
              {
                titleKey: "home.game_pong",
                descKey: "landing.pong_desc",
                featKeys: ["landing.pong_feat1", "landing.pong_feat2", "landing.pong_feat3", "landing.pong_feat4"],
                badgeKey: "landing.pong_badge",
                c1: "#f97316", c2: "#ef4444",
              },
              {
                titleKey: "home.game_ttt",
                descKey: "landing.ttt_desc",
                featKeys: ["landing.ttt_feat1", "landing.ttt_feat2", "landing.ttt_feat3", "landing.ttt_feat4"],
                badgeKey: "landing.ttt_badge",
                c1: "#f59e0b", c2: "#f97316",
              },
            ].map(({ titleKey, descKey, featKeys, badgeKey, c1, c2 }, i) => (
              <Reveal key={titleKey} delay={i * 120}>
                <div
                  className="relative overflow-hidden rounded-2xl p-8 h-full group transition-all duration-300 hover:-translate-y-2"
                  style={{ background: `linear-gradient(135deg, ${c1}18 0%, ${c2}12 100%)`, border: `1px solid ${c1}35` }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 12px 40px ${c1}30`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
                >
                  <div
                    className="absolute top-5 px-3 py-1 rounded-full text-xs font-bold text-white"
                    style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, insetInlineEnd: '1.25rem' }}
                  >
                    {t(badgeKey)}
                  </div>

                  <div className="w-16 h-16 rounded-2xl mb-6 flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                    style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
                    <Gamepad2 className="w-8 h-8 text-white" />
                  </div>

                  <h3 className="text-2xl font-extrabold mb-3" style={{ color: "var(--color-text-primary)" }}>{t(titleKey)}</h3>
                  <p className="mb-6 leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>{t(descKey)}</p>

                  <ul className="space-y-2 mb-8">
                    {featKeys.map((fk) => (
                      <li key={fk} className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c1 }} />
                        {t(fk)}
                      </li>
                    ))}
                  </ul>

                  <Link to="/register"
                    className="inline-flex items-center gap-2 font-semibold text-sm transition-all duration-200 group-hover:gap-3"
                    style={{ color: c1 }}>
                    {t("landing.play_now")} <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS / SOCIAL PROOF ─────────────────────────────────────────────── */}
      <section id="stats" className="py-28">
        <div className="container mx-auto px-6">
          <Reveal>
            <div className="rounded-3xl p-10 md:p-16 text-center" style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.08) 0%, rgba(239,68,68,0.05) 100%)", border: "1px solid rgba(249,115,22,0.2)" }}>
              <p className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: "#f97316" }}>{t("landing.stats_eyebrow")}</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold mb-12" style={{ color: "var(--color-text-primary)" }}>
                {t("landing.stats_title")}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                {[
                  { value: users,    labelKey: "landing.stat_active" },
                  { value: games,    labelKey: "landing.stat_played" },
                  { value: gameModes, labelKey: "landing.stat_modes" },
                  { value: "99.9%",  labelKey: "landing.stat_sla" },
                ].map(({ value, labelKey }, i) => (
                  <Reveal key={labelKey} delay={i * 80}>
                    <div className="text-center">
                      <div className="text-3xl sm:text-4xl font-extrabold mb-2"
                        style={{ background: "linear-gradient(135deg,#f97316,#ef4444)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                        {value}
                      </div>
                      <div className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>{t(labelKey)}</div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────────── */}
      <section className="py-28" style={{ backgroundColor: "var(--color-bg-card)" }}>
        <div className="container mx-auto px-6">
          <Reveal>
            <div className="relative rounded-3xl p-12 md:p-20 overflow-hidden text-center"
              style={{ background: "linear-gradient(135deg, #f97316 0%, #ef4444 55%, #f59e0b 100%)" }}>
              {/* Decorative elements */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
              </div>

              <div className="relative">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 bg-white/20">
                  <Zap className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-4">
                  {t("landing.cta_title")}
                </h2>
                <p className="text-xl text-white/80 mb-10 max-w-xl mx-auto leading-relaxed">
                  {t("landing.cta_sub")}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/register"
                    className="px-10 py-4 bg-white rounded-xl font-bold text-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl"
                    style={{ color: "#f97316" }}>
                    {t("landing.cta_create")}
                  </Link>
                  <Link to="/login"
                    className="px-10 py-4 rounded-xl font-bold text-lg border-2 border-white/40 text-white transition-all duration-300 hover:bg-white/10 hover:border-white">
                    {t("landing.sign_in")}
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer style={{ backgroundColor: "var(--color-bg)", borderTop: "1px solid var(--color-border)" }}>
        <div className="container mx-auto px-6 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Logo */}
            <BrandLogo />

            {/* Links */}
            <div className="flex items-center gap-6 text-sm" style={{ color: "var(--color-text-muted)" }}>
              <button onClick={() => scrollTo("features")} className="hover:opacity-100 opacity-70 transition-opacity bg-transparent border-none cursor-pointer text-sm" style={{ color: "inherit" }}>{t("landing.nav_features")}</button>
              <button onClick={() => scrollTo("games")} className="hover:opacity-100 opacity-70 transition-opacity bg-transparent border-none cursor-pointer text-sm" style={{ color: "inherit" }}>{t("landing.nav_games")}</button>
              <Link to="/login" className="hover:opacity-100 opacity-70 transition-opacity" style={{ color: "inherit" }}>{t("landing.sign_in")}</Link>
              <Link to="/register" className="hover:opacity-100 opacity-70 transition-opacity" style={{ color: "inherit" }}>{t("landing.footer_register")}</Link>
            </div>

            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {t("landing.footer_rights", { year: new Date().getFullYear() })}
            </p>
          </div>
        </div>
      </footer>

      {/* ── Keyframes ────────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes heroIn {
          from { opacity: 0; transform: translateY(40px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
