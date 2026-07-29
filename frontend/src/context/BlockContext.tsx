import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { fetchBlocks, blockUser, unblockUser, type BlockRecord } from "../services/chat";
import { useAuth } from "./AuthContext";

interface BlockContextType {
  blocks: BlockRecord[];
  blockedUserIds: Set<string>;
  blockedByUserIds: Set<string>;
  block: (userId: string) => Promise<void>;
  unblock: (blockId: string) => Promise<void>;
  refresh: () => void;
}

const BlockContext = createContext<BlockContextType | null>(null);

export function BlockProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<BlockRecord[]>([]);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchBlocks();
      setBlocks(data);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const block = useCallback(async (userId: string) => {
    try {
      const record = await blockUser(userId);
      setBlocks((prev) => [...prev, record]);
    } catch {}
  }, []);

  const unblock = useCallback(async (blockId: string) => {
    try {
      await unblockUser(blockId);
      setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    } catch {}
  }, []);

  const blockedUserIds = new Set(blocks.filter((b) => b.blocker === user?.id).map((b) => b.blocked));
  const blockedByUserIds = new Set(blocks.filter((b) => b.blocked === user?.id).map((b) => b.blocker));

  return (
    <BlockContext.Provider value={{ blocks, blockedUserIds, blockedByUserIds, block, unblock, refresh }}>
      {children}
    </BlockContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBlocks() {
  const context = useContext(BlockContext);
  if (!context) throw new Error("useBlocks must be used within BlockProvider");
  return context;
}
