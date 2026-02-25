import { useState, useEffect } from "react";

export default function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Restore dark mode preference from localStorage on mount
    const savedMode = localStorage.getItem("darkMode");
    const isDarkMode = savedMode === "true";
    
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    }
    
    setIsDark(isDarkMode);
  }, []);

  const toggleDarkMode = () => {
    if (isDark) {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
      localStorage.setItem("darkMode", "false");
    } else {
      document.documentElement.classList.add("dark");
      setIsDark(true);
      localStorage.setItem("darkMode", "true");
    }
  };

  return (
    <button
      onClick={toggleDarkMode}
      className="fixed bottom-6 right-6 w-14 h-14 rounded-full transition-all z-50 hover:scale-110"
      style={{
        backgroundColor: isDark ? "#1e293b" : "#ffffff",
        border: "2px solid #38bdf8",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
      }}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        // Sun icon
        <svg
          className="w-7 h-7 mx-auto"
          fill="none"
          viewBox="0 0 24 24"
          stroke="#fbbf24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ) : (
        // Moon icon
        <svg
          className="w-7 h-7 mx-auto"
          fill="none"
          viewBox="0 0 24 24"
          stroke="#64748b"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
    </button>
  );
}