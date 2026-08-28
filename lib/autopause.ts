import type { WatchStatus } from "@/lib/watchstatus";

export function getThresholdDays(): number {
  return Number(process.env.AUTOPAUSE_DAYS ?? 30);
}

export function daysSince(lastWatchedAt: Date | null, now: Date): number {
  return lastWatchedAt ? (now.getTime() - lastWatchedAt.getTime()) / 864e5 : Infinity;
}

export function shouldAutoPause(opts: {
  status: WatchStatus;
  lastWatchedAt: Date | null;
  autoPauseEnabled: boolean;
  now: Date;
  thresholdDays?: number;
}): boolean {
  if (!opts.autoPauseEnabled) return false;
  if (opts.status !== "watching" && opts.status !== "plan_to_watch") return false;
  if (!opts.lastWatchedAt) return false;
  return daysSince(opts.lastWatchedAt, opts.now) > (opts.thresholdDays ?? getThresholdDays());
}
