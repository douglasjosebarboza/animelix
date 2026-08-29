import { getSeasonalAnime } from "@/lib/catalogue";
import { ANILIST_GENRES } from "@/lib/genres";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string }>;
}) {
  const { genre } = await searchParams;

  const validGenre = genre && (ANILIST_GENRES as readonly string[]).includes(genre) ? genre : undefined;

  let results: Awaited<ReturnType<typeof getSeasonalAnime>> = [];
  let error: string | null = null;
  try {
    results = await getSeasonalAnime(validGenre);
  } catch (err) {
    error = `Não foi possível carregar a temporada da AniList: ${(err as Error).message}`;
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-8 text-neutral-100">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold">Temporada atual</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Animes da temporada, do mais bem avaliado ao menos.
        </p>

        <form className="mt-4 flex flex-wrap items-end gap-2" method="get" action="/">
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Gênero
            <select
              name="genre"
              defaultValue={validGenre ?? ""}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
            >
              <option value="">Todos</option>
              {ANILIST_GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
          >
            Filtrar
          </button>
          {validGenre && (
            <a href="/" className="text-sm text-emerald-400 hover:underline">
              Limpar
            </a>
          )}
        </form>

        {error && (
          <p className="mt-4 rounded-md border border-amber-700 bg-amber-950 p-3 text-sm text-amber-300">
            {error}
          </p>
        )}

        {!error && (
          <p className="mt-4 text-sm text-neutral-400">{results.length} anime(s) nesta temporada</p>
        )}

        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {results.map((anime) => (
            <li
              key={anime.anilistId}
              className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900"
            >
              {anime.coverImageUrl && (
                <img
                  src={anime.coverImageUrl}
                  alt={anime.title}
                  className="aspect-[2/3] w-full object-cover"
                />
              )}
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-medium">{anime.title}</p>
                <p className="mt-1 text-xs text-amber-400">
                  {anime.averageScore != null
                    ? `★ ${(anime.averageScore / 10).toFixed(1)}`
                    : "—"}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {anime.genres.slice(0, 3).map((g) => (
                    <span
                      key={g}
                      className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300"
                    >
                      {g}
                    </span>
                  ))}
                </div>
                <a
                  href={`/anime/${anime.anilistId}`}
                  className="mt-3 block w-full rounded-md bg-emerald-700 px-2 py-1.5 text-center text-xs font-medium hover:bg-emerald-600"
                >
                  Adicionar
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
