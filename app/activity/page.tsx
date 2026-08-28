import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { WatchStatus } from "@/lib/watchstatus";

const REASON_LABEL: Record<string, string> = {
  user_status_change: "Mudança de status",
  auto_completed: "Completou automaticamente",
  auto_paused: "Pausado por inatividade",
  user_dropped: "Abandonado",
};

const STATUS_LABEL: Record<WatchStatus, string> = {
  plan_to_watch: "Planejado",
  watching: "Assistindo",
  completed: "Completo",
  paused: "Pausado",
  dropped: "Abandonado",
};

function relativeTime(d: Date): string {
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  const seconds = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(Math.round(seconds), "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 2592000) return rtf.format(Math.round(seconds / 86400), "day");
  if (abs < 31536000) return rtf.format(Math.round(seconds / 2592000), "month");
  return rtf.format(Math.round(seconds / 31536000), "year");
}

export default async function ActivityPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const transitions = await prisma.statusTransition.findMany({
    where: { watchEntry: { userId: session.user.id } },
    include: { watchEntry: { include: { anime: true } } },
    orderBy: { occurredAt: "desc" },
  });

  return (
    <main className="min-h-screen bg-neutral-950 p-8 text-neutral-100">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Atividade</h1>
          <a href="/watchlist" className="text-sm text-emerald-400">
            ← Minha watchlist
          </a>
        </div>

        {transitions.length === 0 ? (
          <p className="mt-8 rounded-md border border-neutral-800 p-4 text-sm text-neutral-400">
            Nenhuma transição de status ainda.
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {transitions.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-4 rounded-lg border border-neutral-800 p-3"
              >
                {t.watchEntry.anime.coverImageUrl && (
                  <img
                    src={t.watchEntry.anime.coverImageUrl}
                    alt={t.watchEntry.anime.title}
                    className="h-16 w-11 shrink-0 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {t.watchEntry.anime.title}
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    <span className="text-neutral-300">
                      {STATUS_LABEL[t.fromStatus as WatchStatus] ?? t.fromStatus}
                    </span>{" "}
                    →{" "}
                    <span className="text-neutral-300">
                      {STATUS_LABEL[t.toStatus as WatchStatus] ?? t.toStatus}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {REASON_LABEL[t.reason] ?? t.reason} ·{" "}
                    {relativeTime(t.occurredAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
