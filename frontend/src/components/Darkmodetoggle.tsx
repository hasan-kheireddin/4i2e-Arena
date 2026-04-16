import { useEffect } from "react";

export default function DarkModeToggle() {
  useEffect(() => {
    const saved = localStorage.getItem("darkMode");
    const isDark = saved !== null ? saved === "true" : true;
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("darkMode", isDark.toString());
  }, []);
  return (
    <> </>
  );
}
