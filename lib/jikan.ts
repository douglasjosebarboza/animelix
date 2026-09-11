import type { AnimeDataSource, Seed, Season } from "@/lib/datasource";
export class JikanError extends Error { constructor(m:string, readonly status?:number){super(m); this.name="JikanError"} }
function mapJikan(m:any):Seed{ return {anilistId:m.mal_id, title:m.title_english||m.title||"Sem título", coverImageUrl:m.images?.jpg?.large_image_url||null, episodeCount:m.episodes??null} }
export class JikanAdapter implements AnimeDataSource {
  private ep="https://api.jikan.moe/v4/anime";
  async search(q:string):Promise<Seed[]>{ const r=await fetch(`${this.ep}/?q=${encodeURIComponent(q)}&sfw&order_by=popularity&limit=20`); if(!r.ok) throw new JikanError(`Jikan ${r.status}`,r.status); const j=await r.json(); return (j.data||[]).map(mapJikan); }
  async getById(id:number):Promise<Seed>{ const r=await fetch(`${this.ep}/${id}`); if(!r.ok) throw new JikanError(`Jikan ${r.status}`,r.status); const j=await r.json(); return mapJikan(j.data); }
  async getSeasonal(season:Season,year:number):Promise<Seed[]>{ const r=await fetch(`${this.ep}?season=${season.toLowerCase()}&year=${year}&sfw&order_by=score&sort=desc&limit=30`); if(!r.ok) throw new JikanError(`Jikan ${r.status}`,r.status); const j=await r.json(); return (j.data||[]).map(mapJikan); }
}
