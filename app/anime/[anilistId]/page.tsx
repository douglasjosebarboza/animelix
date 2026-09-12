import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCachedAnimeById } from "@/lib/anime-cache";
import { getWatchEntry } from "@/lib/watchlist";
import { computeProgress } from "@/lib/progress";
import { refreshAnimeAction } from "@/lib/anime-actions";
import {
  addToWatchlistAction,
  markEpisodeAction,
  removeEpisodeAction,
  removeFromWatchlistAction,
} from "@/lib/watchlist-actions";

export default async function AnimePage({
  params,
  searchParams,
}: {
  params: Promise<{ anilistId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { anilistId: raw } = await params;
  const { error } = await searchParams;
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
  const total = anime.episodeCount ?? null;
  const watches = entry?.episodeWatches ?? [];
  const progress = computeProgress(watches, total);
  const watchedSet = new Set<number>(watches.map((ew) => ew.episode));

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
                <dd>{anime.episodeCount ?? "?"}</dd>
              </div>
            </dl>
            {entry && (
              <>
                <p className="mt-1 text-base text-muted">
                  {progress.watchedCount} de {total ?? "?"} episódios assistidos
                </p>
                <p className="mt-1 text-sm text-muted">
                  Status: <span className="capitalize text-muted">{entry.status === "watching" ? "assistindo" : "completado"}</span>
                </p>
              </>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {entry ? (
                <form action={removeFromWatchlistAction}>
                  <input type="hidden" name="anilistId" value={anilistId} />
                  <button
                    type="submit"
                    className="cursor-pointer rounded-md border border-red-800 px-4 py-2 text-base text-red-300 hover:bg-red-950"
                  >
                    Remover
                  </button>
                </form>
              ) : (
                <form action={addToWatchlistAction}>
                  <input type="hidden" name="anilistId" value={anilistId} />
                  <button
                    type="submit"
                    className="cursor-pointer btn-anime rounded-md px-4 py-2 text-base font-medium"
                  >
                    Add to watchlist
                  </button>
                </form>
              )}

              <form action={refreshAnimeAction}>
                <input type="hidden" name="anilistId" value={anilistId} />
                <button
                  type="submit"
                  className="cursor-pointer btn-ghost rounded-md px-4 py-2 text-base"
                >
                  Refresh from AniList
                </button>
              </form>
            </div>
          </div>
        </div>

        {total == null ? (
          <p className="mt-6 rounded-md border border-amber-700 bg-amber-950 p-3 text-base text-amber-300">
            Total de episódios indisponível na AniList para este título.
          </p>
        ) : (
          <ul className="mt-6 divide-y divide-border rounded-lg border border-border">
            {Array.from({ length: total }, (_, i) => i + 1).map((ep) => {
              const watched = watchedSet.has(ep);
              return (
                <li key={ep} className="flex items-center justify-between gap-4 p-3">
                  <div className="text-base">
                    <span className="font-medium">Episódio {ep}</span>
                  </div>
                  {watched ? (
                    <form action={removeEpisodeAction}>
                      <input type="hidden" name="anilistId" value={anilistId} />
                      <input type="hidden" name="season" value={1} />
                      <input type="hidden" name="episode" value={ep} />
                      <input type="hidden" name="total" value={total ?? ""} />
                      <button
                        type="submit"
                        aria-label={`remover episódio ${ep}`}
                        className="cursor-pointer btn-anime rounded-md px-3 py-1.5 text-sm font-medium"
                      >
                        ✓ Assistido
                      </button>
                    </form>
                  ) : (
                    <form action={markEpisodeAction}>
                      <input type="hidden" name="anilistId" value={anilistId} />
                      <input type="hidden" name="season" value={1} />
                      <input type="hidden" name="episode" value={ep} />
                      <input type="hidden" name="total" value={total ?? ""} />
                      <button
                        type="submit"
                        aria-label={`marcar episódio ${ep}`}
                        className="cursor-pointer btn-ghost rounded-md px-3 py-1.5 text-sm font-medium"
                      >
                        Assistido
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
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
