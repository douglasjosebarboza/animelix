import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/anilist", () => ({ getSeasonalAnime: vi.fn(), currentSeason: () => ({season:"WINTER", year:2026}) }));
vi.mock("@/lib/prisma", () => ({ prisma: { anime: { findMany: vi.fn() } } }));
import { getSeasonalAnime } from "@/lib/anilist";
import { prisma } from "@/lib/prisma";
import { getSeasonalAnimeCached } from "@/lib/catalogue";

describe("getSeasonalAnimeCached", () => {
  it("on 403 fallback to DB anime", async () => {
    vi.mocked(getSeasonalAnime).mockRejectedValue(new Error("AniList respondeu 403"));
    vi.mocked(prisma.anime.findMany).mockResolvedValue([{anilistId:1, title:"Fallback", coverImageUrl:null, episodeCount:12, averageScore:80, genres:[]}] as any);
    const res = await getSeasonalAnimeCached();
    expect(res[0].title).toBe("Fallback");
  });
});
