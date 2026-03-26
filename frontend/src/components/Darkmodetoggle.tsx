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
    <> </>
  );
}