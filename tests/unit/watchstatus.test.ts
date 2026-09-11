import { describe, expect, it } from "vitest";
import { computeNextStatus, type WatchStatus } from "@/lib/watchstatus";

const mark = (distinctWatched: number, total: number | null, firstWatch = false) =>
  ({ type: "markEpisode", distinctWatched, total, firstWatch }) as const;

const set = (to: WatchStatus) => ({ type: "setStatus", to }) as const;

const remove = (distinctWatched: number, total: number | null) =>
  ({ type: "removeEpisode", distinctWatched, total }) as const;

describe("computeNextStatus — markEpisode", () => {
  it("watching + not all watched → no transition", () => {
    expect(computeNextStatus("watching", mark(5, 12))).toBeNull();
  });

  it("watching + all distinct watched → completed (auto_completed)", () => {
    expect(computeNextStatus("watching", mark(12, 12))).toEqual({
      from: "watching",
      to: "completed",
      reason: "auto_completed",
    });
  });

  it("watching + more than total still completes (>=)", () => {
    expect(computeNextStatus("watching", mark(13, 12))?.to).toBe("completed");
  });

  it("null total never completes", () => {
    expect(computeNextStatus("watching", mark(12, null))).toBeNull();
  });

  it("completed stays completed on more marks", () => {
    expect(computeNextStatus("completed", mark(13, 12))).toBeNull();
  });

  it("engine never produces dropped on mark", () => {
    const t = computeNextStatus("watching", mark(12, 12));
    expect(t?.to).not.toBe("dropped");
  });
});

describe("computeNextStatus — setStatus (manual)", () => {
  it("manual move watching -> completed emits user_status_change", () => {
    expect(computeNextStatus("watching", set("completed"))).toEqual({
      from: "watching",
      to: "completed",
      reason: "user_status_change",
    });
  });

  it("manual move completed -> watching emits user_status_change", () => {
    expect(computeNextStatus("completed", set("watching"))).toEqual({
      from: "completed",
      to: "watching",
      reason: "user_status_change",
    });
  });

  it("same status → no transition", () => {
    expect(computeNextStatus("watching", set("watching"))).toBeNull();
  });
});

describe("computeNextStatus — removeEpisode", () => {
  it("completed + becomes incomplete → watching (user_status_change)", () => {
    expect(computeNextStatus("completed", remove(11, 12))).toEqual({
      from: "completed",
      to: "watching",
      reason: "user_status_change",
    });
  });

  it("completed + null total stays completed (cannot detect incompleteness)", () => {
    expect(computeNextStatus("completed", remove(11, null))).toBeNull();
  });

  it("watching + remove keeps watching", () => {
    expect(computeNextStatus("watching", remove(4, 12))).toBeNull();
  });

  it("engine never produces dropped on remove", () => {
    const t = computeNextStatus("completed", remove(5, 12));
    expect(t?.to).not.toBe("dropped");
  });
});
