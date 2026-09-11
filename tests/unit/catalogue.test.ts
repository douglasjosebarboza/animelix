import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    anime: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/anilist", () => ({
  getAnimeById: vi.fn(),
  searchAnime: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getAnimeById, searchAnime as anilistSearch } from "@/lib/anilist";
import { getAnime, refreshAnime, searchAnime } from "@/lib/catalogue";

const findUnique = vi.mocked(prisma.anime.findUnique);
const upsert = vi.mocked(prisma.anime.upsert);
const getById = vi.mocked(getAnimeById);

function seed(anilistId: number) {
  return {
    id: `seed-${anilistId}`,
    anilistId,
    title: `Anime ${anilistId}`,
    coverImageUrl: null,
    episodeCount: 12,
  };
}

function freshSeed(anilistId: number) {
  return {
    anilistId,
    title: `Anime ${anilistId}`,
    coverImageUrl: null,
    episodeCount: 12,
    seasonCount: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockReset();
  upsert.mockReset();
  getById.mockReset();
  upsert.mockResolvedValue(seed(0) as never);
});

describe("catalogue getAnime", () => {
  it("cache miss: fetches from AniList and returns the upserted row", async () => {
    findUnique.mockResolvedValue(null);
    getById.mockResolvedValue(freshSeed(5));
    upsert.mockResolvedValue(seed(5) as never);

    const result = await getAnime(5);

    expect(getById).toHaveBeenCalledWith(5);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(result.anilistId).toBe(5);
  });

  it("fresh cache: never calls AniList", async () => {
    findUnique.mockResolvedValue(seed(5) as never);

    const result = await getAnime(5);

    expect(getById).not.toHaveBeenCalled();
    expect(result.anilistId).toBe(5);
  });

  it("stale cache (>24h): returns cache without background refresh (TTL removed)", async () => {
    findUnique.mockResolvedValue(seed(5) as never);
    getById.mockResolvedValue(freshSeed(5));
    upsert.mockResolvedValue(seed(5) as never);

    const result = await getAnime(5);

    expect(result.anilistId).toBe(5);

    // no background refresh after minimal schema (TTL removed)
    await new Promise((r) => setTimeout(r, 10));
    expect(getById).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("stale cache with AniList failure: still returns cache, no throw", async () => {
    findUnique.mockResolvedValue(seed(5) as never);
    getById.mockRejectedValue(new Error("AniList 503"));

    const result = await getAnime(5);
    expect(result.anilistId).toBe(5);

    await new Promise((r) => setTimeout(r, 10));
    expect(getById).not.toHaveBeenCalled();
  });
});

describe("catalogue refreshAnime", () => {
  it("forces an immediate AniList fetch and overwrites the snapshot", async () => {
    getById.mockResolvedValue(freshSeed(9));
    upsert.mockResolvedValue(seed(9) as never);

    const result = await refreshAnime(9);

    expect(getById).toHaveBeenCalledWith(9);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(result.anilistId).toBe(9);
  });
});

describe("catalogue searchAnime", () => {
  it("delegates to the AniList client", async () => {
    vi.mocked(anilistSearch).mockResolvedValue([freshSeed(1)]);
    const res = await searchAnime("frieren");
    expect(anilistSearch).toHaveBeenCalledWith("frieren");
    expect(res).toHaveLength(1);
  });
});
