import { expect, it } from "vitest";
import { Prisma } from "@prisma/client";

it("Anime model foi removido", () => {
  const names = Prisma.dmmf.datamodel.models.map((m) => m.name);
  expect(names).not.toContain("Anime");
});

it("WatchEntry guarda anilistId com unique [userId, anilistId]", () => {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "WatchEntry")!;
  const fields = model.fields.map((f) => f.name);
  expect(fields).toContain("anilistId");
  expect(fields).not.toContain("animeId");
  const uniques = model.uniqueFields as unknown as string[][];
  expect(uniques).toContainEqual(expect.arrayContaining(["userId", "anilistId"]));
});
