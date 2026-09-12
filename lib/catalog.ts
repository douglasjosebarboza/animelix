import { searchAnime, getAnimeById, getSeasonalAnime, type AnimeSeed } from "./anilist";
import type { Season } from "./anilist";

export type AnimeDataSource = {
  search: (q: string) => Promise<AnimeSeed[]>;
  getById: (id: number) => Promise<AnimeSeed>;
  getSeasonal: (season: Season, year: number) => Promise<AnimeSeed[]>;
};

export const catalog: AnimeDataSource = {
  search: (q: string) => searchAnime(q),
  getById: (id: number) => getAnimeById(id),
  getSeasonal: (season: Season, year: number) => getSeasonalAnime({ season, seasonYear: year }),
};
