import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/anilist", async (orig)=>{ const m=await orig() as any; return {...m, AnilistAdapter: class { search=vi.fn().mockRejectedValue(new Error("403")); getById=vi.fn().mockRejectedValue(new Error("403")); getSeasonal=vi.fn().mockRejectedValue(new Error("403")) }} });
vi.mock("@/lib/jikan", ()=>({ JikanAdapter: class { search=vi.fn().mockResolvedValue([{anilistId:1,title:"Jikan",coverImageUrl:null,episodeCount:12}]); getById=vi.fn().mockResolvedValue({anilistId:1,title:"Jikan",coverImageUrl:null,episodeCount:12}); getSeasonal=vi.fn().mockResolvedValue([{anilistId:1,title:"Jikan",coverImageUrl:null,episodeCount:12}]); }}));
import { catalog } from "@/lib/catalog";
it("fallback to jikan on 403", async ()=>{ const r=await catalog.search("frieren"); expect(r[0].title).toBe("Jikan"); });
