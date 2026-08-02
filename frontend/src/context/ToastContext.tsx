import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import Toast from "../components/Toast";

type ToastIcon = "success" | "achievement" | "game" | "friend" | "xp";

interface ToastItem {
  message: string;
  icon?: ToastIcon;
  duration?: number;
  position?: "bottom-end" | "center";
  tone?: "success" | "achievement" | "message";
  onClick?: () => void;
  avatar?: string;
}

interface ToastContextType {
  showToast: (item: ToastItem) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const [active, setActive] = useState<ToastItem | null>(null);
  const processingRef = useRef(false);
  const audioUnlocked = useRef(false);

  // Unlock audio on first user interaction
  useEffect(() => {
    const unlock = () => {
      if (audioUnlocked.current) return;
      audioUnlocked.current = true;
      new Audio("/sounds/notification.mp3"); // preload
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    };
    document.addEventListener("click", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  const showToast = useCallback((item: ToastItem) => {
    setQueue((prev) => [...prev, item]);
  }, []);

  const handleClose = useCallback(() => {
    setActive(null);
    processingRef.current = false;
  }, []);

  useEffect(() => {
    if (active || queue.length === 0 || processingRef.current) return;
    processingRef.current = true;
    const next = queue[0];
    setQueue((prev) => prev.slice(1));
    setActive(next);
    try {
      const a = new Audio("/sounds/notification.mp3");
      a.volume = 0.3;
      a.play().catch(() => {});
    } catch (e) {
      console.warn("Notification sound error:", e);
    }
  }, [active, queue]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {active && (
        <Toast
          message={active.message}
          icon={active.icon}
          avatar={active.avatar}
          onClose={handleClose}
          onClick={active.onClick}
          duration={active.duration ?? 4000}
          position={active.position ?? "bottom-end"}
          tone={active.tone ?? "success"}
        />
      )}
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
