import { AnilistAdapter } from "./anilist";
import { JikanAdapter } from "./jikan";
import { isOpen, recordSuccess, recordFailure } from "./circuitBreaker";
import type { Season } from "./datasource";

const anilist = new AnilistAdapter();
const jikan = new JikanAdapter();

async function withFallback<T>(key: string, anilistFn: () => Promise<T>, jikanFn: () => Promise<T>): Promise<T> {
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
  return jikanFn();
}

export const catalog: import("./datasource").AnimeDataSource = {
  search: (q: string) => withFallback("search", () => anilist.search(q), () => jikan.search(q)),
  getById: (id: number) => withFallback("getById", () => anilist.getById(id), () => jikan.getById(id)),
  getSeasonal: (season: Season, year: number) => withFallback("getSeasonal", () => anilist.getSeasonal(season, year), () => jikan.getSeasonal(season, year)),
};
