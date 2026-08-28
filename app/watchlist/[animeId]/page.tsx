import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getWatchEntry } from "@/lib/watchlist";
import { computeProgress } from "@/lib/progress";
import {
  markEpisodeAction,
  undoLastAction,
  removeFromWatchlistAction,
} from "@/lib/watchlist-actions";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("pt-BR");
}

export default async function WatchEntryPage({
  params,
}: {
  params: Promise<{ animeId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { animeId: raw } = await params;
  const anilistId = Number(raw);
  if (!Number.isFinite(anilistId)) redirect("/search");

  const entry = await getWatchEntry(session.user.id, anilistId);
  if (!entry) redirect(`/anime/${anilistId}`);

  const total = entry.anime.episodeCount;
  const progress = computeProgress(entry.episodeWatches, total);

  const watchedByEpisode = new Map<number, Date[]>();
  for (const ew of entry.episodeWatches) {
    const list = watchedByEpisode.get(ew.episode) ?? [];
    list.push(ew.watchedAt);
    watchedByEpisode.set(ew.episode, list);
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-8 text-neutral-100">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{entry.anime.title}</h1>
            <p className="mt-1 text-sm text-neutral-400">
              {progress.watchedCount} de {total ?? "?"} episódios assistidos
              {progress.last
                ? ` · último: S${progress.last.season}E${progress.last.episode} em ${fmtDate(progress.last.watchedAt)}`
                : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <form action={undoLastAction}>
              <input type="hidden" name="anilistId" value={anilistId} />
              <button
                type="submit"
                className="rounded-md border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-900"
              >
                Undo last
              </button>
            </form>
            <form action={removeFromWatchlistAction}>
              <input type="hidden" name="anilistId" value={anilistId} />
              <button
                type="submit"
                className="rounded-md border border-red-800 px-3 py-2 text-xs text-red-300 hover:bg-red-950"
              >
                Remover
              </button>
            </form>
          </div>
        </div>

        {total == null ? (
          <p className="mt-6 rounded-md border border-amber-700 bg-amber-950 p-3 text-sm text-amber-300">
            Total de episódios indisponível na AniList para este título.
          </p>
        ) : (
          <ul className="mt-6 divide-y divide-neutral-800 rounded-lg border border-neutral-800">
            {Array.from({ length: total }, (_, i) => i + 1).map((ep) => {
              const dates = watchedByEpisode.get(ep) ?? [];
              return (
                <li key={ep} className="flex items-center justify-between gap-4 p-3">
                  <div className="text-sm">
                    <span className="font-medium">Episódio {ep}</span>
                    {dates.length > 0 && (
                      <span className="ml-2 text-xs text-emerald-400">
                        assistido{dates.length > 1 ? ` (${dates.length}x)` : ""}:{" "}
                        {dates.map(fmtDate).join(", ")}
                      </span>
                    )}
                  </div>
                  <form action={markEpisodeAction} className="flex items-center gap-2">
                    <input type="hidden" name="anilistId" value={anilistId} />
                    <input type="hidden" name="season" value={1} />
                    <input type="hidden" name="episode" value={ep} />
                    <input
                      type="date"
                      name="watchedAt"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium hover:bg-emerald-600"
                    >
                      Marcar
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        <a href="/watchlist" className="mt-6 inline-block text-sm text-emerald-400">
          ← Minha watchlist
        </a>
      </div>
    </main>
  );
}
