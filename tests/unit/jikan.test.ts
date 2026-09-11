import { describe, expect, it, vi } from "vitest";
import { JikanAdapter } from "@/lib/jikan";
global.fetch = vi.fn();
describe("JikanAdapter", () => {
  it("maps search", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok:true, json: async()=>({data:[{mal_id:1, title_english:"Frieren", images:{jpg:{large_image_url:"https://cdn.myanimelist.net/1.jpg"}}, episodes:28}]}) } as any);
    const a=new JikanAdapter(); const r=await a.search("frieren");
    expect(r[0]).toEqual({anilistId:1, title:"Frieren", coverImageUrl:"https://cdn.myanimelist.net/1.jpg", episodeCount:28});
  });
  it("throws on 429", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok:false, status:429, headers:{get:()=>"5"} } as any);
    await expect(new JikanAdapter().search("x")).rejects.toThrow();
  });
});
