import {
  ChevronDown, LogOut, User, Settings,
  Gamepad2, Home, BarChart3, History, Menu, X,
  Award,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/Avatar";
import { BrandLogo } from "@/components/BrandLogo";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

export function Navbar() {
  const { t } = useTranslation();

  const NAV_ITEMS = [
    { label: t("navbar.home"),              to: "/home",           icon: <Home      className="w-4 h-4" /> },
    { label: t("sidebar.games"),            to: "/games/playpage", icon: <Gamepad2  className="w-4 h-4" /> },
    { label: t("sidebar.leaderboard"),      to: "/leaderboard",    icon: <BarChart3 className="w-4 h-4" /> },
    { label: t("sidebar.match_history"),    to: "/history",        icon: <History   className="w-4 h-4" /> },
    { label: t("navbar.achievements"),      to: "/achievements",   icon: <Award     className="w-4 h-4" /> },
  ];
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await logout();
    navigate("/login");
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [navigate]);

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-16 bg-surface border-b backdrop-blur-[12px] backdrop-fallback">
      <div className="flex items-center justify-between h-full px-4 lg:px-8 max-w-screen-2xl mx-auto">

        {/* ── Logo ── */}
        <Link to="/home" className="flex items-center gap-2 shrink-0">
          <div className="sm:hidden">
            <BrandLogo compact showWordmark={false} />
          </div>
          <div className="hidden sm:block">
            <BrandLogo compact showWordmark />
          </div>
        </Link>

        {/* ── Desktop Nav Links ── */}
        <div className="hidden md:flex flex-1 justify-center min-w-0 px-4">
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map(({ label, to, icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 outline-none whitespace-nowrap",
                    isActive
                      ? "text-brand bg-brand/10"
                      : "text-secondary hover:text-primary hover:bg-surface-hover"
                  )
                }
              >
                {icon}
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* ── Right Zone ── */}
        <div className="flex items-center gap-2 shrink-0">

          <NotificationBell />

          {/* User Menu */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className={cn(
                "flex items-center gap-2 p-1.5 rounded-lg transition-colors outline-none hover:bg-surface-hover",
                userMenuOpen && "bg-surface-hover"
              )}
            >
              <Avatar name={user?.display_name || user?.username || ""} size="sm" online />
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 transition-transform duration-150 hidden sm:block text-muted",
                  userMenuOpen && "rotate-180"
                )}
              />
            </button>

            {userMenuOpen && (
              <div
                className="absolute top-full mt-2 w-56 rounded-xl shadow-lg py-1 bg-surface border z-50"
                style={{ insetInlineEnd: 0 }}
              >
                <div className="px-4 py-3 border-b">
                  <p className="text-sm font-semibold text-primary">{user?.display_name || user?.username}</p>
                  <p className="text-xs text-muted">{user?.email}</p>
                </div>
                <div className="py-1">
                  <DropdownItem icon={<User className="w-4 h-4" />} label={t("navbar.profile")} to="/profile" onClick={() => setUserMenuOpen(false)} />
                  <DropdownItem icon={<Settings className="w-4 h-4" />} label={t("navbar.settings")} to="/settings" onClick={() => setUserMenuOpen(false)} />
                </div>
                <div className="py-1 border-t">
                  <DropdownItem icon={<LogOut className="w-4 h-4" />} label={t("navbar.sign_out")} danger onClick={handleLogout} />
                </div>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg text-secondary hover:text-primary hover:bg-surface-hover transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? t("navbar.close_menu") : t("navbar.open_menu")}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ── Mobile Nav Menu ── */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-surface">
          <nav className="px-4 py-3 flex flex-col gap-1">
            {NAV_ITEMS.map(({ label, to, icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "text-brand bg-brand/10"
                      : "text-secondary hover:text-primary hover:bg-surface-hover"
                  )
                }
              >
                {icon}
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

// ── Dropdown item ─────────────────────────────────────────────────────────────
function DropdownItem({
  icon,
  label,
  to,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  to?: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors outline-none",
    danger
      ? "text-error hover:bg-error/10"
      : "text-secondary hover:bg-surface-hover hover:text-primary"
  );
  if (to) {
    return (
      <Link to={to} className={className} onClick={onClick}>
        {icon} {label}
      </Link>
    );
  }
  return (
    <button className={className} onClick={onClick}>
      {icon} {label}
    </button>
  );
}
