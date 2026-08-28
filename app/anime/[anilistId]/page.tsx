import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAnime } from "@/lib/catalogue";
import { refreshAnimeAction } from "@/lib/anime-actions";

export default async function AnimePage({
  params,
}: {
  params: Promise<{ anilistId: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { anilistId: raw } = await params;
  const anilistId = Number(raw);

  if (!Number.isFinite(anilistId)) {
    redirect("/search");
  }

  let anime;
  let stale = false;
  try {
    anime = await getAnime(anilistId);
    const ageHours = (Date.now() - anime.snapshotAt.getTime()) / 36e5;
    stale = ageHours > 24;
  } catch (err) {
    return (
      <main className="min-h-screen bg-neutral-950 p-8 text-neutral-100">
        <div className="mx-auto max-w-2xl">
          <p className="rounded-md border border-amber-700 bg-amber-950 p-3 text-sm text-amber-300">
            Não foi possível carregar este anime da AniList: {(err as Error).message}
          </p>
          <a href="/search" className="mt-4 inline-block text-sm text-emerald-400">
            ← Voltar à busca
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-8 text-neutral-100">
      <div className="mx-auto flex max-w-2xl gap-6">
        {anime.coverImageUrl && (
          <img
            src={anime.coverImageUrl}
            alt={anime.title}
            className="h-64 w-44 shrink-0 rounded-lg object-cover"
          />
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{anime.title}</h1>
          <dl className="mt-4 space-y-1 text-sm text-neutral-400">
            <div className="flex gap-2">
              <dt className="w-32 text-neutral-500">Episódios:</dt>
              <dd>{anime.episodeCount ?? "?"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 text-neutral-500">Temporadas:</dt>
              <dd>{anime.seasonCount ?? "?"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 text-neutral-500">Snapshot:</dt>
              <dd>{anime.snapshotAt.toLocaleString()}</dd>
            </div>
          </dl>

          {stale && (
            <p className="mt-3 rounded-md border border-amber-700 bg-amber-950 p-2 text-xs text-amber-300">
              Dados podem estar desatualizados (TTL de 24h expirado).
            </p>
          )}

          <form action={refreshAnimeAction} className="mt-4">
            <input type="hidden" name="anilistId" value={anime.anilistId} />
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
            >
              Refresh from AniList
            </button>
          </form>

          <a href="/search" className="mt-4 inline-block text-sm text-emerald-400">
            ← Voltar à busca
          </a>
        </div>
      </div>
    </main>
  );
}
