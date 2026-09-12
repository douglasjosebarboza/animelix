import { redirect, notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { getWatchEntry } from "@/lib/watchlist";
import { getCachedAnimeById } from "@/lib/anime-cache";
import { computeProgress } from "@/lib/progress";
import {
  markEpisodeAction,
  removeEpisodeAction,
  removeFromWatchlistAction,
} from "@/lib/watchlist-actions";

export default async function WatchEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ animeId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();

  const { animeId: raw } = await params;
  const anilistId = Number(raw);
  if (!Number.isFinite(anilistId)) redirect("/");

  const { error } = await searchParams;

  const [entry, seed] = await Promise.all([
    getWatchEntry(user.id, anilistId),
    getCachedAnimeById(anilistId).catch(() => null),
  ]);
  if (!entry) notFound();
  const anime = seed ?? { title: `Anime ${anilistId}` };
  const total = seed?.episodeCount ?? null;
  const progress = computeProgress(entry.episodeWatches, total);

  const watchedSet = new Set<number>(entry.episodeWatches.map((ew) => ew.episode));

  return (
    <main className="flex-1 bg-background p-8 text-foreground">
        <div className="mx-auto max-w-3xl">
          {error && (
            <p className="mb-4 rounded-md border border-amber-700 bg-amber-950 p-3 text-base text-amber-300">
              {error}
            </p>
          )}
          <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gradient">{anime.title}</h1>
            <p className="mt-1 text-base text-muted">
              {progress.watchedCount} de {total ?? "?"} episódios assistidos
            </p>
            <p className="mt-1 text-sm text-muted">
              Status: <span className="capitalize text-muted">{entry.status === "watching" ? "assistindo" : "completado"}</span>
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <form action={removeFromWatchlistAction}>
              <input type="hidden" name="anilistId" value={anilistId} />
              <button
                type="submit"
                className="cursor-pointer rounded-md border border-red-800 px-3 py-2 text-sm text-red-300 hover:bg-red-950"
              >
                Remover
              </button>
            </form>
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

        <a href="/watchlist" className="cursor-pointer mt-6 inline-block text-base text-accent">
          ← Minha watchlist
        </a>
      </div>
    </main>
  );
}
