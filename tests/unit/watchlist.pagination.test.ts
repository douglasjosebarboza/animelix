import { expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { listWatchEntries } from "@/lib/watchlist";
vi.mock("@/lib/prisma",()=>({prisma:{watchEntry:{findMany:vi.fn()}}}));
it("passes take and cursor", async ()=>{
  const spy=vi.mocked(prisma.watchEntry.findMany).mockResolvedValue([]);
  await listWatchEntries("u1",{take:20, cursor:"abc"});
  expect(spy).toHaveBeenCalledWith(expect.objectContaining({take:20, cursor:{id:"abc"}}));
});
