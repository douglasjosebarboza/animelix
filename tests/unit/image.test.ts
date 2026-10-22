import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

describe("next image config", () => {
  it("allows anilist domains", () => {
    const patterns = nextConfig.images?.remotePatterns ?? [];
    expect(patterns[0]?.hostname).toMatch(/anilist/);
  });
});
