import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Toast, { type ToastData } from "../components/Toast";

export type { ToastData, ToastVariant } from "../components/Toast";

interface ToastContextType {
  showToast: (item: ToastData) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

interface ActiveToast extends ToastData {
  id: number;
}

/** Newer toasts push older ones down; beyond this the oldest is retired early. */
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const nextId = useRef(1);
  const audioUnlocked = useRef(false);

  // Browsers block audio until the user interacts; preload on the first gesture.
  useEffect(() => {
    const unlock = () => {
      if (audioUnlocked.current) return;
      audioUnlocked.current = true;
      new Audio("/sounds/notification.mp3");
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

  const showToast = useCallback((item: ToastData) => {
    setToasts((prev) => [...prev, { ...item, id: nextId.current++ }].slice(-MAX_VISIBLE));
    try {
      const a = new Audio("/sounds/notification.mp3");
      a.volume = 0.3;
      a.play().catch(() => {});
    } catch {
      /* audio is a nicety, never a failure path */
    }
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed z-[10000] flex flex-col items-end gap-2 pointer-events-none"
        style={{ bottom: "5rem", insetInlineEnd: "1.5rem" }}
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <Toast {...t} onClose={() => dismiss(t.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
