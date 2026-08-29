"use client";

import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/auth-actions";

const HIDDEN_PATHS = new Set(["/login", "/register"]);

export default function SiteNav({ loggedIn }: { loggedIn: boolean }) {
  const pathname = usePathname();
  if (HIDDEN_PATHS.has(pathname)) return null;

  return (
    <nav className="border-b border-neutral-800 bg-neutral-950 px-6 py-3 text-sm text-neutral-100">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <a href="/" className="font-semibold">
          Animelix
        </a>
        <div className="flex items-center gap-3">
          <a href="/search" className="text-neutral-300 hover:text-white">
            Buscar
          </a>
          {loggedIn ? (
            <>
              <a href="/watchlist" className="text-neutral-300 hover:text-white">
                Perfil
              </a>
              <form action={signOutAction}>
                <button type="submit" className="text-neutral-300 hover:text-white">
                  Sair
                </button>
              </form>
            </>
          ) : (
            <>
              <a href="/login" className="text-neutral-300 hover:text-white">
                Entrar
              </a>
              <a
                href="/register"
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-500"
              >
                Registrar
              </a>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
