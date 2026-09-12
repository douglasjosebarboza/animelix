import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/catalog", () => ({
  catalog: { getById: vi.fn(), search: vi.fn(), getSeasonal: vi.fn() },
}));

import { catalog } from "@/lib/catalog";
import { getCachedAnimeById, searchCachedAnime } from "@/lib/anime-cache";

beforeEach(() => vi.clearAllMocks());

describe("anime-cache", () => {
  it("delega getById ao catalog e retorna o seed", async () => {
    vi.mocked(catalog.getById).mockResolvedValue({
      anilistId: 21, title: "One Piece", coverImageUrl: null, episodeCount: null, seasonCount: null,
    });
    const seed = await getCachedAnimeById(21);
    expect(seed.title).toBe("One Piece");
    expect(catalog.getById).toHaveBeenCalledWith(21);
  });

  it("delega search ao catalog", async () => {
    vi.mocked(catalog.search).mockResolvedValue([]);
    await searchCachedAnime("frieren");
    expect(catalog.search).toHaveBeenCalledWith("frieren");
  });
});
