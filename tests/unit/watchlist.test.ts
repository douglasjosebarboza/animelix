import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  addToWatchlist,
  markEpisodeWatched,
  markEpisodesUpTo,
  markAllWatched,
  removeEpisodeWatch,
  clearAllWatched,
  WatchlistError,
  MAX_EPISODES_PER_ACTION,
} from "@/lib/watchlist";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    anime: undefined,
    watchEntry: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    episodeWatch: { create: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn(), delete: vi.fn(), count: vi.fn() },
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
          count: vi.mocked(prisma.episodeWatch.count),
        },
      }),
    ),
  },
}));

// O total real de episódios vem do catálogo (AniList) via cache — nunca do
// cliente. Nos testes injetamos o resolver para não depender da rede.
const EPISODE_COUNT = 12;

vi.mock("@/lib/anime-cache", () => ({
  getCachedAnimeById: vi.fn(async (anilistId: number) => ({
    anilistId,
    title: "Anime",
    coverImageUrl: null,
    episodeCount: 12,
    seasonCount: null,
    description: null,
    episodeTitles: [],
    nextAiringEpisode: null,
  })),
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

  it("markEpisode completa quando atinge o total real", async () => {
    const before = { id: "e1", status: "watching", episodeWatches: [] };
    // 12 distintos assistidos de um total real de 12 => completed
    const after = {
      id: "e1",
      status: "watching",
      episodeWatches: Array.from({ length: 12 }, (_, i) => ({ id: `w${i + 1}`, episode: i + 1 })),
    };
    vi.mocked(prisma.watchEntry.findUnique)
      .mockResolvedValueOnce(before as never)
      .mockResolvedValueOnce(after as never);
    await markEpisodeWatched("user-1", 123, 12);
    expect(prisma.watchEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "completed" } }),
    );
  });

  it("markEpisode falha fechado quando o total real é desconhecido", async () => {
    await expect(
      markEpisodeWatched("user-1", 123, 1, { resolveTotal: async () => null }),
    ).rejects.toThrow(WatchlistError);
    expect(prisma.episodeWatch.create).not.toHaveBeenCalled();
  });

  it("markEpisode auto-adiciona o anime quando não há entry", async () => {
    const after = { id: "e9", status: "watching", episodeWatches: [{ id: "w1", episode: 1 }] };
    vi.mocked(prisma.watchEntry.findUnique)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(after as never);
    vi.mocked(prisma.watchEntry.create).mockResolvedValue({ id: "e9", status: "watching" } as never);
    await markEpisodeWatched("user-1", 123, 1);
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
    await markEpisodesUpTo("user-1", 123, 3);
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
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(after as never);
    vi.mocked(prisma.watchEntry.create).mockResolvedValue({ id: "e9", status: "watching" } as never);
    await markEpisodesUpTo("user-1", 123, 1);
    expect(prisma.watchEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: "user-1", anilistId: 123, status: "watching" } }),
    );
  });

  it("markAllWatched falha sem escrever quando o total real é desconhecido", async () => {
    await expect(
      markAllWatched("user-1", 123, { resolveTotal: async () => null }),
    ).rejects.toThrow(WatchlistError);
    expect(prisma.episodeWatch.createMany).not.toHaveBeenCalled();
  });

  it("markAllWatched usa o total real do catálogo", async () => {
    const before = { id: "e1", status: "watching", episodeWatches: [] };
    const after = { id: "e1", status: "watching", episodeWatches: [] };
    vi.mocked(prisma.watchEntry.findUnique)
      .mockResolvedValueOnce(before as never)
      .mockResolvedValueOnce(after as never);
    await markAllWatched("user-1", 123);
    expect(prisma.episodeWatch.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: Array.from({ length: EPISODE_COUNT }, (_, i) => ({ watchEntryId: "e1", episode: i + 1 })),
      }),
    );
  });

  it("markEpisodesUpTo rejeita episode além do total real sem escrever", async () => {
    await expect(markEpisodesUpTo("user-1", 123, 99)).rejects.toThrow(WatchlistError);
    expect(prisma.episodeWatch.createMany).not.toHaveBeenCalled();
  });

  it("markEpisodesUpTo rejeita episode absurdo sem escrever (proteção contra DoS)", async () => {
    // O cliente não pode mais escolher o total: um `episode=20000000`
    // criaria 20 milhões de linhas em EpisodeWatch.
    await expect(markEpisodesUpTo("user-1", 123, 20_000_000)).rejects.toThrow(WatchlistError);
    expect(prisma.episodeWatch.createMany).not.toHaveBeenCalled();
  });

  it("markAllWatched rejeita total absurdo vindo do catálogo", async () => {
    await expect(
      markAllWatched("user-1", 123, { resolveTotal: async () => MAX_EPISODES_PER_ACTION + 1 }),
    ).rejects.toThrow(WatchlistError);
    expect(prisma.episodeWatch.createMany).not.toHaveBeenCalled();
  });

  it("markEpisode rejeita episode acima do total real sem escrever", async () => {
    await expect(markEpisodeWatched("user-1", 123, 99)).rejects.toThrow(WatchlistError);
    expect(prisma.episodeWatch.create).not.toHaveBeenCalled();
  });

  it("removeEpisodeWatch remove o episódio e apaga o entry quando não sobra nenhum", async () => {
    vi.mocked(prisma.watchEntry.findUnique).mockResolvedValueOnce({
      id: "e1",
      status: "watching",
      episodeWatches: [{ id: "w1", episode: 1 }],
    } as never);
    vi.mocked(prisma.episodeWatch.count).mockResolvedValue(0 as never);
    await expect(removeEpisodeWatch("user-1", 123, 1)).resolves.toBe(true);
    expect(prisma.episodeWatch.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "w1" } }),
    );
    expect(prisma.watchEntry.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "e1" } }),
    );
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
