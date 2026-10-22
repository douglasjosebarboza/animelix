"use client";

import { useSyncExternalStore } from "react";

/**
 * Evento interno que sinaliza mudança de tema.
 *
 * O componente lê o tema direto do DOM (a classe `dark` no <html>), então
 * usamos useSyncExternalStore em vez de useEffect + setState: o servidor e o
 * primeiro render do cliente continuam coincidentes (sem erro de hidratação) e
 * não há setState dentro de effect.
 */
const THEME_EVENT = "animelix-theme-change";

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_EVENT, onStoreChange);
}

function getThemeSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

/** Snapshot do servidor: o <head> inline decide o tema real no cliente. */
function getThemeServerSnapshot(): boolean {
  return true;
}

function getMountedSnapshot(): boolean {
  return true;
}

function getMountedServerSnapshot(): boolean {
  return false;
}

export default function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getThemeSnapshot, getThemeServerSnapshot);
  const mounted = useSyncExternalStore(subscribe, getMountedSnapshot, getMountedServerSnapshot);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // ignore storage errors (private mode)
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Alternar tema"
      className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-surface-2"
    >
      {mounted ? (dark ? "☀" : "☾") : "◐"}
    </button>
  );
}
