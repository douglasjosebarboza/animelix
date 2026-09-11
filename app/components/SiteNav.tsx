"use client";

import Image from "next/image";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { signOutAction } from "@/lib/auth-actions";
import ThemeToggle from "@/app/components/ThemeToggle";

type SearchResult = {
  anilistId: number;
  title: string;
  coverImageUrl: string | null;
};

export default function SiteNav({ loggedIn }: { loggedIn: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        close();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [close]);

  function handleChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(value.trim())}`,
        );
        const data = await res.json();
        setResults(data);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 100);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      router.push(`/?q=${encodeURIComponent(q)}`);
      setOpen(false);
    }
  }

  function selectResult(anilistId: number) {
    setQuery("");
    setResults([]);
    setOpen(false);
    router.push(`/anime/${anilistId}`);
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/70 px-6 py-3 text-base backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-7xl items-center">
        <a
          href="/"
          className="cursor-pointer text-3xl font-extrabold tracking-tight text-gradient"
        >
          Animelix
        </a>
        <div ref={wrapperRef} className="relative mx-auto">
          <form onSubmit={handleSubmit} className="flex">
            <input
              type="text"
              value={query}
              onChange={(e) => handleChange(e.target.value)}
              onFocus={() => results.length > 0 && setOpen(true)}
              placeholder="Buscar anime..."
              className="w-80 rounded-l-md border border-border bg-surface px-3 py-1.5 text-base text-foreground outline-none focus:w-96 focus:border-accent transition-all"
            />
            <button
              type="submit"
              className="btn-anime cursor-pointer rounded-r-md px-3 py-1.5 text-sm font-medium"
            >
              {loading ? "..." : "Buscar"}
            </button>
          </form>
          {open && results.length > 0 && (
            <ul className="absolute left-0 top-full z-50 mt-1 max-h-80 w-full overflow-auto rounded-md border border-border bg-surface shadow-lg">
              {results.map((anime) => (
                <li key={anime.anilistId}>
                  <button
                    type="button"
                    onClick={() => selectResult(anime.anilistId)}
                    className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-base hover:bg-surface-2 transition-colors"
                  >
                    {anime.coverImageUrl && (
                      <Image
                        src={anime.coverImageUrl}
                        alt=""
                        width={28}
                        height={40}
                        className="h-10 w-7 rounded object-cover"
                        loading="eager"
                      />
                    )}
                    <span className="line-clamp-1">{anime.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center gap-3">
          {loggedIn ? (
            <>
              <a
                href="/watchlist"
                className="cursor-pointer text-muted hover:text-foreground"
              >
                Watchlist
              </a>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="cursor-pointer text-muted hover:text-foreground"
                >
                  Sair
                </button>
              </form>
            </>
          ) : (
            <>
              <a
                href="/login"
                className="cursor-pointer text-muted hover:text-foreground"
              >
                Entrar
              </a>
              <a
                href="/register"
                className="btn-anime cursor-pointer rounded-md px-3 py-1.5"
              >
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
