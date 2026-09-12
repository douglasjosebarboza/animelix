import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { addToWatchlist, markEpisodeWatched, markEpisodesUpTo, markAllWatched, clearAllWatched, WatchlistError } from "@/lib/watchlist";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    anime: undefined,
    watchEntry: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    episodeWatch: { create: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) =>
      fn({
        watchEntry: {
          findUnique: vi.mocked(prisma.watchEntry.findUnique),
          create: vi.mocked(prisma.watchEntry.create),
          update: vi.mocked(prisma.watchEntry.update),
          delete: vi.mocked(prisma.watchEntry.delete),
        },
        episodeWatch: {
          create: vi.mocked(prisma.episodeWatch.create),
          createMany: vi.mocked(prisma.episodeWatch.createMany),
          deleteMany: vi.mocked(prisma.episodeWatch.deleteMany),
          delete: vi.mocked(prisma.episodeWatch.delete),
        },
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

  it("markEpisode auto-adiciona o anime quando não há entry", async () => {
    const after = { id: "e9", status: "watching", episodeWatches: [{ id: "w1", episode: 1 }] };
    vi.mocked(prisma.watchEntry.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(after as never);
    vi.mocked(prisma.watchEntry.create).mockResolvedValue({ id: "e9", status: "watching" } as never);
    await markEpisodeWatched("user-1", 123, 1, 1, 12);
    expect(prisma.watchEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: "user-1", anilistId: 123, status: "watching" } }),
    );
  });

  it("markEpisodesUpTo marca 1..N pulando existentes", async () => {
    const before = { id: "e1", status: "watching", episodeWatches: [{ id: "w2", episode: 2 }] };
    const after = {
      id: "e1", status: "watching",
      episodeWatches: [{ id: "w1", episode: 1 }, { id: "w2", episode: 2 }, { id: "w3", episode: 3 }],
    };
    vi.mocked(prisma.watchEntry.findUnique)
      .mockResolvedValueOnce(before as never)
      .mockResolvedValueOnce(after as never);
    await markEpisodesUpTo("user-1", 123, 3, 12);
    expect(prisma.episodeWatch.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [
        { watchEntryId: "e1", episode: 1 },
        { watchEntryId: "e1", episode: 3 },
      ] }),
    );
  });

  it("markEpisodesUpTo auto-adiciona sem entry", async () => {
    const after = { id: "e9", status: "watching", episodeWatches: [{ id: "w1", episode: 1 }] };
    vi.mocked(prisma.watchEntry.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(after as never);
    vi.mocked(prisma.watchEntry.create).mockResolvedValue({ id: "e9", status: "watching" } as never);
    await markEpisodesUpTo("user-1", 123, 1, 12);
    expect(prisma.watchEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: "user-1", anilistId: 123, status: "watching" } }),
    );
  });

  it("markAllWatched com total null falha sem escrever", async () => {
    await expect(markAllWatched("user-1", 123, null)).rejects.toThrow(WatchlistError);
    expect(prisma.episodeWatch.createMany).not.toHaveBeenCalled();
  });

  it("markEpisodesUpTo rejeita episode além do total sem escrever", async () => {
    await expect(markEpisodesUpTo("user-1", 123, 99, 12)).rejects.toThrow(WatchlistError);
    expect(prisma.episodeWatch.createMany).not.toHaveBeenCalled();
  });

  it("clearAllWatched apaga watches e entry; sem entry é no-op", async () => {
    vi.mocked(prisma.watchEntry.findUnique).mockResolvedValueOnce({ id: "e1", status: "watching" } as never);
    await clearAllWatched("user-1", 123);
    expect(prisma.episodeWatch.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { watchEntryId: "e1" } }),
    );
    vi.clearAllMocks();
    vi.mocked(prisma.watchEntry.findUnique).mockResolvedValueOnce(null);
    await expect(clearAllWatched("user-1", 123)).resolves.toBeUndefined();
  });
});
