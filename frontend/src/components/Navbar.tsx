import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { useState } from "react";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav
      className="border-b"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo / Brand */}
          <Link
            to="/"
            className="text-xl font-bold transition-colors"
            style={{ color: "var(--color-text-primary)" }}
          >
            ft_transcendence
          </Link>

          {/* Navigation Links */}
          {user && (
            <div className="hidden md:flex items-center gap-6">
              <Link
                to="/"
                className="transition-colors hover:underline"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {t("navbar.home", "Home")}
              </Link>
              <Link
                to="/games/tictactoe"
                className="transition-colors hover:underline"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Tic-Tac-Toe
              </Link>
              <Link
                to="/games/pong"
                className="transition-colors hover:underline"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Pong
              </Link>
            </div>
          )}

          {/* User Menu */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors"
                style={{
                  backgroundColor: showUserMenu
                    ? "var(--color-bg-hover)"
                    : "transparent",
                  color: "var(--color-text-primary)",
                }}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--color-primary)" }}>
                  <span className="text-white font-semibold text-sm">
                    {user.username?.charAt(0).toUpperCase() || "U"}
                  </span>
                </div>
                <span className="hidden md:block">{user.username}</span>
                <svg
                  className="w-4 h-4 transition-transform"
                  style={{
                    transform: showUserMenu ? "rotate(180deg)" : "rotate(0)",
                  }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {showUserMenu && (
                <div
                  className="absolute right-0 mt-2 w-48 rounded-lg shadow-lg overflow-hidden z-50"
                  style={{
                    backgroundColor: "var(--color-bg-card)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <div
                    className="px-4 py-3 border-b"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {user.username}
                    </p>
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {user.email}
                    </p>
                  </div>

                  <Link
                    to="/profile"
                    className="block px-4 py-2 text-sm transition-colors"
                    style={{ color: "var(--color-text-secondary)" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = "transparent")
                    }
                    onClick={() => setShowUserMenu(false)}
                  >
                    Profile
                  </Link>

                  <Link
                    to="/setup-2fa"
                    className="block px-4 py-2 text-sm transition-colors"
                    style={{ color: "var(--color-text-secondary)" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = "transparent")
                    }
                    onClick={() => setShowUserMenu(false)}
                  >
                    Security (2FA)
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm transition-colors border-t"
                    style={{
                      color: "var(--color-error)",
                      borderColor: "var(--color-border)",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = "transparent")
                    }
                  >
                    {t("navbar.logout", "Logout")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Link
                to="/login"
                className="text-sm font-medium transition-colors"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Login
              </Link>
              <Link
                to="/register"
                className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                style={{
                  backgroundColor: "var(--color-primary)",
                  color: "#ffffff",
                }}
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}