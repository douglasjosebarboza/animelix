import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAnime } from "@/lib/catalogue";
import { getWatchEntry } from "@/lib/watchlist";
import { refreshAnimeAction } from "@/lib/anime-actions";
import { addToWatchlistAction, setAutoPauseAction } from "@/lib/watchlist-actions";

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
      <main className="min-h-screen bg-background p-8 text-foreground">
        <div className="mx-auto max-w-2xl">
          <p className="rounded-md border border-amber-700 bg-amber-950 p-3 text-sm text-amber-300">
            Não foi possível carregar este anime da AniList: {(err as Error).message}
          </p>
          <a href="/search" className="mt-4 inline-block text-sm text-accent">
            ← Voltar à busca
          </a>
        </div>
      </main>
    );
  }

  const entry = await getWatchEntry(session.user.id, anilistId);

  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <div className="mx-auto flex max-w-2xl gap-6">
        {anime.coverImageUrl && (
          <img
            src={anime.coverImageUrl}
            alt={anime.title}
            className="h-64 w-44 shrink-0 rounded-lg object-cover"
          />
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gradient">{anime.title}</h1>
          <dl className="mt-4 space-y-1 text-sm text-muted">
            <div className="flex gap-2">
              <dt className="w-32 text-muted">Episódios:</dt>
              <dd>{anime.episodeCount ?? "?"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 text-muted">Temporadas:</dt>
              <dd>{anime.seasonCount ?? "?"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 text-muted">Snapshot:</dt>
              <dd>{anime.snapshotAt.toLocaleString()}</dd>
            </div>
          </dl>

          {stale && (
            <p className="mt-3 rounded-md border border-amber-700 bg-amber-950 p-2 text-xs text-amber-300">
              Dados podem estar desatualizados (TTL de 24h expirado).
            </p>
          )}

          {error === "already_in_watchlist" && (
            <p className="mt-3 rounded-md border border-amber-700 bg-amber-950 p-2 text-xs text-amber-300">
              Este anime já está na sua watchlist.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {entry ? (
              <a
                href={`/watchlist/${anilistId}`}
                className="btn-anime rounded-md px-4 py-2 text-sm font-medium"
              >
                Ver na watchlist
              </a>
            ) : (
              <form action={addToWatchlistAction}>
                <input type="hidden" name="anilistId" value={anilistId} />
                <button
                  type="submit"
                  className="btn-anime rounded-md px-4 py-2 text-sm font-medium"
                >
                  Add to watchlist
                </button>
              </form>
            )}

            <form action={refreshAnimeAction}>
              <input type="hidden" name="anilistId" value={anilistId} />
              <button
                type="submit"
                className="btn-ghost rounded-md px-4 py-2 text-sm"
              >
                Refresh from AniList
              </button>
            </form>
          </div>

          {entry && (
            <form
              action={setAutoPauseAction}
              className="mt-4 flex items-center gap-3 rounded-md border border-border p-3"
            >
              <input type="hidden" name="anilistId" value={anilistId} />
              <input
                type="checkbox"
                name="enabled"
                value="on"
                defaultChecked={entry.autoPauseEnabled}
                className="h-4 w-4"
              />
              <span className="flex-1 text-xs text-muted">
                Pausar automaticamente após inatividade
              </span>
              <button
                type="submit"
                className="btn-ghost rounded-md px-3 py-1.5 text-xs"
              >
                Salvar
              </button>
            </form>
          )}

          <a href="/search" className="mt-4 inline-block text-sm text-accent">
            ← Voltar à busca
          </a>
        </div>
      </div>
    </main>
  );
}
