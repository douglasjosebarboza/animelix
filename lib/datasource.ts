export type Season = "WINTER"|"SPRING"|"SUMMER"|"FALL";
export type Seed = { anilistId:number, title:string, coverImageUrl:string|null, episodeCount:number|null };
export interface AnimeDataSource {
  search(q:string): Promise<Seed[]>;
  getById(id:number): Promise<Seed>;
  getSeasonal(season:Season, year:number): Promise<Seed[]>;
}
