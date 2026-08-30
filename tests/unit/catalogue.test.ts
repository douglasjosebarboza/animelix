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

function seed(anilistId: number, ageHours = 0) {
  return {
    id: `seed-${anilistId}`,
    anilistId,
    title: `Anime ${anilistId}`,
    coverImageUrl: null,
    episodeCount: 12,
    seasonCount: 1,
    snapshotAt: new Date(Date.now() - ageHours * 36e5),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function freshSeed(anilistId: number) {
  return {
    anilistId,
    title: `Anime ${anilistId}`,
    coverImageUrl: null,
    episodeCount: 12,
    seasonCount: 1,
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

  it("fresh cache (<=24h): never calls AniList", async () => {
    findUnique.mockResolvedValue(seed(5, 2));

    const result = await getAnime(5);

    expect(getById).not.toHaveBeenCalled();
    expect(result.anilistId).toBe(5);
  });

  it("stale cache (>24h): returns cache and triggers a background refresh", async () => {
    findUnique.mockResolvedValue(seed(5, 48));
    getById.mockResolvedValue(freshSeed(5));
    upsert.mockResolvedValue(seed(5, 0) as never);

    const result = await getAnime(5);

    // read returns the (stale) cache immediately
    expect(result.snapshotAt.getTime()).toBeLessThan(Date.now() - 24 * 36e5);

    // background refresh eventually hits AniList + upsert
    await new Promise((r) => setTimeout(r, 10));
    expect(getById).toHaveBeenCalledWith(5);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("stale cache with AniList failure: still returns cache, logs and does not throw", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    findUnique.mockResolvedValue(seed(5, 48));
    getById.mockRejectedValue(new Error("AniList 503"));

    const result = await getAnime(5);
    expect(result.anilistId).toBe(5);

    await new Promise((r) => setTimeout(r, 10));
    expect(getById).toHaveBeenCalledWith(5);
    expect(logSpy).toHaveBeenCalled();
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join(" ");
    expect(logged).toContain("anilist_error");
    logSpy.mockRestore();
  });
});

describe("catalogue refreshAnime", () => {
  it("forces an immediate AniList fetch and overwrites the snapshot", async () => {
    getById.mockResolvedValue(freshSeed(9));
    upsert.mockResolvedValue(seed(9, 0) as never);

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
