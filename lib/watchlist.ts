import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeNextStatus, type WatchStatus } from "@/lib/watchstatus";

export class WatchlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WatchlistError";
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
  seasonOrEpisode: number,
  episodeMaybe?: number,
  total?: number | null,
): Promise<void> {
  const episode = episodeMaybe !== undefined ? episodeMaybe : seasonOrEpisode;
  return prisma.$transaction(async (tx) => {
    const before = await tx.watchEntry.findUnique({
      where: { userId_anilistId: { userId, anilistId } },
      include: { episodeWatches: true },
    });
    if (!before) {
      throw new WatchlistError("Anime não está na sua watchlist");
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
      total: total ?? null,
    });
    if (transition) {
      await tx.watchEntry.update({
        where: { id: after.id },
        data: { status: transition.to },
      });
    }
  });
}

export async function setWatchStatus(
  userId: string,
  anilistId: number,
  to: WatchStatus,
): Promise<void> {
  const entry = await prisma.watchEntry.findUnique({
    where: { userId_anilistId: { userId, anilistId } },
    include: { episodeWatches: true },
  });
  if (!entry) {
    throw new WatchlistError("Anime não está na sua watchlist");
  }
  const transition = computeNextStatus(entry.status as WatchStatus, {
    type: "setStatus",
    to,
  });
  if (transition) {
    await prisma.watchEntry.update({
      where: { id: entry.id },
      data: { status: transition.to },
    });
  }
}

// Deprecated: auto-pause removed with paused status — kept as no-op for compatibility.
export async function setAutoPause(
  _userId: string,
  _anilistId: number,
  _enabled: boolean,
): Promise<void> {
  return;
}

export async function runAutoPauseJob(_now: Date = new Date()): Promise<number> {
  return 0;
}

export async function removeEpisodeWatch(
  userId: string,
  anilistId: number,
  seasonOrEpisode: number,
  episodeMaybe?: number,
  total?: number | null,
): Promise<boolean> {
  const episode = episodeMaybe !== undefined ? episodeMaybe : seasonOrEpisode;
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
      total: total ?? null,
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
