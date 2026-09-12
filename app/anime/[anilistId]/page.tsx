import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCachedAnimeById } from "@/lib/anime-cache";
import { getWatchEntry } from "@/lib/watchlist";
import { computeProgress } from "@/lib/progress";
import { parsePositiveInt } from "@/lib/parse";
import {
  markEpisodeAction,
  removeEpisodeAction,
  removeFromWatchlistAction,
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
    return (
      <main className="flex-1 bg-background p-8 text-foreground">
        <div className="mx-auto max-w-3xl">
          <p className="rounded-md border border-amber-700 bg-amber-950 p-3 text-base text-amber-300">
            Não foi possível carregar este anime da AniList:{" "}
            {(err as Error).message}
          </p>
          <a
            href="/"
            className="cursor-pointer mt-4 inline-block text-base text-accent"
          >
            ← Voltar
          </a>
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
  const epTitle = (ep: number): string => {
    // episodeTitles pode vir ausente de cache antigo (formato pré-Task 1);
    // nesse caso degrada para "Episódio N" até o cache renovar.
    const t = (anime.episodeTitles ?? [])[ep - 1] ?? null;
    return t ? `${ep}. ${t}` : `Episódio ${ep}`;
  };
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

            {entry && (
              <div className="mt-4 flex flex-wrap gap-2">
                <form action={removeFromWatchlistAction}>
                  <input type="hidden" name="anilistId" value={anilistId} />
                  <button
                    type="submit"
                    className="cursor-pointer rounded-md border border-red-800 px-4 py-2 text-base text-red-300 hover:bg-red-950"
                  >
                    Remover
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {total == null ? (
          <p className="mt-6 rounded-md border border-amber-700 bg-amber-950 p-3 text-base text-amber-300">
            Total de episódios indisponível na AniList para este título.
          </p>
        ) : (
          <>
            {!entry || watchedSet.size < total ? (
              <form action={markAllAction} className="mt-6">
                <input type="hidden" name="anilistId" value={anilistId} />
                <input type="hidden" name="total" value={total} />
                <input type="hidden" name="epPage" value={epPage} />
                <button
                  type="submit"
                  className="cursor-pointer rounded-md border border-border px-4 py-2 text-base text-foreground hover:bg-muted"
                >
                  Marcar todos
                </button>
              </form>
            ) : (
              <form action={clearAllAction} className="mt-6">
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
                          <input type="hidden" name="season" value={1} />
                          <input type="hidden" name="episode" value={ep} />
                          <input type="hidden" name="total" value={total ?? ""} />
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
                          <form action={markUpToAction}>
                            <input type="hidden" name="anilistId" value={anilistId} />
                            <input type="hidden" name="season" value={1} />
                            <input type="hidden" name="episode" value={ep} />
                            <input type="hidden" name="total" value={total ?? ""} />
                            <input type="hidden" name="epPage" value={epPage} />
                            <button
                              type="submit"
                              aria-label={`marcar até o episódio ${ep}`}
                              className="cursor-pointer btn-ghost rounded-md px-3 py-1.5 text-sm font-medium"
                            >
                              até aqui
                            </button>
                          </form>
                          <form action={markEpisodeAction}>
                            <input type="hidden" name="anilistId" value={anilistId} />
                            <input type="hidden" name="season" value={1} />
                            <input type="hidden" name="episode" value={ep} />
                            <input type="hidden" name="total" value={total ?? ""} />
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

        <a
          href="/"
          className="cursor-pointer mt-4 inline-block text-base text-accent"
        >
          ← Voltar
        </a>
      </div>
    </main>
  );
}
