import { searchAnime, getAnimeById, getSeasonalAnime, type AnimeSeed } from "./anilist";
import { isOpen, recordSuccess, recordFailure } from "./circuitBreaker";
import type { Season } from "./anilist";

export type AnimeDataSource = {
  search: (q: string) => Promise<AnimeSeed[]>;
  getById: (id: number) => Promise<AnimeSeed>;
  getSeasonal: (season: Season, year: number) => Promise<AnimeSeed[]>;
};

async function withFallback<T>(key: string, anilistFn: () => Promise<T>): Promise<T> {
  if (!isOpen(key)) {
    try {
      const r = await anilistFn();
      recordSuccess(key);
      return r;
    } catch (e) {
      recordFailure(key);
      throw e;
    }
  }
  return anilistFn();
}

export const catalog: AnimeDataSource = {
  search: (q: string) => withFallback("search", () => searchAnime(q)),
  getById: (id: number) => withFallback("getById", () => getAnimeById(id)),
  getSeasonal: (season: Season, year: number) => withFallback("getSeasonal", () => getSeasonalAnime({ season, seasonYear: year })),
};
