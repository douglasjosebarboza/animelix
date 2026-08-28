import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAnime } from "@/lib/catalogue";

export class WatchlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WatchlistError";
  }
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
  return prisma.watchEntry.findUnique({
    where: { userId_animeId: { userId, animeId: anime.id } },
    include: {
      anime: true,
      episodeWatches: { orderBy: [{ watchedAt: "asc" }, { createdAt: "asc" }] },
    },
  });
}

export async function markEpisodeWatched(
  userId: string,
  anilistId: number,
  season: number,
  episode: number,
  watchedAt: Date,
): Promise<void> {
  const animeId = await resolveAnimeId(anilistId);
  const entry = await prisma.watchEntry.findUnique({
    where: { userId_animeId: { userId, animeId } },
  });
  if (!entry) {
    throw new WatchlistError("Anime não está na sua watchlist");
  }
  // Re-watch is allowed: always insert a new EpisodeWatch.
  await prisma.episodeWatch.create({
    data: { watchEntryId: entry.id, season, episode, watchedAt },
  });
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
