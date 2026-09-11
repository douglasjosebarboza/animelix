import { expect, it } from "vitest";
import { Prisma } from "@prisma/client";
it("Anime has no snapshotAt", async ()=>{
  const fields = Prisma.dmmf.datamodel.models.find(m=>m.name==="Anime")!.fields.map(f=>f.name);
  expect(fields).not.toContain("snapshotAt");
  expect(fields).not.toContain("seasonCount");
});
