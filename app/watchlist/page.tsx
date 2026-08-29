import { requireUser } from "@/auth";
import { listWatchEntries } from "@/lib/watchlist";
import { removeFromWatchlistAction, deleteAccountAction } from "@/lib/watchlist-actions";

const STATUS_ORDER: string[] = [
  "plan_to_watch",
  "watching",
  "completed",
  "paused",
  "dropped",
];

const STATUS_LABEL: Record<string, string> = {
  plan_to_watch: "Planejar assistir",
  watching: "Assistindo",
  completed: "Completo",
  paused: "Pausado",
  dropped: "Abandonado",
};

export default async function WatchlistPage() {
  const user = await requireUser();

  const entries = await listWatchEntries(user.id);
  const byStatus = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = byStatus.get(entry.status) ?? [];
    list.push(entry);
    byStatus.set(entry.status, list);
  }

  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gradient">Minha Watchlist</h1>
            <p className="text-sm text-muted">
              Logado como {user.email}
            </p>
          </div>
          <form action={deleteAccountAction}>
            <button
              type="submit"
              className="rounded-md border border-red-800 px-3 py-2 text-sm text-red-300 hover:bg-red-950"
            >
              Excluir conta
            </button>
          </form>
        </div>

        <div className="mt-6 flex gap-4">
          <a
            href="/search"
            className="text-sm text-emerald-400 hover:underline"
          >
            + Buscar animes na AniList
          </a>
          <a
            href="/activity"
            className="text-sm text-emerald-400 hover:underline"
          >
            Ver atividade
          </a>
        </div>

        {entries.length === 0 ? (
            <p className="mt-6 text-sm text-muted">
            Nenhum anime na sua lista ainda. Busque acima para começar.
          </p>
        ) : (
          <div className="mt-6 space-y-8">
            {STATUS_ORDER.map((status) => {
              const group = byStatus.get(status);
              if (!group || group.length === 0) return null;
              return (
                <section key={status}>
                  <h2 className="mb-2 inline-block rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold text-accent">{STATUS_LABEL[status]} ({group.length})</h2>
                  <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
                    {group.map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-4 p-3">
                        <a
                          href={`/watchlist/${entry.anime.anilistId}`}
                          className="flex items-center gap-3 hover:text-emerald-400"
                        >
                          {entry.anime.coverImageUrl && (
                            <img
                              src={entry.anime.coverImageUrl}
                              alt={entry.anime.title}
                              className="h-12 w-9 rounded object-cover"
                            />
                          )}
                          <span>
                            <span className="block text-sm font-medium">{entry.anime.title}</span>
                            <span className="block text-xs text-muted">{entry.status}</span>
                          </span>
                        </a>
                        <form action={removeFromWatchlistAction}>
                          <input
                            type="hidden"
                            name="anilistId"
                            value={entry.anime.anilistId}
                          />
                          <button
                            type="submit"
                            className="rounded-md border border-red-800 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950"
                          >
                            Remover
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
