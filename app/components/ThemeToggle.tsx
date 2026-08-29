"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // ignore storage errors (private mode)
    }
    setDark(next);
  }

  return (
    <button
      type="submit"
      onClick={toggle}
      aria-label="Alternar tema"
      className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:bg-surface-2"
    >
      {dark ? "☀" : "☾"}
    </button>
  );
}
