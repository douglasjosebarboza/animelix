import { describe, expect, it } from "vitest";
import { computeProgress } from "@/lib/progress";

const ew = (season: number, episode: number, when: string) => ({
  season,
  episode,
  watchedAt: new Date(when),
});

describe("computeProgress", () => {
  it("empty history: zero watched, no last", () => {
    const p = computeProgress([], 12);
    expect(p).toEqual({ watchedCount: 0, total: 12, last: null });
  });

  it("null total resolves to 0", () => {
    const p = computeProgress([], null);
    expect(p.total).toBe(0);
  });

  it("counts distinct episodes, not total rows (re-watch preserved)", () => {
    const p = computeProgress(
      [ew(1, 1, "2024-01-01"), ew(1, 2, "2024-01-02"), ew(1, 1, "2024-02-01")],
      12,
    );
    expect(p.watchedCount).toBe(2);
  });

  it("last is the most recent by watchedAt", () => {
    const p = computeProgress(
      [ew(1, 1, "2024-01-01"), ew(1, 2, "2024-03-10"), ew(1, 1, "2024-02-01")],
      12,
    );
    expect(p.last).toEqual({ season: 1, episode: 2, watchedAt: new Date("2024-03-10") });
  });

  it("honours season in the distinct key", () => {
    const p = computeProgress([ew(1, 1, "2024-01-01"), ew(2, 1, "2024-01-02")], 12);
    expect(p.watchedCount).toBe(2);
  });
});
