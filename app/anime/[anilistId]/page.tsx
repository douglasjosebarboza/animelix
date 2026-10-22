import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCachedAnimeById } from "@/lib/anime-cache";
import { getWatchEntry } from "@/lib/watchlist";
import { computeProgress } from "@/lib/progress";
import { parsePositiveInt } from "@/lib/parse";
import { formatTimeUntilAiring } from "@/lib/anilist";
import { logEvent } from "@/lib/logger";
import {
  markEpisodeAction,
  removeEpisodeAction,
  markUpToAction,
  markAllAction,
  clearAllAction,
} from "@/lib/watchlist-actions";

export default async function AnimePage({
  params,
  searchParams,
}: {
  params: Promise<{ anilistId: string }>;
  searchParams: Promise<{ error?: string | string[]; epPage?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { anilistId: raw } = await params;
  const { error: errorParam, epPage: epPageParam } = await searchParams;
  const anilistId = Number(raw);

  if (!Number.isFinite(anilistId)) {
    redirect("/");
  }

  let anime;
  try {
    anime = await getCachedAnimeById(anilistId);
  } catch (err) {
    // Detalhe do erro só no log — a tela mostra uma mensagem genérica.
    logEvent("catalog_error", {
      scope: "anime",
      anilistId,
      message: (err as Error).message,
    });
    return (
      <main className="flex-1 bg-background p-8 text-foreground">
        <div className="mx-auto max-w-3xl">
          <p className="rounded-md border border-amber-700 bg-amber-950 p-3 text-base text-amber-300">
            Não foi possível carregar este anime da AniList agora. Tente novamente
            em instantes.
          </p>
          <Link
            href="/"
            className="cursor-pointer mt-4 inline-block text-base text-accent"
          >
            ← Voltar
          </Link>
        </div>
      </main>
    );
  }

  const entry = await getWatchEntry(session.user.id, anilistId);
  const error = Array.isArray(errorParam) ? errorParam[0] : errorParam;
  const total = anime.episodeCount ?? null;
  const watches = entry?.episodeWatches ?? [];
  const progress = computeProgress(watches, total);
  const watchedSet = new Set<number>(watches.map((ew) => ew.episode));
  // "Até aqui" no primeiro ep não visto equivale ao toggle simples:
  // só mostra quando há algum ep anterior não visto.
  let firstUnwatched = Number.POSITIVE_INFINITY;
  if (total != null) {
    for (let ep = 1; ep <= total; ep++) {
      if (!watchedSet.has(ep)) {
        firstUnwatched = ep;
        break;
      }
    }
  }
  const epTitle = (ep: number): string => {
    // episodeTitles pode vir ausente de cache antigo (formato pré-Task 1);
    // nesse caso degrada para "Episódio N" até o cache renovar.
    const t = (anime.episodeTitles ?? [])[ep - 1] ?? null;
    return t ? `${ep}. ${t}` : `Episódio ${ep}`;
  };
  // Próximo ep ainda não lançado (só 1 por vez, limite da AniList).
  // Cache antigo pode não ter o campo — degrada para null.
  const nextAiring = anime.nextAiringEpisode ?? null;
  const nextAiringLabel = nextAiring ? formatTimeUntilAiring(nextAiring.airingAt) : null;
  const nextAiringDate =
    nextAiring != null
      ? new Date(nextAiring.airingAt * 1000).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
  const PER_PAGE = 12;
  const pageCount = total == null ? 0 : Math.max(1, Math.ceil(total / PER_PAGE));
  const epPageRaw = Array.isArray(epPageParam) ? epPageParam[0] : (epPageParam ?? null);
  const epPageParsed = parsePositiveInt(epPageRaw) ?? 1;
  const epPage = pageCount > 0 ? Math.min(Math.max(epPageParsed, 1), pageCount) : 1;
  const pageEps =
    total != null
      ? Array.from({ length: total }, (_, i) => i + 1).slice(
          (epPage - 1) * PER_PAGE,
          epPage * PER_PAGE,
        )
      : [];

  return (
    <main className="flex-1 bg-background p-8 text-foreground">
      <div className="mx-auto max-w-3xl">
        {error && (
          <p className="mb-4 rounded-md border border-amber-700 bg-amber-950 p-2 text-sm text-amber-300">
            {error === "already_in_watchlist"
              ? "Este anime já está na sua watchlist."
              : error}
          </p>
        )}
        <div className="flex gap-6">
          {anime.coverImageUrl && (
            <Image
              src={anime.coverImageUrl}
              alt={anime.title}
              width={176}
              height={264}
              className="h-64 w-44 shrink-0 rounded-lg object-cover"
              loading="eager"
            />
          )}
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gradient">{anime.title}</h1>
            <dl className="mt-4 space-y-1 text-base text-muted">
              <div className="flex gap-2">
                <dt className="w-32 text-muted">Episódios:</dt>
                <dd>
                  {progress.watchedCount}/{total ?? "?"}
                </dd>
              </div>
            </dl>
            {anime.description && (
              <p className="mt-4 text-base text-muted">{anime.description}</p>
            )}

          </div>
        </div>

        {total == null ? (
          <p className="mt-6 rounded-md border border-amber-700 bg-amber-950 p-3 text-base text-amber-300">
            Total de episódios indisponível na AniList para este título.
          </p>
        ) : (
          <>
            <div className="mt-6 flex items-center justify-between gap-4">
              {!entry || watchedSet.size < total ? (
                <form action={markAllAction}>
                  <input type="hidden" name="anilistId" value={anilistId} />
                  <input type="hidden" name="epPage" value={epPage} />
                  <button
                    type="submit"
                    className="cursor-pointer rounded-md border border-border px-4 py-2 text-base text-foreground hover:bg-muted"
                  >
                    Marcar todos
                  </button>
                </form>
              ) : (
                <form action={clearAllAction}>
                  <input type="hidden" name="anilistId" value={anilistId} />
                  <input type="hidden" name="epPage" value={epPage} />
                  <button
                    type="submit"
                    className="cursor-pointer rounded-md border border-border px-4 py-2 text-base text-foreground hover:bg-muted"
                  >
                    Desmarcar todos
                  </button>
                </form>
              )}
              {nextAiring != null && nextAiringLabel != null && (
                <p
                  title={`Estreia em ${nextAiringDate}`}
                  className="text-right text-base text-muted"
                >
                  EP {nextAiring.episode} em {nextAiringLabel}
                </p>
              )}
            </div>
            <ul className="mt-6 divide-y divide-border rounded-lg border border-border">
              {pageEps.map((ep) => {
                const watched = watchedSet.has(ep);
                return (
                  <li key={ep} className="flex items-center justify-between gap-4 p-3">
                    <div className="text-base">
                      <span className="font-medium">{epTitle(ep)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {watched ? (
                        <form action={removeEpisodeAction}>
                          <input type="hidden" name="anilistId" value={anilistId} />
                          <input type="hidden" name="episode" value={ep} />
                          <input type="hidden" name="epPage" value={epPage} />
                          <button
                            type="submit"
                            aria-label={`remover episódio ${ep}`}
                            className="cursor-pointer btn-anime rounded-md px-3 py-1.5 text-sm font-medium"
                          >
                            ✓ Assistido
                          </button>
                        </form>
                      ) : (
                        <>
                          {ep > firstUnwatched && (
                            <form action={markUpToAction}>
                            <input type="hidden" name="anilistId" value={anilistId} />
                            <input type="hidden" name="episode" value={ep} />
                            <input type="hidden" name="epPage" value={epPage} />
                            <button
                              type="submit"
                              aria-label={`marcar até o episódio ${ep}`}
                              className="cursor-pointer btn-ghost rounded-md px-3 py-1.5 text-sm font-medium"
                            >
                              até aqui
                            </button>
                          </form>
                          )}
                          <form action={markEpisodeAction}>
                            <input type="hidden" name="anilistId" value={anilistId} />
                            <input type="hidden" name="episode" value={ep} />
                            <input type="hidden" name="epPage" value={epPage} />
                            <button
                              type="submit"
                              aria-label={`marcar episódio ${ep}`}
                              className="cursor-pointer btn-ghost rounded-md px-3 py-1.5 text-sm font-medium"
                            >
                              Assistido
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {pageCount > 1 && (
              <nav className="mt-4 flex items-center justify-center gap-4 text-base">
                {epPage > 1 ? (
                  <a
                    href={`/anime/${anilistId}?epPage=${epPage - 1}`}
                    className="cursor-pointer text-accent"
                  >
                    ← Anterior
                  </a>
                ) : (
                  <span className="text-muted">← Anterior</span>
                )}
                <span className="text-muted">
                  Página {epPage} de {pageCount}
                </span>
                {epPage < pageCount ? (
                  <a
                    href={`/anime/${anilistId}?epPage=${epPage + 1}`}
                    className="cursor-pointer text-accent"
                  >
                    Próxima →
                  </a>
                ) : (
                  <span className="text-muted">Próxima →</span>
                )}
              </nav>
            )}
          </>
        )}

        <Link
          href="/"
          className="cursor-pointer mt-4 inline-block text-base text-accent"
        >
          ← Voltar
        </Link>
      </div>
    </main>
  );
}
