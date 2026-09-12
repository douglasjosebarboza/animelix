import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { addToWatchlist, markEpisodeWatched, WatchlistError } from "@/lib/watchlist";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    anime: undefined,
    watchEntry: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    episodeWatch: { create: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) =>
      fn({
        watchEntry: {
          findUnique: vi.mocked(prisma.watchEntry.findUnique),
          update: vi.mocked(prisma.watchEntry.update),
        },
        episodeWatch: { create: vi.mocked(prisma.episodeWatch.create) },
      }),
    ),
  },
}));

beforeEach(() => vi.clearAllMocks());

describe("watchlist pura (sem Anime)", () => {
  it("cria o entry direto com anilistId sem tocar na API", async () => {
    vi.mocked(prisma.watchEntry.create).mockResolvedValue({} as never);
    await addToWatchlist("user-1", 123);
    expect(prisma.watchEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: "user-1", anilistId: 123, status: "watching" } }),
    );
    expect((prisma as unknown as Record<string, unknown>).anime).toBeUndefined();
  });

  it("mapeia P2002 para WatchlistError", async () => {
    const err = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    vi.mocked(prisma.watchEntry.create).mockRejectedValue(err);
    await expect(addToWatchlist("user-1", 123)).rejects.toThrow(WatchlistError);
  });

  it("markEpisode completa quando atinge o total vindo da API", async () => {
    const before = { id: "e1", status: "watching", episodeWatches: [] };
    // 12 distintos assistidos de um total de 12 => distinctWatched >= total => completed
    const after = {
      id: "e1",
      status: "watching",
      episodeWatches: Array.from({ length: 12 }, (_, i) => ({ id: `w${i + 1}`, episode: i + 1 })),
    };
    vi.mocked(prisma.watchEntry.findUnique)
      .mockResolvedValueOnce(before as never)
      .mockResolvedValueOnce(after as never);
    await markEpisodeWatched("user-1", 123, 1, 12, 12);
    expect(prisma.watchEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "completed" } }),
    );
  });

  it("markEpisode pula transição quando total é null", async () => {
    const before = { id: "e1", status: "watching", episodeWatches: [] };
    const after = { id: "e1", status: "watching", episodeWatches: [{ id: "w1", episode: 5 }] };
    vi.mocked(prisma.watchEntry.findUnique)
      .mockResolvedValueOnce(before as never)
      .mockResolvedValueOnce(after as never);
    await markEpisodeWatched("user-1", 123, 1, 5, null);
    expect(prisma.watchEntry.update).not.toHaveBeenCalled();
  });
});
