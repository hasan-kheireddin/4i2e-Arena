import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import type { User } from "../services/auth";
import {
  getProfile,
  logout as apiLogout,
  updateProfile,
} from "../services/auth";
import { clearTokens, hasPotentialSession } from "../services/api";
import { setAppLanguage } from "../i18n";
import {
  forgetLanguageChoice,
  hasExplicitLanguageChoice,
  normalizeLanguage,
} from "../i18n/language";

export type { User };

interface AuthContextType {
  user: User | null;
  /** Set the user after a successful login / register / 2FA verify */
  setUser: (user: User | null) => void;
  /** Log out — blacklists refresh token + clears local state */
  logout: () => Promise<void>;
  /** True while we check for an existing session on mount */
  loading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, try to restore the session from stored JWT tokens
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!hasPotentialSession()) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        // Access tokens live in memory only, so after a reload there is none to
        // send; apiFetch mints one before the request rather than eating a 401.
        const profile = await getProfile();
        if (!cancelled) setUser(profile);
      } catch {
        // Token invalid / expired and refresh also failed
        // Only clear tokens if this effect run is still active (not cancelled by StrictMode)
        if (!cancelled) clearTokens();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // The account's saved language normally wins once we know who is signed in, so
  // the choice follows the user across devices instead of living only in this
  // browser. The exception is a language the user just picked by hand on the way
  // in: every account reads "en" until it is explicitly changed, so honouring the
  // profile unconditionally used to throw that pick away at the login boundary.
  // A deliberate choice wins instead, and is written back so it carries over.
  const preferredLanguage = user?.preferred_language;
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;

    const accountLanguage = normalizeLanguage(preferredLanguage);
    if (!hasExplicitLanguageChoice()) {
      if (preferredLanguage) setAppLanguage(preferredLanguage);
      return;
    }

    const chosen = normalizeLanguage(localStorage.getItem("i18nextLng"));
    setAppLanguage(chosen);
    if (chosen === accountLanguage) return;

    // Persist so the pick follows the account; a failure here is not worth
    // surfacing — the language is already applied, it just isn't saved yet.
    updateProfile({ preferred_language: chosen })
      .then((updated) => setUser((current) => (current ? { ...current, ...updated } : current)))
      .catch(() => {});
  }, [userId, preferredLanguage]);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    forgetLanguageChoice();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        logout,
        loading,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
