import Image from "next/image";
import { catalog } from "@/lib/catalog";
import { currentSeason } from "@/lib/anilist";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const query = q?.trim();

  let results: Awaited<ReturnType<typeof catalog.search>> = [];
  let error: string | null = null;

  try {
    if (query) {
      results = await catalog.search(query);
    } else {
      const { season, year } = currentSeason();
      results = await catalog.getSeasonal(season, year);
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

        <ul className="mt-4 grid min-h-4 grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {results.map((anime, idx) => (
            <li
              key={anime.anilistId ?? idx}
              className="group overflow-hidden rounded-2xl border border-border bg-surface transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent/20"
            >
              {anime.coverImageUrl && (
                <Image
                  src={anime.coverImageUrl}
                  alt={anime.title}
                  width={230}
                  height={345}
                  sizes="(max-width:640px) 50vw, 25vw"
                  className="aspect-2/3 w-full object-cover"
                  loading="eager"
                />
              )}
              <div className="p-3">
                <p className="line-clamp-2 text-base font-medium text-foreground">
                  {anime.title}
                </p>
                <p className="mt-1 text-sm text-accent">
                  {`${anime.episodeCount ?? "?"} eps`}
                </p>
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
