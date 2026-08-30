import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAnime } from "@/lib/catalogue";
import { computeNextStatus, type WatchStatus } from "@/lib/watchstatus";
import { shouldAutoPause } from "@/lib/autopause";
import { logEvent } from "@/lib/logger";

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

  // An episode is a set membership: it can only be watched once. The unique
  // constraint is the backstop; this guard gives a clean error up front.
  const alreadyWatched = findEpisodeWatch(before.episodeWatches, season, episode);
  if (alreadyWatched) {
    throw new WatchlistError("Episódio já assistido");
  }

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

export async function setAutoPause(
  userId: string,
  anilistId: number,
  enabled: boolean,
): Promise<void> {
  const animeId = await resolveAnimeId(anilistId);
  try {
    await prisma.watchEntry.update({
      where: { userId_animeId: { userId, animeId } },
      data: { autoPauseEnabled: enabled },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new WatchlistError("Anime não está na sua watchlist");
    }
    throw err;
  }
}

export async function runAutoPauseJob(now: Date = new Date()): Promise<number> {
  const candidates = await prisma.watchEntry.findMany({
    where: {
      status: { in: ["watching", "plan_to_watch"] },
      autoPauseEnabled: true,
      episodeWatches: { some: {} },
    },
    include: { episodeWatches: true },
  });
  let paused = 0;
  for (const entry of candidates) {
    const last = maxWatchedAt(entry as EntryWithRelations);
    if (
      shouldAutoPause({
        status: entry.status as WatchStatus,
        lastWatchedAt: last,
        autoPauseEnabled: entry.autoPauseEnabled,
        now,
      })
    ) {
      await applyTransition(entry.id, entry.status as WatchStatus, {
        from: entry.status as WatchStatus,
        to: "paused",
        reason: "auto_paused",
      });
      logEvent("auto_pause", {
        watchEntryId: entry.id,
        animeId: entry.animeId,
        reason: "auto_paused",
      });
      paused++;
    }
  }
  logEvent("auto_pause_job", { evaluated: candidates.length, paused });
  return paused;
}

export async function removeEpisodeWatch(
  userId: string,
  anilistId: number,
  season: number,
  episode: number,
): Promise<boolean> {
  const animeId = await resolveAnimeId(anilistId);
  const entry = await prisma.watchEntry.findUnique({
    where: { userId_animeId: { userId, animeId } },
    include: { anime: true, episodeWatches: true },
  });
  if (!entry) {
    throw new WatchlistError("Anime não está na sua watchlist");
  }
  const target = findEpisodeWatch(entry.episodeWatches, season, episode);
  if (!target) return false;

  await prisma.episodeWatch.delete({ where: { id: target.id } });

  // Removing the last watched episode leaves nothing tracked: drop the entry
  // from the watchlist entirely.
  const remaining = await prisma.episodeWatch.count({
    where: { watchEntryId: entry.id },
  });
  if (remaining === 0) {
    await prisma.watchEntry.delete({ where: { id: entry.id } });
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
    await applyTransition(entry.id, entry.status as WatchStatus, transition);
  }
  return false;
}

export async function listWatchEntries(userId: string) {
  return prisma.watchEntry.findMany({
    where: { userId },
    include: { anime: true },
    orderBy: { createdAt: "desc" },
  });
}

async function evaluateAutoPause(entry: EntryWithRelations): Promise<void> {
  if (
    !shouldAutoPause({
      status: entry.status as WatchStatus,
      lastWatchedAt: maxWatchedAt(entry),
      autoPauseEnabled: entry.autoPauseEnabled,
      now: new Date(),
    })
  ) {
    return;
  }
  await applyTransition(entry.id, entry.status as WatchStatus, {
    from: entry.status as WatchStatus,
    to: "paused",
    reason: "auto_paused",
  });
  logEvent("auto_pause", { watchEntryId: entry.id, animeId: entry.animeId, reason: "auto_paused" });
}
