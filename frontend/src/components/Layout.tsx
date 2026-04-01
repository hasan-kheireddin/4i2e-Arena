import { ReactNode } from "react";
import { Navbar } from "./Navbar";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg)" }}>
      <Navbar />
      <main className="pt-16">
        <div className="p-6 max-w-screen-2xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
