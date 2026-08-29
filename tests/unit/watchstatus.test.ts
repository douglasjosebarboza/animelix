import { describe, expect, it } from "vitest";
import { computeNextStatus, type WatchStatus } from "@/lib/watchstatus";

const mark = (distinctWatched: number, total: number | null, firstWatch = false) =>
  ({ type: "markEpisode", distinctWatched, total, firstWatch }) as const;

const tick = (daysSinceLastWatch: number, autoPauseEnabled = true) =>
  ({ type: "timeTick", daysSinceLastWatch, autoPauseEnabled }) as const;

const set = (to: WatchStatus) => ({ type: "setStatus", to }) as const;

const remove = (distinctWatched: number, total: number | null) =>
  ({ type: "removeEpisode", distinctWatched, total }) as const;

describe("computeNextStatus — markEpisode", () => {
  it("plan_to_watch + first watch → watching (user_status_change)", () => {
    expect(computeNextStatus("plan_to_watch", mark(1, 12, true))).toEqual({
      from: "plan_to_watch",
      to: "watching",
      reason: "user_status_change",
    });
  });

  it("plan_to_watch without firstWatch → no transition", () => {
    expect(computeNextStatus("plan_to_watch", mark(1, 12, false))).toBeNull();
  });

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

  it("paused + new episode resumes to watching (user_status_change)", () => {
    expect(computeNextStatus("paused", mark(2, 12))).toEqual({
      from: "paused",
      to: "watching",
      reason: "user_status_change",
    });
  });

  it("paused + resumed watch that completes the series -> completed", () => {
    expect(computeNextStatus("paused", mark(12, 12))?.to).toBe("completed");
  });

  it("dropped stays dropped on mark", () => {
    expect(computeNextStatus("dropped", mark(1, 12, true))).toBeNull();
  });

  it("engine never produces dropped on mark", () => {
    const t = computeNextStatus("watching", mark(12, 12));
    expect(t?.to).not.toBe("dropped");
  });
});

describe("computeNextStatus — timeTick (auto-pause)", () => {
  it("watching + >30d inactive + enabled → paused (auto_paused)", () => {
    expect(computeNextStatus("watching", tick(31))).toEqual({
      from: "watching",
      to: "paused",
      reason: "auto_paused",
    });
  });

  it("watching + exactly 30d → no transition", () => {
    expect(computeNextStatus("watching", tick(30))).toBeNull();
  });

  it("watching + >30d but opt-out enabled false → no transition", () => {
    expect(computeNextStatus("watching", tick(90, false))).toBeNull();
  });

  it("non-watching never auto-pauses", () => {
    expect(computeNextStatus("completed", tick(90))).toBeNull();
    expect(computeNextStatus("paused", tick(90))).toBeNull();
  });

  it("engine never produces dropped on tick", () => {
    const t = computeNextStatus("watching", tick(60));
    expect(t?.to).not.toBe("dropped");
  });
});

describe("computeNextStatus — setStatus (manual)", () => {
  it("manual move emits user_status_change", () => {
    expect(computeNextStatus("plan_to_watch", set("watching"))).toEqual({
      from: "plan_to_watch",
      to: "watching",
      reason: "user_status_change",
    });
  });

  it("manual dropped emits user_dropped", () => {
    expect(computeNextStatus("watching", set("dropped"))).toEqual({
      from: "watching",
      to: "dropped",
      reason: "user_dropped",
    });
  });

  it("manual move to dropped from any state is allowed", () => {
    expect(computeNextStatus("completed", set("dropped"))?.reason).toBe("user_dropped");
    expect(computeNextStatus("paused", set("dropped"))?.reason).toBe("user_dropped");
  });

  it("manual override of a pending auto-pause (paused → watching) is allowed", () => {
    expect(computeNextStatus("paused", set("watching"))?.to).toBe("watching");
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

  it("paused + remove keeps paused", () => {
    expect(computeNextStatus("paused", remove(2, 12))).toBeNull();
  });

  it("dropped + remove keeps dropped", () => {
    expect(computeNextStatus("dropped", remove(3, 12))).toBeNull();
  });

  it("engine never produces dropped on remove", () => {
    const t = computeNextStatus("completed", remove(5, 12));
    expect(t?.to).not.toBe("dropped");
  });
});
