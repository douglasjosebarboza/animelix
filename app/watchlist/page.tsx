import Image from "next/image";
import { requireUser } from "@/auth";
import { listWatchEntries } from "@/lib/watchlist";
import {
  removeFromWatchlistAction,
  deleteAccountAction,
} from "@/lib/watchlist-actions";

const STATUS_ORDER: string[] = ["watching", "completed"];

const STATUS_LABEL: Record<string, string> = {
  watching: "Assistindo",
  completed: "Completo",
};

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams?: Promise<{ cursor?: string }>;
}) {
  const user = await requireUser();
  const { cursor } = (await searchParams) ?? {};
  const entries = await listWatchEntries(user.id, { take: 20, cursor });
  const byStatus = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = byStatus.get(entry.status) ?? [];
    list.push(entry);
    byStatus.set(entry.status, list);
  }

  return (
    <main className="flex-1 bg-background p-8 text-foreground">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold text-gradient">Minha Watchlist</h1>
          <form action={deleteAccountAction}>
            <button
              type="submit"
              className="cursor-pointer rounded-md border border-red-800 px-3 py-2 text-base text-red-300 hover:bg-red-950"
            >
              Excluir Conta
            </button>
          </form>
        </div>

        {entries.length === 0 ? (
          <p className="mt-6 text-base text-muted">
            Nenhum anime na sua lista ainda. Busque acima para começar.
          </p>
        ) : (
          <>
            <div className="mt-6 space-y-8">
              {STATUS_ORDER.map((status) => {
                const group = byStatus.get(status);
                if (!group || group.length === 0) return null;
                return (
                  <section key={status}>
                    <h2 className="mb-2 inline-block rounded-full bg-surface-2 px-3 py-1 text-base font-semibold text-accent">
                      {STATUS_LABEL[status]} ({group.length})
                    </h2>
                    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {group.map((entry) => (
                        <li
                          key={entry.id}
                          className="group overflow-hidden rounded-2xl border border-border bg-surface transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent/20"
                        >
                          <a
                            href={`/watchlist/${entry.anime.anilistId}`}
                            className="block cursor-pointer"
                          >
                            {entry.anime.coverImageUrl && (
                              <Image
                                src={entry.anime.coverImageUrl}
                                alt={entry.anime.title}
                                width={230}
                                height={345}
                                sizes="(max-width:640px) 50vw, 25vw"
                                className="aspect-2/3 w-full object-cover"
                                loading="eager"
                              />
                            )}
                            <div className="p-3">
                              <p className="line-clamp-2 text-base font-medium text-foreground">
                                {entry.anime.title}
                              </p>
                              <p className="mt-1 text-sm capitalize text-accent">
                                {entry.status === "watching"
                                  ? "assistindo"
                                  : "completado"}
                              </p>
                            </div>
                          </a>
                          <div className="p-3 pt-0">
                            <form action={removeFromWatchlistAction}>
                              <input
                                type="hidden"
                                name="anilistId"
                                value={entry.anime.anilistId}
                              />
                              <button
                                type="submit"
                                className="w-full cursor-pointer rounded-md border border-red-800 px-3 py-1.5 text-sm text-red-300 hover:bg-red-950"
                              >
                                Remover
                              </button>
                            </form>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
            {entries.length === 20 && (
              <div className="mt-8 text-center">
                <a
                  href={`/watchlist?cursor=${entries[entries.length - 1].id}`}
                  className="inline-block rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-2"
                >
                  Próxima página
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
