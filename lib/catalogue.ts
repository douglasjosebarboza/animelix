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

export type CatalogueAnime = Prisma.AnimeGetPayload<{}>;

async function upsertSeed(seed: AnimeSeed): Promise<Anime> {
  return prisma.anime.upsert({
    where: { anilistId: seed.anilistId },
    create: {
      anilistId: seed.anilistId,
      title: seed.title,
      coverImageUrl: seed.coverImageUrl,
      episodeCount: seed.episodeCount,
    },
    update: {
      title: seed.title,
      coverImageUrl: seed.coverImageUrl,
      episodeCount: seed.episodeCount,
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

  logEvent("anilist_cache", { anilistId, hit: true });

  return cached;
}
