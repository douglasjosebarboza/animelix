import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeNextStatus, type WatchStatus } from "@/lib/watchstatus";
import { getCachedAnimeById } from "@/lib/anime-cache";

export class WatchlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WatchlistError";
  }
}

/**
 * Resolve o total REAL de episódios de um título.
 *
 * Default: catálogo (AniList) via cache. O valor enviado pelo cliente NUNCA é
 * usado — ele vive num `<input type="hidden">` e é 100% controlável por quem
 * faz a requisição.
 */
export type EpisodeTotalResolver = (anilistId: number) => Promise<number | null>;

/**
 * Teto de segurança para operações em massa. Nenhum título tem mais que isso;
 * protege contra dados absurdos vindos da API e contra qualquer regressão na
 * validação acima.
 */
export const MAX_EPISODES_PER_ACTION = 5000;

export type WatchOptions = {
  /** Injetável para testes; em produção usa o catálogo cacheado. */
  resolveTotal?: EpisodeTotalResolver;
};

const defaultResolveTotal: EpisodeTotalResolver = async (anilistId) => {
  const anime = await getCachedAnimeById(anilistId);
  return anime.episodeCount ?? null;
};

/** Resolve e valida o total real. Falha fechada (fail-closed) se desconhecido. */
async function resolveTotal(anilistId: number, opts: WatchOptions): Promise<number> {
  const resolve = opts.resolveTotal ?? defaultResolveTotal;
  const total = await resolve(anilistId);
  if (total == null || !Number.isInteger(total) || total <= 0) {
    throw new WatchlistError("Total de episódios indisponível para este título");
  }
  return total;
}

/**
 * Garante que o episódio está dentro do intervalo real do título.
 *
 * É esta guarda que impede o DoS de banco: sem ela, um POST com
 * `episode=20000000` criava 20 milhões de linhas em EpisodeWatch numa única
 * requisição.
 */
function assertEpisodeInRange(episode: number, total: number): void {
  if (!Number.isInteger(episode) || episode < 1) {
    throw new WatchlistError("Episódio inválido");
  }
  if (episode > MAX_EPISODES_PER_ACTION || episode > total) {
    throw new WatchlistError("Episódio inválido para este título");
  }
}

type EntryWithRelations = Prisma.WatchEntryGetPayload<{
  include: { episodeWatches: true };
}>;

function distinctCount(entry: EntryWithRelations): number {
  const set = new Set(entry.episodeWatches.map((e) => e.episode));
  return set.size;
}

function findEpisodeWatch(
  watches: { id: string; episode: number }[],
  episode: number,
) {
  return watches.find((e) => e.episode === episode);
}

export async function addToWatchlist(
  userId: string,
  anilistId: number,
): Promise<void> {
  try {
    await prisma.watchEntry.create({
      data: { userId, anilistId, status: "watching" },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw new WatchlistError("already in watchlist");
    }
    throw err;
  }
}

export async function removeFromWatchlist(
  userId: string,
  anilistId: number,
): Promise<void> {
  await prisma.watchEntry.deleteMany({
    where: { userId, anilistId },
  });
}

export async function getWatchEntry(userId: string, anilistId: number) {
  return prisma.watchEntry.findUnique({
    where: { userId_anilistId: { userId, anilistId } },
    include: {
      episodeWatches: { orderBy: [{ episode: "asc" }] },
    },
  });
}

export async function markEpisodeWatched(
  userId: string,
  anilistId: number,
  episode: number,
  opts: WatchOptions = {},
): Promise<void> {
  const total = await resolveTotal(anilistId, opts);
  assertEpisodeInRange(episode, total);

  return prisma.$transaction(async (tx) => {
    const found = await tx.watchEntry.findUnique({
      where: { userId_anilistId: { userId, anilistId } },
      include: { episodeWatches: true },
    });
    // Marcar o primeiro episódio auto-adiciona o anime à watchlist.
    let before = found;
    if (!before) {
      try {
        const created = await tx.watchEntry.create({
          data: { userId, anilistId, status: "watching" },
        });
        before = { ...created, episodeWatches: [] };
      } catch (err) {
        // Corrida com outro mark/add concorrente: recarrega o entry vencedor.
        if ((err as { code?: string }).code !== "P2002") throw err;
        const retry = await tx.watchEntry.findUnique({
          where: { userId_anilistId: { userId, anilistId } },
          include: { episodeWatches: true },
        });
        if (!retry) throw new WatchlistError("Anime não está na sua watchlist");
        before = retry;
      }
    }

    const alreadyWatched = findEpisodeWatch(before.episodeWatches, episode);
    if (alreadyWatched) {
      throw new WatchlistError("Episódio já assistido");
    }

    await tx.episodeWatch.create({
      data: { watchEntryId: before.id, episode },
    });

    const after = await tx.watchEntry.findUnique({
      where: { userId_anilistId: { userId, anilistId } },
      include: { episodeWatches: true },
    });
    if (!after) return;

    const transition = computeNextStatus(before.status as WatchStatus, {
      type: "markEpisode",
      distinctWatched: distinctCount(after),
      total,
    });
    if (transition) {
      await tx.watchEntry.update({
        where: { id: after.id },
        data: { status: transition.to },
      });
    }
  });
}

export async function markEpisodesUpTo(
  userId: string,
  anilistId: number,
  episode: number,
  opts: WatchOptions = {},
): Promise<void> {
  const total = await resolveTotal(anilistId, opts);
  assertEpisodeInRange(episode, total);

  return markEpisodesUpToWithTotal(userId, anilistId, episode, total);
}

/** núcleo de markEpisodesUpTo, com o total já validado. */
async function markEpisodesUpToWithTotal(
  userId: string,
  anilistId: number,
  episode: number,
  total: number,
): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const found = await tx.watchEntry.findUnique({
      where: { userId_anilistId: { userId, anilistId } },
      include: { episodeWatches: true },
    });
    let before = found;
    if (!before) {
      try {
        const created = await tx.watchEntry.create({
          data: { userId, anilistId, status: "watching" },
        });
        before = { ...created, episodeWatches: [] };
      } catch (err) {
        if ((err as { code?: string }).code !== "P2002") throw err;
        const retry = await tx.watchEntry.findUnique({
          where: { userId_anilistId: { userId, anilistId } },
          include: { episodeWatches: true },
        });
        if (!retry) throw new WatchlistError("Anime não está na sua watchlist");
        before = retry;
      }
    }

    const seen = new Set(before.episodeWatches.map((e) => e.episode));
    const missing = Array.from({ length: episode }, (_, i) => i + 1).filter((ep) => !seen.has(ep));
    if (missing.length > 0) {
      await tx.episodeWatch.createMany({
        data: missing.map((ep) => ({ watchEntryId: before.id, episode: ep })),
        skipDuplicates: true,
      });
    }

    const after = await tx.watchEntry.findUnique({
      where: { userId_anilistId: { userId, anilistId } },
      include: { episodeWatches: true },
    });
    if (!after) return;

    const transition = computeNextStatus(before.status as WatchStatus, {
      type: "markEpisode",
      distinctWatched: distinctCount(after),
      total,
    });
    if (transition) {
      await tx.watchEntry.update({
        where: { id: after.id },
        data: { status: transition.to },
      });
    }
  });
}

export async function markAllWatched(
  userId: string,
  anilistId: number,
  opts: WatchOptions = {},
): Promise<void> {
  const total = await resolveTotal(anilistId, opts);
  if (total > MAX_EPISODES_PER_ACTION) {
    throw new WatchlistError("Total de episódios indisponível para este título");
  }
  return markEpisodesUpToWithTotal(userId, anilistId, total, total);
}

export async function clearAllWatched(
  userId: string,
  anilistId: number,
): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.watchEntry.findUnique({
      where: { userId_anilistId: { userId, anilistId } },
    });
    if (!entry) return;
    await tx.episodeWatch.deleteMany({ where: { watchEntryId: entry.id } });
    await tx.watchEntry.delete({ where: { id: entry.id } });
  });
}

export async function removeEpisodeWatch(
  userId: string,
  anilistId: number,
  episode: number,
  opts: WatchOptions = {},
): Promise<boolean> {
  // A remoção não deve falhar se a API externa estiver fora: o total real
  // só influencia a transição de status (completed -> watching).
  let total: number | null = null;
  try {
    total = await resolveTotal(anilistId, opts);
  } catch {
    total = null;
  }

  return prisma.$transaction(async (tx) => {
    const entry = await tx.watchEntry.findUnique({
      where: { userId_anilistId: { userId, anilistId } },
      include: { episodeWatches: true },
    });
    if (!entry) {
      throw new WatchlistError("Anime não está na sua watchlist");
    }
    const target = findEpisodeWatch(entry.episodeWatches, episode);
    if (!target) return false;

    await tx.episodeWatch.delete({ where: { id: target.id } });

    const remaining = await tx.episodeWatch.count({
      where: { watchEntryId: entry.id },
    });
    if (remaining === 0) {
      await tx.watchEntry.delete({ where: { id: entry.id } });
      return true;
    }

    const remainingWatches = entry.episodeWatches.filter((e) => e.id !== target.id);
    const transition = computeNextStatus(entry.status as WatchStatus, {
      type: "removeEpisode",
      distinctWatched: distinctCount({ ...entry, episodeWatches: remainingWatches } as EntryWithRelations),
      total,
    });
    if (transition) {
      await tx.watchEntry.update({
        where: { id: entry.id },
        data: { status: transition.to },
      });
    }
    return false;
  });
}

export async function listWatchEntries(
  userId: string,
  opts: { take?: number; cursor?: string } = {},
) {
  const take = Math.min(opts.take || 50, 50);
  return prisma.watchEntry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
}
