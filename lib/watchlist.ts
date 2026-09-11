import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAnime } from "@/lib/catalogue";
import { computeNextStatus, type WatchStatus } from "@/lib/watchstatus";

export class WatchlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WatchlistError";
  }
}

type EntryWithRelations = Prisma.WatchEntryGetPayload<{
  include: { anime: true; episodeWatches: true };
}>;

function distinctCount(entry: EntryWithRelations): number {
  const set = new Set(entry.episodeWatches.map((e) => `${e.season}:${e.episode}`));
  return set.size;
}

function findEpisodeWatch(
  watches: { id: string; season: number; episode: number }[],
  season: number,
  episode: number,
) {
  return watches.find((e) => e.season === season && e.episode === episode);
}

async function resolveAnimeId(anilistId: number): Promise<string> {
  const anime = await getAnime(anilistId);
  return anime.id;
}

export async function addToWatchlist(
  userId: string,
  anilistId: number,
): Promise<void> {
  const animeId = await resolveAnimeId(anilistId);
  try {
    await prisma.watchEntry.create({
      data: { userId, animeId, status: "watching" },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new WatchlistError("already in watchlist");
    }
    throw err;
  }
}

export async function removeFromWatchlist(
  userId: string,
  anilistId: number,
): Promise<void> {
  const animeId = await resolveAnimeId(anilistId);
  await prisma.watchEntry.deleteMany({
    where: { userId, animeId },
  });
}

export async function getWatchEntry(userId: string, anilistId: number) {
  const anime = await prisma.anime.findUnique({ where: { anilistId } });
  if (!anime) return null;
  return prisma.watchEntry.findUnique({
    where: { userId_animeId: { userId, animeId: anime.id } },
    include: {
      anime: true,
      episodeWatches: { orderBy: [{ createdAt: "asc" }] },
    },
  });
}

async function applyTransition(
  entryId: string,
  current: WatchStatus,
  transition: { from: WatchStatus; to: WatchStatus; reason: string },
): Promise<void> {
  await prisma.watchEntry.update({
    where: { id: entryId },
    data: { status: transition.to },
  });
}

export async function markEpisodeWatched(
  userId: string,
  anilistId: number,
  season: number,
  episode: number,
): Promise<void> {
  const animeId = await resolveAnimeId(anilistId);
  return prisma.$transaction(async (tx) => {
    const before = await tx.watchEntry.findUnique({
      where: { userId_animeId: { userId, animeId } },
      include: { anime: true, episodeWatches: true },
    });
    if (!before) {
      throw new WatchlistError("Anime não está na sua watchlist");
    }
    const firstWatch = before.episodeWatches.length === 0;

    const alreadyWatched = findEpisodeWatch(before.episodeWatches, season, episode);
    if (alreadyWatched) {
      throw new WatchlistError("Episódio já assistido");
    }

    await tx.episodeWatch.create({
      data: { watchEntryId: before.id, season, episode },
    });

    const after = await tx.watchEntry.findUnique({
      where: { userId_animeId: { userId, animeId } },
      include: { anime: true, episodeWatches: true },
    });
    if (!after) return;

    const transition = computeNextStatus(before.status as WatchStatus, {
      type: "markEpisode",
      distinctWatched: distinctCount(after),
      total: after.anime.episodeCount,
      firstWatch,
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
  const animeId = await resolveAnimeId(anilistId);
  const entry = await prisma.watchEntry.findUnique({
    where: { userId_animeId: { userId, animeId } },
    include: { anime: true, episodeWatches: true },
  });
  if (!entry) {
    throw new WatchlistError("Anime não está na sua watchlist");
  }
  const transition = computeNextStatus(entry.status as WatchStatus, {
    type: "setStatus",
    to,
  });
  if (transition) {
    await applyTransition(entry.id, entry.status as WatchStatus, transition);
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
  season: number,
  episode: number,
): Promise<boolean> {
  const animeId = await resolveAnimeId(anilistId);
  return prisma.$transaction(async (tx) => {
    const entry = await tx.watchEntry.findUnique({
      where: { userId_animeId: { userId, animeId } },
      include: { anime: true, episodeWatches: true },
    });
    if (!entry) {
      throw new WatchlistError("Anime não está na sua watchlist");
    }
    const target = findEpisodeWatch(entry.episodeWatches, season, episode);
    if (!target) return false;

    await tx.episodeWatch.delete({ where: { id: target.id } });

    // Removing the last watched episode leaves nothing tracked: drop the entry
    // from the watchlist entirely.
    const remaining = await tx.episodeWatch.count({
      where: { watchEntryId: entry.id },
    });
    if (remaining === 0) {
      await tx.watchEntry.delete({ where: { id: entry.id } });
      return true;
    }

    // Compute the post-removal state in memory: with the watched set there can be
    // no duplicates, so the remaining row count equals the distinct count.
    const remainingWatches = entry.episodeWatches.filter((e) => e.id !== target.id);
    const transition = computeNextStatus(entry.status as WatchStatus, {
      type: "removeEpisode",
      distinctWatched: distinctCount({ ...entry, episodeWatches: remainingWatches }),
      total: entry.anime.episodeCount,
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
    include: { anime: true },
    orderBy: { createdAt: "desc" },
    take,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
}
