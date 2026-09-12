import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: vi.fn(<T extends (...args: never[]) => unknown>(fn: T) => fn),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/catalog", () => ({
  catalog: { getById: vi.fn(), search: vi.fn(), getSeasonal: vi.fn() },
}));

import { unstable_cache } from "next/cache";
import { catalog } from "@/lib/catalog";
import { getCachedAnimeById, getCachedSeasonalAnime, searchCachedAnime } from "@/lib/anime-cache";

beforeEach(() => vi.clearAllMocks());

describe("anime-cache", () => {
  it("delega getById ao catalog e retorna o seed", async () => {
    vi.mocked(catalog.getById).mockResolvedValue({
      anilistId: 21, title: "One Piece", coverImageUrl: null, episodeCount: null, seasonCount: null,
    });
    const seed = await getCachedAnimeById(21);
    expect(seed.title).toBe("One Piece");
    expect(catalog.getById).toHaveBeenCalledWith(21);
    expect(unstable_cache).toHaveBeenCalledWith(expect.any(Function), ["anime", "21"], {
      revalidate: 3600,
      tags: ["anime:21"],
    });
  });

  it("delega search ao catalog", async () => {
    vi.mocked(catalog.search).mockResolvedValue([]);
    await searchCachedAnime("frieren");
    expect(catalog.search).toHaveBeenCalledWith("frieren");
    expect(unstable_cache).toHaveBeenCalledWith(expect.any(Function), ["anime-search", "frieren"], {
      revalidate: 600,
      tags: ["anime-search"],
    });
  });

  it("delega getSeasonal ao catalog", async () => {
    vi.mocked(catalog.getSeasonal).mockResolvedValue([]);
    await getCachedSeasonalAnime("WINTER", 2026);
    expect(catalog.getSeasonal).toHaveBeenCalledWith("WINTER", 2026);
    expect(unstable_cache).toHaveBeenCalledWith(
      expect.any(Function),
      ["anime-seasonal", "WINTER", "2026"],
      { revalidate: 600, tags: ["anime-seasonal"] },
    );
  });
});
