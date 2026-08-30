"use client";

import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/auth-actions";
import ThemeToggle from "@/app/components/ThemeToggle";

const HIDDEN_PATHS = new Set(["/login", "/register"]);

export default function SiteNav({ loggedIn }: { loggedIn: boolean }) {
  const pathname = usePathname();
  if (HIDDEN_PATHS.has(pathname)) return null;

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/70 px-6 py-3 text-sm backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <a href="/" className="text-lg font-bold text-gradient">
          Animelix
        </a>
        <div className="flex items-center gap-3">
          <a href="/search" className="text-muted hover:text-foreground">
            Buscar
          </a>
          {loggedIn ? (
            <>
              <a href="/watchlist" className="text-muted hover:text-foreground">
                Perfil
              </a>
              <form action={signOutAction}>
                <button type="submit" className="text-muted hover:text-foreground">
                  Sair
                </button>
              </form>
            </>
          ) : (
            <>
              <a href="/login" className="text-muted hover:text-foreground">
                Entrar
              </a>
              <a href="/register" className="btn-anime rounded-md px-3 py-1.5">
                Registrar
              </a>
            </>
          )}
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
