import { searchAnime, getSeasonalAnimeCached } from "@/lib/catalogue";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const query = q?.trim();

  let results:
    | Awaited<ReturnType<typeof getSeasonalAnimeCached>>
    | Awaited<ReturnType<typeof searchAnime>> = [];
  let error: string | null = null;

  try {
    if (query) {
      results = await searchAnime(query);
    } else {
      results = await getSeasonalAnimeCached();
    }
  } catch (err) {
    error = query
      ? `Não foi possível buscar na AniList: ${(err as Error).message}`
      : `Não foi possível carregar a temporada da AniList: ${(err as Error).message}`;
  }

  return (
    <main className="flex-1 bg-background p-8 text-foreground">
      <div className="mx-auto max-w-6xl">

        {error && (
          <p className="mt-4 rounded-md border border-amber-700 bg-amber-950 p-3 text-base text-amber-300">
            {error}
          </p>
        )}

        {!error && (
          <p className="mt-4 text-base text-muted">
            {query
              ? `${results.length} resultado(s)`
              : `${results.length} anime(s) nesta temporada`}
          </p>
        )}

        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {results.map((anime) => (
            <li
              key={anime.anilistId}
              className="group overflow-hidden rounded-2xl border border-border bg-surface transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent/20"
            >
              {anime.coverImageUrl && (
                <img
                  src={anime.coverImageUrl}
                  alt={anime.title}
                  className="aspect-2/3 w-full object-cover"
                />
              )}
              <div className="p-3">
                <p className="line-clamp-2 text-base font-medium text-foreground">
                  {anime.title}
                </p>
                <p className="mt-1 text-sm text-accent">
                  {"averageScore" in anime
                    ? anime.averageScore != null
                      ? `★ ${(anime.averageScore / 10).toFixed(1)}`
                      : "—"
                    : "episodeCount" in anime
                      ? `${anime.episodeCount ?? "?"} eps`
                      : ""}
                </p>
                {"genres" in anime && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {anime.genres.slice(0, 3).map((g) => (
                      <span
                        key={g}
                        className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}
                <a
                  href={`/anime/${anime.anilistId}`}
                  className="btn-anime mt-3 block w-full cursor-pointer rounded-md px-2 py-1.5 text-center text-sm font-medium"
                >
                  Ver detalhes
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
