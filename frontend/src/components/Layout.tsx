import { ReactNode, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Navbar } from "./Navbar";
import { trackPageView } from "../services/analytics";
import FloatingChatWidget from "./Chat/FloatingChatWidget";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();

  useEffect(() => {
    const pathWithQuery = `${location.pathname}${location.search}`;
    trackPageView(pathWithQuery).catch(() => {
      // Do not block UI rendering when telemetry fails.
    });
  }, [location.pathname, location.search]);

  // The full chat page already provides everything the floating widget does
  // (and its own chat socket) - mounting both at once would open two
  // independent websocket connections with divergent state, which is what
  // caused chat notifications to fire inconsistently.
  const showFloatingWidget = !location.pathname.startsWith("/chat");

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg)" }}>
      <Navbar />
      <main className="pt-16">
        <div className="p-6 max-w-screen-2xl mx-auto">
          {children}
        </div>
      </main>
      {showFloatingWidget && <FloatingChatWidget />}
    </div>
  );
}
