import { describe, expect, it } from "vitest";
import cfg from "@/next.config";
describe("next image config", () => {
  it("allows anilist domains", async () => {
    const c = (await import("@/next.config")).default as any;
    expect(c.images.remotePatterns[0].hostname).toMatch(/anilist/);
  });
});
