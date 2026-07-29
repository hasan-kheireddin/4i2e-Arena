import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import Toast from "../components/Toast";

type ToastIcon = "success" | "achievement" | "game" | "friend" | "xp";

interface ToastItem {
  message: string;
  icon: ToastIcon;
  duration?: number;
  position?: "bottom-end" | "center";
  tone?: "success" | "achievement";
}

interface ToastContextType {
  showToast: (item: ToastItem) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const [active, setActive] = useState<ToastItem | null>(null);
  const processingRef = useRef(false);

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
  }, [active, queue]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {active && (
        <Toast
          message={active.message}
          icon={active.icon}
          onClose={handleClose}
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
