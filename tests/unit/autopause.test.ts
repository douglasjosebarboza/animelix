import { describe, expect, it } from "vitest";
import { daysSince, shouldAutoPause } from "@/lib/autopause";
import type { WatchStatus } from "@/lib/watchstatus";

const DAY = 864e5;
const now = new Date("2026-08-28T00:00:00Z");

describe("daysSince", () => {
  it("returns Infinity when there is no last watch", () => {
    expect(daysSince(null, now)).toBe(Infinity);
  });

  it("computes elapsed days", () => {
    expect(daysSince(new Date(now.getTime() - 5 * DAY), now)).toBeCloseTo(5);
  });
});

describe("shouldAutoPause", () => {
  it("watching + enabled + >30d inactive -> pause", () => {
    expect(
      shouldAutoPause({
        status: "watching",
        lastWatchedAt: new Date(now.getTime() - 31 * DAY),
        autoPauseEnabled: true,
        now,
        thresholdDays: 30,
      }),
    ).toBe(true);
  });

  it("exactly 30d does not pause (strictly greater than)", () => {
    expect(
      shouldAutoPause({
        status: "watching",
        lastWatchedAt: new Date(now.getTime() - 30 * DAY),
        autoPauseEnabled: true,
        now,
        thresholdDays: 30,
      }),
    ).toBe(false);
  });

  it("opt-out (autoPauseEnabled=false) never pauses", () => {
    expect(
      shouldAutoPause({
        status: "watching",
        lastWatchedAt: new Date(now.getTime() - 90 * DAY),
        autoPauseEnabled: false,
        now,
        thresholdDays: 30,
      }),
    ).toBe(false);
  });

  it("non-active statuses never auto-pause", () => {
    for (const s of ["completed", "paused", "dropped"] as WatchStatus[]) {
      expect(
        shouldAutoPause({
          status: s,
          lastWatchedAt: new Date(now.getTime() - 90 * DAY),
          autoPauseEnabled: true,
          now,
          thresholdDays: 30,
        }),
      ).toBe(false);
    }
  });

  it("plan_to_watch with marked episodes + inactivity pauses", () => {
    expect(
      shouldAutoPause({
        status: "plan_to_watch",
        lastWatchedAt: new Date(now.getTime() - 40 * DAY),
        autoPauseEnabled: true,
        now,
        thresholdDays: 30,
      }),
    ).toBe(true);
  });

  it("no watched episodes -> no pause", () => {
    expect(
      shouldAutoPause({
        status: "watching",
        lastWatchedAt: null,
        autoPauseEnabled: true,
        now,
        thresholdDays: 30,
      }),
    ).toBe(false);
  });

  it("respects a custom threshold via env-shaped option", () => {
    expect(
      shouldAutoPause({
        status: "watching",
        lastWatchedAt: new Date(now.getTime() - 10 * DAY),
        autoPauseEnabled: true,
        now,
        thresholdDays: 7,
      }),
    ).toBe(true);
  });
});

describe("auto-pause idempotency (rule level)", () => {
  it("a paused entry is not re-paused by a second evaluation", () => {
    const last = new Date(now.getTime() - 60 * DAY);
    const first = shouldAutoPause({
      status: "watching",
      lastWatchedAt: last,
      autoPauseEnabled: true,
      now,
      thresholdDays: 30,
    });
    expect(first).toBe(true);
    // After the transition is applied the status becomes "paused", so a later
    // run (e.g. a second daily job) yields no transition.
    const second = shouldAutoPause({
      status: "paused",
      lastWatchedAt: last,
      autoPauseEnabled: true,
      now,
      thresholdDays: 30,
    });
    expect(second).toBe(false);
  });
});
