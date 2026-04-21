import { ReactNode, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Navbar } from "./Navbar";
import GamificationNotifications from "./GamificationNotifications";
import { trackPageView } from "../services/analytics";

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

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg)" }}>
      <Navbar />
      <GamificationNotifications />
      <main className="pt-16">
        <div className="p-6 max-w-screen-2xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
