import { unstable_cache } from "next/cache";
import { catalog } from "@/lib/catalog";
import type { AnimeSeed, Season } from "@/lib/anilist";

const DETAIL_TTL_SECONDS = 3600;
const LIST_TTL_SECONDS = 600;

export function getCachedAnimeById(anilistId: number): Promise<AnimeSeed> {
  return unstable_cache(() => catalog.getById(anilistId), ["anime", String(anilistId)], {
    revalidate: DETAIL_TTL_SECONDS,
    tags: [`anime:${anilistId}`],
  })();
}

export function searchCachedAnime(query: string): Promise<AnimeSeed[]> {
  return unstable_cache(() => catalog.search(query), ["anime-search", query], {
    revalidate: LIST_TTL_SECONDS,
    tags: ["anime-search"],
  })();
}

export function getCachedSeasonalAnime(season: Season, year: number): Promise<AnimeSeed[]> {
  return unstable_cache(() => catalog.getSeasonal(season, year), ["anime-seasonal", season, String(year)], {
    revalidate: LIST_TTL_SECONDS,
    tags: ["anime-seasonal"],
  })();
}
