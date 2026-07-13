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
} from "../services/auth";
import { clearTokens } from "../services/api";

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
      try {
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

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
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
