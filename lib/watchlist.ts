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

function maxWatchedAt(entry: EntryWithRelations): Date | null {
  return entry.episodeWatches.reduce<Date | null>(
    (max, e) => (!max || e.watchedAt > max ? e.watchedAt : max),
    null,
  );
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
      data: { userId, animeId, status: "plan_to_watch" },
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
  const entry = await prisma.watchEntry.findUnique({
    where: { userId_animeId: { userId, animeId: anime.id } },
    include: {
      anime: true,
      episodeWatches: { orderBy: [{ watchedAt: "asc" }, { createdAt: "asc" }] },
      statusTransitions: { orderBy: { occurredAt: "desc" } },
    },
  });
  if (!entry) return null;
  // Silent auto-pause on read when a watching entry went inactive > 30 days.
  await evaluateAutoPause(entry as EntryWithRelations);
  return prisma.watchEntry.findUnique({
    where: { userId_animeId: { userId, animeId: anime.id } },
    include: {
      anime: true,
      episodeWatches: { orderBy: [{ watchedAt: "asc" }, { createdAt: "asc" }] },
      statusTransitions: { orderBy: { occurredAt: "desc" } },
    },
  });
}

async function applyTransition(
  entryId: string,
  current: WatchStatus,
  transition: { from: WatchStatus; to: WatchStatus; reason: string },
): Promise<void> {
  await prisma.$transaction([
    prisma.watchEntry.update({
      where: { id: entryId },
      data: { status: transition.to },
    }),
    prisma.statusTransition.create({
      data: {
        watchEntryId: entryId,
        fromStatus: transition.from,
        toStatus: transition.to,
        reason: transition.reason,
      },
    }),
  ]);
}

export async function markEpisodeWatched(
  userId: string,
  anilistId: number,
  season: number,
  episode: number,
  watchedAt: Date,
): Promise<void> {
  const animeId = await resolveAnimeId(anilistId);
  const before = await prisma.watchEntry.findUnique({
    where: { userId_animeId: { userId, animeId } },
    include: { anime: true, episodeWatches: true },
  });
  if (!before) {
    throw new WatchlistError("Anime não está na sua watchlist");
  }
  const firstWatch = before.episodeWatches.length === 0;

  // Re-watch is allowed: always insert a new EpisodeWatch.
  await prisma.episodeWatch.create({
    data: { watchEntryId: before.id, season, episode, watchedAt },
  });

  const after = await prisma.watchEntry.findUnique({
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
    await applyTransition(after.id, before.status as WatchStatus, transition);
  }
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

export async function undoLastEpisodeWatch(
  userId: string,
  anilistId: number,
): Promise<void> {
  const animeId = await resolveAnimeId(anilistId);
  const entry = await prisma.watchEntry.findUnique({
    where: { userId_animeId: { userId, animeId } },
  });
  if (!entry) return;

  const latest = await prisma.episodeWatch.findFirst({
    where: { watchEntryId: entry.id },
    orderBy: [{ watchedAt: "desc" }, { createdAt: "desc" }],
  });
  if (latest) {
    await prisma.episodeWatch.delete({ where: { id: latest.id } });
  }
}

export async function listWatchEntries(userId: string) {
  return prisma.watchEntry.findMany({
    where: { userId },
    include: { anime: true },
    orderBy: { createdAt: "desc" },
  });
}

async function evaluateAutoPause(entry: EntryWithRelations): Promise<void> {
  const last = maxWatchedAt(entry);
  const daysSince = last ? (Date.now() - last.getTime()) / 864e5 : Infinity;
  const transition = computeNextStatus(entry.status as WatchStatus, {
    type: "timeTick",
    daysSinceLastWatch: daysSince,
    autoPauseEnabled: entry.autoPauseEnabled,
  });
  if (transition) {
    await applyTransition(entry.id, entry.status as WatchStatus, transition);
  }
}
