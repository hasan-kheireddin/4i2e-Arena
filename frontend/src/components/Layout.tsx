import { ReactNode, useState } from "react";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <Navbar />
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <main 
        className="pt-16 transition-all duration-250"
        style={{
          marginLeft: sidebarCollapsed ? '64px' : '240px',
        }}
      >
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}