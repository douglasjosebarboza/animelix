import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { delete: vi.fn() },
    anime: { findUnique: vi.fn() },
    watchEntry: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getWatchEntry, listWatchEntries } from "@/lib/watchlist";
import { deleteAccount } from "@/lib/account";

const userDelete = vi.mocked(prisma.user.delete);
const animeFind = vi.mocked(prisma.anime.findUnique);
const entryFind = vi.mocked(prisma.watchEntry.findUnique);
const entryFindMany = vi.mocked(prisma.watchEntry.findMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("account deletion", () => {
  it("deletes the user", async () => {
    userDelete.mockResolvedValue({ id: "u1" } as never);
    await expect(deleteAccount("u1")).resolves.toBeUndefined();
    expect(userDelete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });

  it("is idempotent: an already-deleted account is a no-op", async () => {
    userDelete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("nope", {
        code: "P2025",
        clientVersion: "6.19.3",
      }),
    );
    await expect(deleteAccount("u1")).resolves.toBeUndefined();
  });

  it("rethrows unexpected delete errors", async () => {
    userDelete.mockRejectedValue(new Error("boom"));
    await expect(deleteAccount("u1")).rejects.toThrow("boom");
  });
});

describe("cross-user isolation (authorization by construction)", () => {
  it("getWatchEntry scopes the query by userId", async () => {
    animeFind.mockResolvedValue({ id: "anime-1", anilistId: 123 } as never);
    entryFind.mockResolvedValue(null);

    const result = await getWatchEntry("userA", 123);

    expect(result).toBeNull();
    expect(entryFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_animeId: { userId: "userA", animeId: "anime-1" } },
      }),
    );
  });

  it("listWatchEntries scopes the query by userId", async () => {
    entryFindMany.mockResolvedValue([]);
    await listWatchEntries("userA");
    expect(entryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "userA" } }),
    );
  });

  it("a different user's query is scoped to their own userId", async () => {
    animeFind.mockResolvedValue({ id: "anime-1", anilistId: 123 } as never);
    entryFind.mockResolvedValue(null);

    const result = await getWatchEntry("userB", 123);

    expect(result).toBeNull();
    expect(entryFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_animeId: { userId: "userB", animeId: "anime-1" } },
      }),
    );
  });
});
