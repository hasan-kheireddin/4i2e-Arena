import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { fetchFriendships, type FriendshipRecord } from "../services/chat";
import { useAuth } from "./AuthContext";

interface FriendshipContextType {
  friendships: FriendshipRecord[];
  setFriendships: (f: FriendshipRecord[] | ((prev: FriendshipRecord[]) => FriendshipRecord[])) => void;
  addFriendship: (f: FriendshipRecord) => void;
  updateFriendship: (id: string, updates: Partial<FriendshipRecord>) => void;
  removeFriendship: (id: string) => void;
  deduplicate: () => void;
  refresh: () => void;
}

const FriendshipContext = createContext<FriendshipContextType | null>(null);

export function FriendshipProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [friendships, setFriendships] = useState<FriendshipRecord[]>([]);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchFriendships();
      const seen = new Set<string>();
      const unique = data.filter((f) => {
        if (seen.has(f.other_user_id)) return false;
        seen.add(f.other_user_id);
        return true;
      });
      setFriendships(unique);
    } catch {}
  }, []);

  useEffect(() => {
    if (loading) return;
    if (user) void refresh();
    else setFriendships([]);
  }, [loading, refresh, user]);

  const addFriendship = useCallback((f: FriendshipRecord) => {
    setFriendships((prev) => {
      if (prev.some((x) => x.id === f.id || x.other_user_id === f.other_user_id)) return prev;
      return [...prev, f];
    });
  }, []);

  const updateFriendship = useCallback((id: string, updates: Partial<FriendshipRecord>) => {
    setFriendships((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }, []);

  const deduplicate = useCallback(() => {
    setFriendships((prev) => {
      const seen = new Set<string>();
      return prev.filter((f) => {
        if (seen.has(f.other_user_id)) return false;
        seen.add(f.other_user_id);
        return true;
      });
    });
  }, []);

  const removeFriendship = useCallback((id: string) => {
    setFriendships((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return (
    <FriendshipContext.Provider value={{ friendships, setFriendships, addFriendship, updateFriendship, removeFriendship, deduplicate, refresh }}>
      {children}
    </FriendshipContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFriendships() {
  const context = useContext(FriendshipContext);
  if (!context) throw new Error("useFriendships must be used within FriendshipProvider");
  return context;
}
