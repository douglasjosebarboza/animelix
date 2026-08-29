import { Prisma, type Anime } from "@prisma/client";
import {
  getAnimeById,
  searchAnime as anilistSearch,
  getSeasonalAnime as anilistSeasonal,
  currentSeason,
  type AnimeSeed,
  type SeasonalAnime,
  type SeasonRef,
} from "@/lib/anilist";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";

const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

export type CatalogueAnime = Prisma.AnimeGetPayload<{}>;

async function upsertSeed(seed: AnimeSeed): Promise<Anime> {
  return prisma.anime.upsert({
    where: { anilistId: seed.anilistId },
    create: {
      anilistId: seed.anilistId,
      title: seed.title,
      coverImageUrl: seed.coverImageUrl,
      episodeCount: seed.episodeCount,
      seasonCount: seed.seasonCount,
      snapshotAt: new Date(),
    },
    update: {
      title: seed.title,
      coverImageUrl: seed.coverImageUrl,
      episodeCount: seed.episodeCount,
      seasonCount: seed.seasonCount,
      snapshotAt: new Date(),
    },
  });
}

export async function searchAnime(query: string): Promise<AnimeSeed[]> {
  return anilistSearch(query);
}

export async function getSeasonalAnime(genre?: string): Promise<SeasonalAnime[]> {
  const { season, year } = currentSeason();
  return anilistSeasonal({ season, seasonYear: year, genre });
}

export type { SeasonRef, SeasonalAnime };

export async function refreshAnime(anilistId: number): Promise<Anime> {
  logEvent("anilist_refresh", { anilistId, trigger: "manual" });
  const seed = await getAnimeById(anilistId);
  return upsertSeed(seed);
}

export async function getAnime(anilistId: number): Promise<Anime> {
  const cached = await prisma.anime.findUnique({ where: { anilistId } });

  if (!cached) {
    logEvent("anilist_cache", { anilistId, hit: false });
    const seed = await getAnimeById(anilistId);
    return upsertSeed(seed);
  }

  const isStale = Date.now() - cached.snapshotAt.getTime() > SNAPSHOT_TTL_MS;
  logEvent("anilist_cache", { anilistId, hit: true, stale: isStale });

  if (isStale) {
    // Fire-and-forget: refresh in the background and always return the cache,
    // so a read never blocks on or fails because of AniList.
    logEvent("anilist_refresh", { anilistId, trigger: "stale" });
    void refreshAnime(anilistId).catch((err) =>
      logEvent("anilist_error", { anilistId, trigger: "stale", error: String(err) }),
    );
  }

  return cached;
}
