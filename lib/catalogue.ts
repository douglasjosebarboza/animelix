import { Prisma, type Anime } from "@prisma/client";
import { getAnimeById, searchAnime as anilistSearch, type AnimeSeed } from "@/lib/anilist";
import { prisma } from "@/lib/prisma";

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

export async function refreshAnime(anilistId: number): Promise<Anime> {
  const seed = await getAnimeById(anilistId);
  return upsertSeed(seed);
}

export async function getAnime(anilistId: number): Promise<Anime> {
  const cached = await prisma.anime.findUnique({ where: { anilistId } });

  if (!cached) {
    const seed = await getAnimeById(anilistId);
    return upsertSeed(seed);
  }

  const isStale = Date.now() - cached.snapshotAt.getTime() > SNAPSHOT_TTL_MS;
  if (isStale) {
    // Fire-and-forget: refresh in the background and always return the cache,
    // so a read never blocks on or fails because of AniList.
    void refreshAnime(anilistId).catch((err) =>
      console.error(`[catalogue] refresh em background falhou para ${anilistId}:`, err),
    );
  }

  return cached;
}
