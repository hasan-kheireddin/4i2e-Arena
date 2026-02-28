import { useEffect, useState } from "react";

export default function DarkModeToggle() {
  const [isDark, setIsDark] = useState(() => {
    // Check localStorage first, default to TRUE (dark mode)
    const saved = localStorage.getItem("darkMode");
    return saved !== null ? saved === "true" : true; // ← Default to true
  });

  useEffect(() => {
    // Apply dark mode on mount
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("darkMode", isDark.toString());
  }, [isDark]);

  const toggleDark = () => setIsDark(!isDark);

  return (
    <button
      onClick={toggleDark}
      className="fixed top-4 right-4 p-2 rounded-lg transition-colors z-50"
      style={{
        backgroundColor: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
        color: "var(--color-text-primary)",
      }}
      aria-label="Toggle dark mode"
    >
      {isDark ? "🌙" : "☀️"}
    </button>
  );
}