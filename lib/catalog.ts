import { searchAnime, getAnimeById, getSeasonalAnime } from "./anilist";
import { JikanAdapter } from "./jikan";
import { KitsuAdapter } from "./kitsu";
import { isOpen, recordSuccess, recordFailure } from "./circuitBreaker";
import type { Season } from "./anilist";

const jikan = new JikanAdapter();
const kitsu = new KitsuAdapter();

async function withFallback<T>(key: string, anilistFn: () => Promise<T>, jikanFn: () => Promise<T>, kitsuFn: () => Promise<T>): Promise<T> {
  if (!isOpen(key)) {
    try {
      const r = await anilistFn();
      recordSuccess(key);
      return r;
    } catch (e) {
      recordFailure(key);
      const shouldFallback = (e as Error).message?.includes("403") || (e as { status?: number }).status !== undefined && (e as { status?: number }).status! >= 500;
      if (!shouldFallback) throw e;
    }
  }
  try {
    return await jikanFn();
  } catch (e) {
    // Jikan 429/504 → tenta Kitsu como último fallback
    const shouldTryKitsu = (e as Error).message?.includes("504") || (e as Error).message?.includes("429") || (e as { status?: number }).status === 429 || (e as { status?: number }).status === 504 || (e as { status?: number }).status === 403;
    if (!shouldTryKitsu) throw e;
  }
  return kitsuFn();
}

export const catalog: import("./datasource").AnimeDataSource = {
  search: (q: string) => withFallback("search", () => searchAnime(q), () => jikan.search(q), () => kitsu.search(q)),
  getById: (id: number) => withFallback("getById", () => getAnimeById(id), () => jikan.getById(id), () => kitsu.getById(id)),
  getSeasonal: (season: Season, year: number) => withFallback("getSeasonal", () => getSeasonalAnime({ season, seasonYear: year }), () => jikan.getSeasonal(season, year), () => kitsu.getSeasonal(season, year)),
};
