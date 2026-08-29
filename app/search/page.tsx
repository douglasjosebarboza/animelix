import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { searchAnime } from "@/lib/catalogue";
import { addAnimeAction } from "@/lib/anime-actions";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { q } = await searchParams;

  let results: Awaited<ReturnType<typeof searchAnime>> = [];
  let error: string | null = null;
  if (q) {
    try {
      results = await searchAnime(q);
    } catch (err) {
      error = `Não foi possível buscar na AniList: ${(err as Error).message}`;
    }
  }

  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-gradient">Buscar Anime</h1>

        <form className="mt-4 flex gap-2" method="get" action="/search">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Título do anime..."
            className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
          <button
            type="submit"
            className="btn-anime rounded-md px-4 py-2 text-sm font-medium"
          >
            Buscar
          </button>
        </form>

        {error && (
          <p className="mt-4 rounded-md border border-amber-700 bg-amber-950 p-3 text-sm text-amber-300">
            {error}
          </p>
        )}

        {q && !error && (
          <p className="mt-4 text-sm text-muted">
            {results.length} resultado(s) para &quot;{q}&quot;
          </p>
        )}

        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {results.map((anime) => (
            <li
              key={anime.anilistId}
              className="group overflow-hidden rounded-2xl border border-border bg-surface transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent/20"
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
                <p className="mt-1 text-xs text-muted">
                  {anime.episodeCount ?? "?"} eps
                  {anime.seasonCount ? ` · ${anime.seasonCount} temp` : ""}
                </p>
                <form action={addAnimeAction} className="mt-3">
                  <input type="hidden" name="anilistId" value={anime.anilistId} />
                  <button
                    type="submit"
                    className="btn-anime w-full rounded-md px-2 py-1.5 text-xs font-medium"
                  >
                    Adicionar
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
